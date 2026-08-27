import { describe, expect, it } from 'vitest';
import {
  fromCanonicalProject,
  type CanonicalComponent,
  type CanonicalElectrical,
  type CanonicalProjectV2,
} from '../diagram/model/canonical-project';
import {
  diffSnapshots,
  electricallyEquivalent,
  toElectricalSnapshot,
} from '../diagram/model/electrical-equivalence';
import { isJunctionNode } from '../diagram/model/guards';
import {
  MINIMAL_TWO_NETS_PLACEMENT,
  MINIMAL_TWO_NETS_WIREVIZ_YAML,
} from './fixtures/minimal-two-nets.fixture';
import {
  MULTIDROP_EXISTING_RAIL,
  MULTIDROP_RAIL_PLACEMENT,
  MULTIDROP_RAIL_WIREVIZ_YAML,
} from './fixtures/multidrop-rail.fixture';
import { exportWireViz, WireVizExportError } from './export-wireviz';
import { importWireViz } from './import-wireviz';
import { entriesWithCode } from './wireviz-report';
import { WireVizImportError, type WireVizImportOptions } from './wireviz-to-diagram';
import { stringifyYamlSubset } from './wireviz-yaml-emit';
import { parseYamlSubset, type YamlValue } from './wireviz-yaml';

function tracerComponents(): CanonicalComponent[] {
  return [
    {
      id: 'nano-1',
      deviceId: 'NANO-1',
      manufacturer: 'Arduino',
      model: 'Nano',
      pins: [
        { id: 'd8', label: 'D8', direction: 'output' },
        { id: 'd9', label: 'D9', direction: 'output' },
      ],
    },
    {
      id: 'tb6612-1',
      deviceId: 'DRV-1',
      manufacturer: 'Toshiba',
      model: 'TB6612FNG',
      pins: [
        { id: 'pwma', label: 'PWMA', direction: 'input' },
        { id: 'ain1', label: 'AIN1', direction: 'input' },
      ],
    },
  ];
}

function importMultidrop() {
  return importWireViz(MULTIDROP_RAIL_WIREVIZ_YAML, {
    placement: MULTIDROP_RAIL_PLACEMENT,
    junctions: [MULTIDROP_EXISTING_RAIL],
  });
}

/**
 * Supplies only local identity needed to preserve editor ids and placement.
 * No connector/cable metadata is copied from the first import: every WireViz
 * field in the result must therefore have survived the emitted YAML.
 */
function identitySkeleton(electrical: CanonicalElectrical): WireVizImportOptions {
  const placement: Record<string, string> = {};
  for (const component of electrical.components) {
    placement[component.wirevizName ?? component.deviceId] = component.id;
  }
  for (const junction of electrical.junctions) {
    placement[junction.wirevizName ?? junction.label] = junction.id;
  }

  return {
    placement,
    components: electrical.components.map((component) => ({
      id: component.id,
      deviceId: component.deviceId,
      manufacturer: component.manufacturer,
      model: component.model,
      category: component.category,
      location: component.location,
      pins: component.pins.map((pin) => ({
        id: pin.id,
        label: pin.label,
        direction: pin.direction,
        connectorType: pin.connectorType,
        wirevizDesignator: pin.wirevizDesignator,
      })),
    })),
    junctions: electrical.junctions.map((junction) => ({
      id: junction.id,
      label: junction.label,
      kind: junction.kind,
    })),
  };
}

function reimportWithIdentity(electrical: CanonicalElectrical, yaml: string): CanonicalElectrical {
  return importWireViz(yaml, identitySkeleton(electrical)).electrical;
}

describe('wirevizToElectrical', () => {
  it('creates two point-to-point nets from the issue #1 fixture', () => {
    const imported = importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML, {
      placement: MINIMAL_TWO_NETS_PLACEMENT,
      components: tracerComponents(),
    });

    expect(imported.electrical.nets).toHaveLength(2);
    expect(imported.electrical.nets.flatMap((net) => net.conductors)).toHaveLength(2);
  });

  it('connects the correct placed component pins and resolves colors', () => {
    const imported = importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML, {
      placement: MINIMAL_TWO_NETS_PLACEMENT,
      components: tracerComponents(),
    });
    const conductors = imported.electrical.nets.flatMap((net) => net.conductors);
    const pwm = conductors.find((conductor) => conductor.cable?.name === 'W1');

    expect(pwm).toMatchObject({
      from: { kind: 'pin', componentId: 'nano-1', pinId: 'd9' },
      to: { kind: 'pin', componentId: 'tb6612-1', pinId: 'pwma' },
      cable: { name: 'W1', wireIndex: 1 },
    });
    expect(imported.electrical.cables.find((cable) => cable.name === 'W1')?.colors).toEqual(['YE']);
  });

  it('imports one rail fan-out as one four-endpoint net', () => {
    const imported = importMultidrop();
    const net = imported.electrical.nets[0];

    expect(imported.electrical.nets).toHaveLength(1);
    expect(net.endpoints).toHaveLength(4);
    expect(net.conductors).toHaveLength(3);
    expect(imported.electrical.junctions).toContainEqual(
      expect.objectContaining({ id: 'rail-5v', kind: 'rail', wirevizSubtype: 'screw-rail' }),
    );
    expect(entriesWithCode(imported.report, 'multidrop-net')).toHaveLength(1);
  });

  it('materializes the rail as a selectable junction node with visual taps', () => {
    const electrical = importMultidrop().electrical;
    const net = electrical.nets[0];
    const project: CanonicalProjectV2 = {
      formatVersion: 2,
      electrical,
      layout: {
        boards: [],
        components: electrical.components.map((component, index) => ({
          componentId: component.id,
          position: { x: index * 120, y: 0 },
        })),
        junctions: [{ junctionId: 'rail-5v', position: { x: 180, y: 100 }, taps: 3 }],
        conductors: net.conductors.map((conductor, index) => ({
          conductorId: conductor.id,
          fromTap: conductor.from.kind === 'junction' ? index : undefined,
          toTap: conductor.to.kind === 'junction' ? index : undefined,
        })),
      },
    };

    const model = fromCanonicalProject(project);
    const rail = model.nodes.find(isJunctionNode);
    expect(rail?.data).toMatchObject({ kind: 'rail', taps: 3 });
    expect(
      model.edges
        .flatMap((edge) => [edge.sourcePort, edge.targetPort])
        .filter((port) => port?.startsWith('tap-'))
        .sort(),
    ).toEqual(['tap-0', 'tap-1', 'tap-2']);
  });

  it('rejects two connectors explicitly placed onto the same element', () => {
    expect(() =>
      importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML, {
        placement: { NANO: 'same', TB6612FNG: 'same' },
      }),
    ).toThrow(WireVizImportError);
  });

  it('derives collision-free connector ids independently of mapping order', () => {
    const connections: YamlValue = [[{ 'A/B': ['P'] }, { C: [1] }, { 'A B': ['P'] }]];
    const first = importWireViz(
      stringifyYamlSubset({
        connectors: { 'A/B': { pins: ['P'] }, 'A B': { pins: ['P'] } },
        cables: { C: { wirecount: 1 } },
        connections,
      }),
    ).electrical;
    const second = importWireViz(
      stringifyYamlSubset({
        connectors: { 'A B': { pins: ['P'] }, 'A/B': { pins: ['P'] } },
        cables: { C: { wirecount: 1 } },
        connections,
      }),
    ).electrical;

    expect(second.components.map((component) => component.id).sort()).toEqual(
      first.components.map((component) => component.id).sort(),
    );
    expect(electricallyEquivalent(first, second)).toBe(true);
  });
});

describe('WireViz electrical round-trip', () => {
  it('preserves multi-drop connectivity, pins, variants and the complete cable inventory', () => {
    const first = importMultidrop().electrical;
    const exported = exportWireViz(first);
    const second = reimportWithIdentity(first, exported.yaml);

    expect(electricallyEquivalent(first, second)).toBe(true);
    expect(toElectricalSnapshot(second)).toEqual(toElectricalSnapshot(first));
    expect(second.cables.find((cable) => cable.name === 'HARNESS')).toMatchObject({
      wireCount: 3,
      colors: ['RD', 'YE', 'BU'],
      wireLabels: ['feed', 'sensor', 'motor'],
      gauge: '0.50 mm2',
      length: '0.25 m',
      notes: 'Main 5 V fan-out',
    });
    expect(second.cables.find((cable) => cable.name === 'SPARE')).toMatchObject({
      wireCount: 2,
      colors: ['#a1b2c3', 'GY'],
      wireLabels: ['unused-a', 'unused-b'],
      notes: 'Disconnected spare cable',
    });
    expect(second.components.find((component) => component.id === 'supply')).toMatchObject({
      wirevizSubtype: 'female',
      wirevizColor: 'BK',
      wirevizManufacturer: 'Amass',
      wirevizMpn: 'XT30U-F',
      wirevizShowName: false,
      wirevizExtras: { 'x-source-tag': '1' },
    });
  });

  it('compares equal after reversing textual connection order', () => {
    const raw = parseYamlSubset(MULTIDROP_RAIL_WIREVIZ_YAML) as Record<string, YamlValue>;
    const connections = raw['connections'];
    if (!Array.isArray(connections)) throw new Error('fixture has no connections list');
    raw['connections'] = [...connections].reverse();

    const first = importMultidrop().electrical;
    const reordered = importWireViz(stringifyYamlSubset(raw), {
      placement: MULTIDROP_RAIL_PLACEMENT,
      junctions: [MULTIDROP_EXISTING_RAIL],
    }).electrical;

    expect(electricallyEquivalent(first, reordered)).toBe(true);
  });

  it('preserves and re-emits an exact six-digit WireViz RGB value without warning', () => {
    const first = importMultidrop().electrical;
    const exported = exportWireViz(first);
    const second = reimportWithIdentity(first, exported.yaml);

    expect(entriesWithCode(exported.report, 'color-not-representable')).toHaveLength(0);
    expect(exported.yaml).toContain('"#a1b2c3"');
    expect(second.cables.find((cable) => cable.name === 'SPARE')?.colors[0]).toBe('#a1b2c3');
    expect(electricallyEquivalent(first, second)).toBe(true);
  });

  it('warns only for a CSS hex shape WireViz cannot represent and never approximates it', () => {
    const electrical = structuredClone(importMultidrop().electrical);
    const spare = electrical.cables.find((cable) => cable.name === 'SPARE');
    if (!spare) throw new Error('fixture has no SPARE cable');
    spare.colors[0] = '#abc';

    const exported = exportWireViz(electrical);
    expect(entriesWithCode(exported.report, 'color-not-representable')).toHaveLength(1);
    expect(spare.colors[0]).toBe('#abc');
    expect(exported.yaml).not.toContain('#abc');
  });

  it('fails equivalence after a real emitted-document mutation removes a disconnected cable', () => {
    const first = importMultidrop().electrical;
    const exported = exportWireViz(first);
    const document = parseYamlSubset(exported.yaml);
    if (typeof document !== 'object' || document === null || Array.isArray(document)) {
      throw new Error('export did not produce a mapping');
    }
    const cables = document['cables'];
    if (typeof cables !== 'object' || cables === null || Array.isArray(cables)) {
      throw new Error('export did not produce a cables mapping');
    }
    delete cables['SPARE'];

    const mutated = reimportWithIdentity(first, stringifyYamlSubset(document));
    expect(electricallyEquivalent(first, mutated)).toBe(false);
    expect(diffSnapshots(toElectricalSnapshot(first), toElectricalSnapshot(mutated))).toContain(
      'cable missing on the right: "SPARE"',
    );
  });

  it('round-trips WireViz loops as explicit internal connectivity', () => {
    const yaml = stringifyYamlSubset({
      connectors: {
        X1: {
          pins: [1, 2, 3],
          pinlabels: ['INPUT', 'RAIL-A', 'RAIL-B'],
          loops: [['RAIL-A', 'RAIL-B']],
        },
      },
      connections: [],
    });
    const first = importWireViz(yaml).electrical;
    const exported = exportWireViz(first);
    const second = reimportWithIdentity(first, exported.yaml);

    expect(first.nets[0].conductors[0].wirevizLoop).toBe(true);
    expect(exported.yaml).toContain('loops:');
    expect(entriesWithCode(exported.report, 'loop-emitted')).toHaveLength(1);
    expect(electricallyEquivalent(first, second)).toBe(true);
  });

  it('preserves explicitly declared pinlabels even when they equal the designators', () => {
    const yaml = stringifyYamlSubset({
      connectors: {
        A: { pins: ['P'], pinlabels: ['P'] },
        B: { pins: ['P'] },
      },
      connections: [[{ A: ['P'] }, '--', { B: ['P'] }]],
    });
    const first = importWireViz(yaml).electrical;
    const exported = exportWireViz(first);
    const second = reimportWithIdentity(first, exported.yaml);

    expect(exported.yaml).toContain('pinlabels:');
    expect(electricallyEquivalent(first, second)).toBe(true);
  });

  it('rejects export when preserved designators and pinlabels collide', () => {
    const yaml = stringifyYamlSubset({
      connectors: {
        A: { pins: [1, 2], pinlabels: ['SAFE', '1'] },
        B: { pins: ['P'] },
      },
      connections: [[{ A: [2] }, '--', { B: ['P'] }]],
    });
    const electrical = importWireViz(yaml).electrical;
    expect(() => exportWireViz(electrical)).toThrow(WireVizExportError);
  });

  it('never lets preserved extras overwrite canonical fields or carry dangerous keys', () => {
    const reserved = structuredClone(importMultidrop().electrical);
    reserved.components[0].wirevizExtras = { pins: ['override'] };
    expect(() => exportWireViz(reserved)).toThrow(/cannot replace a canonical/);

    const dangerous = structuredClone(importMultidrop().electrical);
    dangerous.cables[0].wirevizExtras = { x: { constructor: 'bad' } };
    expect(() => exportWireViz(dangerous)).toThrow(/dangerous key/);
  });

  it('rejects WireViz name collisions instead of silently changing connector identity', () => {
    const cableCollision = structuredClone(importMultidrop().electrical);
    cableCollision.components[0].wirevizName = 'HARNESS';
    expect(() => exportWireViz(cableCollision)).toThrow(/collides/);

    const connectorCollision = structuredClone(importMultidrop().electrical);
    connectorCollision.components[0].wirevizName = 'SAME';
    connectorCollision.components[1].wirevizName = 'SAME';
    expect(() => exportWireViz(connectorCollision)).toThrow(/collides/);

    const dangerousName = structuredClone(importMultidrop().electrical);
    dangerousName.components[0].wirevizName = '__proto__';
    expect(() => exportWireViz(dangerousName)).toThrow(/dangerous mapping name/);
  });

  it('rejects an empty connector instead of emitting YAML the importer cannot read', () => {
    const electrical = structuredClone(importMultidrop().electrical);
    electrical.components[0].pins = [];
    expect(() => exportWireViz(electrical)).toThrow(/expected at least one pin/);
  });

  it('round-trips a direct pin link with its WireViz arrow', () => {
    const yaml = stringifyYamlSubset({
      connectors: { A: { pins: ['P'] }, B: { pins: ['P'] } },
      connections: [[{ A: ['P'] }, '-->', { B: ['P'] }]],
    });
    const first = importWireViz(yaml).electrical;
    const exported = exportWireViz(first);
    const second = reimportWithIdentity(first, exported.yaml);

    expect(first.nets[0].conductors[0].wirevizLink).toBe('-->');
    expect(electricallyEquivalent(first, second)).toBe(true);
  });
});
