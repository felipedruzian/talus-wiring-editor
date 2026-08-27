import { type Edge } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { diagramModel } from '../data';
import {
  CanonicalProjectError,
  fromCanonicalProject,
  toCanonicalProject,
  type CanonicalProjectV2,
} from './canonical-project';
import { parseCanonicalProject } from './canonical-project-parse';
import { electricallyEquivalent } from './electrical-equivalence';
import { isBoardNode, isDeviceNode } from './guards';
import { type WireEdgeData } from './interfaces';
import { OPERATIONAL_LIMITS } from './operational-limits.mjs';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value, got undefined');
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyV2(): CanonicalProjectV2 {
  return {
    formatVersion: 2,
    electrical: { components: [], junctions: [], cables: [], nets: [] },
    layout: { boards: [], components: [], junctions: [], conductors: [] },
  };
}

function canonicalCableBudgetProject(total: number): CanonicalProjectV2 {
  const project = emptyV2();
  let remaining = total;
  let index = 0;
  while (remaining >= 2) {
    const wireCount = Math.min(OPERATIONAL_LIMITS.maxWiresPerCable, remaining - 1);
    project.electrical.cables.push({ name: `C${index++}`, wireCount, colors: [] });
    remaining -= wireCount + 1;
  }
  if (remaining !== 0) throw new Error(`cannot represent entity budget ${total}`);
  return project;
}

function legacyTwoPointProject(): Record<string, unknown> {
  return {
    formatVersion: 1,
    boards: [],
    components: [
      {
        id: 'source',
        deviceId: 'SOURCE',
        manufacturer: '',
        model: '',
        position: { x: 0, y: 0 },
        pins: [{ id: 'out', label: 'OUT', direction: 'output' }],
      },
      {
        id: 'load',
        deviceId: 'LOAD',
        manufacturer: '',
        model: '',
        position: { x: 100, y: 0 },
        pins: [{ id: 'in', label: 'IN', direction: 'input' }],
      },
    ],
    nets: [
      {
        id: 'wire-a',
        wireId: 'W1',
        colorCode: 'RD',
        source: { componentId: 'source', pinId: 'out' },
        target: { componentId: 'load', pinId: 'in' },
      },
    ],
  };
}

describe('canonical project round-trip', () => {
  it('keeps electrical semantics separate from complementary visual geometry', () => {
    const project = toCanonicalProject(diagramModel.nodes, diagramModel.edges);

    expect(project.formatVersion).toBe(2);
    expect(project.electrical.nets).toHaveLength(2);
    expect(project.electrical.components).toHaveLength(2);
    expect(project.layout.boards).toHaveLength(1);
    expect(project.layout.components).toHaveLength(2);
    expect(project.layout.conductors).toHaveLength(2);
    expect(project.electrical).not.toHaveProperty('boards');
    expect(project.electrical.nets[0]).not.toHaveProperty('points');
  });

  it('preserves board, components, pins, cable color and manual route points', () => {
    const project = toCanonicalProject(diagramModel.nodes, diagramModel.edges);
    const rebuilt = fromCanonicalProject(project);

    expect(rebuilt.nodes.filter(isBoardNode)).toHaveLength(1);
    expect(rebuilt.nodes.filter(isDeviceNode)).toHaveLength(2);
    expect(rebuilt.edges).toHaveLength(diagramModel.edges.length);

    const board = must(rebuilt.nodes.find(isBoardNode));
    expect(board.data).toMatchObject({ rows: 6, cols: 11, pitch: 20 });

    const nano = must(
      rebuilt.nodes.find((node) => isDeviceNode(node) && node.data.deviceId === 'NANO-1'),
    );
    if (isDeviceNode(nano)) {
      expect(nano.data.ports.find((port) => port.label === 'D9')?.hole).toEqual({
        row: 1,
        col: 1,
      });
    }

    const pwm = must(rebuilt.edges.find((edge) => edge.data.wireId === 'W1'));
    expect(pwm.data.colorCode).toBe('YE');
    expect(typeof pwm.data.color).toBe('string');

    const manual = must(rebuilt.edges.find((edge) => edge.data.wireId === 'W2'));
    expect(manual.routingMode).toBe('manual');
    expect(manual.points).toEqual([
      { x: 178, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 150 },
      { x: 185, y: 150 },
    ]);
  });

  it('is stable under a second model round-trip', () => {
    const first = toCanonicalProject(diagramModel.nodes, diagramModel.edges);
    const rebuilt = fromCanonicalProject(first);
    expect(toCanonicalProject(rebuilt.nodes, rebuilt.edges, rebuilt.cableInventory)).toEqual(first);
  });

  it('keeps disconnected cables and unused slots outside the edge-only diagram model', () => {
    const first = emptyV2();
    first.electrical.cables.push({
      name: 'SPARE',
      wireCount: 3,
      colors: ['#a1b2c3', '', 'GY'],
      wireLabels: ['unused-a', '', 'unused-c'],
      notes: 'Disconnected inventory',
    });

    const rebuilt = fromCanonicalProject(first);
    const second = toCanonicalProject(rebuilt.nodes, rebuilt.edges, rebuilt.cableInventory);
    const lossy = toCanonicalProject(rebuilt.nodes, rebuilt.edges);

    expect(second).toEqual(first);
    expect(electricallyEquivalent(first.electrical, second.electrical)).toBe(true);
    expect(electricallyEquivalent(first.electrical, lossy.electrical)).toBe(false);

    const changedUnusedSlot = clone(first);
    const labels = changedUnusedSlot.electrical.cables[0].wireLabels;
    if (!labels) throw new Error('fixture has no wire labels');
    labels[1] = 'unexpected';
    expect(electricallyEquivalent(first.electrical, changedUnusedSlot.electrical)).toBe(false);
  });

  it('survives JSON stringify/parse without change', () => {
    const project = toCanonicalProject(diagramModel.nodes, diagramModel.edges);
    expect(JSON.parse(JSON.stringify(project))).toEqual(project);
  });

  it('rejects exporting a dangling edge', () => {
    const dangling = {
      ...diagramModel.edges[0],
      target: null,
      targetPort: null,
    } as unknown as Edge<WireEdgeData>;
    expect(() => toCanonicalProject(diagramModel.nodes, [dangling])).toThrow(CanonicalProjectError);
  });
});

describe('parseCanonicalProject', () => {
  const validProject = toCanonicalProject(diagramModel.nodes, diagramModel.edges);
  const validRaw: unknown = JSON.parse(JSON.stringify(validProject));

  it('accepts a valid v2 project and returns an equal, independent object', () => {
    expect(parseCanonicalProject(validRaw)).toEqual(validProject);
  });

  it('accepts an empty v2 project', () => {
    const empty = emptyV2();
    expect(parseCanonicalProject(clone(empty))).toEqual(empty);
  });

  it.each([
    ['below', OPERATIONAL_LIMITS.maxPinsPerComponent - 1, true],
    ['at', OPERATIONAL_LIMITS.maxPinsPerComponent, true],
    ['above', OPERATIONAL_LIMITS.maxPinsPerComponent + 1, false],
  ] as const)('enforces the pin-count limit %s the boundary', (_label, pinCount, accepted) => {
    const project = emptyV2();
    project.electrical.components.push({
      id: 'x1',
      deviceId: 'X1',
      manufacturer: '',
      model: '',
      pins: Array.from({ length: pinCount }, (_, index) => ({
        id: `p${index}`,
        label: `P${index}`,
        direction: 'output',
      })),
    });
    project.layout.components.push({ componentId: 'x1', position: { x: 0, y: 0 } });

    const parse = () => parseCanonicalProject(project);
    if (accepted) expect(parse).not.toThrow();
    else expect(parse).toThrow(/pin count.*operational limit/);
  });

  it.each([
    ['below', OPERATIONAL_LIMITS.maxWiresPerCable - 1, true],
    ['at', OPERATIONAL_LIMITS.maxWiresPerCable, true],
    ['above', OPERATIONAL_LIMITS.maxWiresPerCable + 1, false],
  ] as const)('enforces the wire-count limit %s the boundary', (_label, wireCount, accepted) => {
    const project = emptyV2();
    project.electrical.cables.push({ name: 'C', wireCount, colors: [] });
    const parse = () => parseCanonicalProject(project);
    if (accepted) expect(parse).not.toThrow();
    else expect(parse).toThrow(/wire count.*operational limit/);
  });

  it.each([
    ['below', OPERATIONAL_LIMITS.maxTotalEntities - 1, true],
    ['at', OPERATIONAL_LIMITS.maxTotalEntities, true],
    ['above', OPERATIONAL_LIMITS.maxTotalEntities + 1, false],
  ] as const)('enforces the total-entity limit %s the boundary', (_label, total, accepted) => {
    const parse = () => parseCanonicalProject(canonicalCableBudgetProject(total));
    if (accepted) expect(parse).not.toThrow();
    else expect(parse).toThrow(/total entity.*operational limit/);
  });

  it('rejects unsafe integer capacities and indexes', () => {
    const unsafeWireCount = emptyV2();
    unsafeWireCount.electrical.cables.push({
      name: 'C',
      wireCount: Number.MAX_SAFE_INTEGER + 1,
      colors: [],
    });
    expect(() => parseCanonicalProject(unsafeWireCount)).toThrow(/safe positive integer/);

    const unsafeBoard = clone(validProject);
    unsafeBoard.layout.boards[0].rows = Number.MAX_SAFE_INTEGER + 1;
    expect(() => parseCanonicalProject(unsafeBoard)).toThrow(/safe positive integer/);
  });

  it('migrates an empty v1 project to v2', () => {
    expect(
      parseCanonicalProject({ formatVersion: 1, boards: [], components: [], nets: [] }),
    ).toEqual(emptyV2());
  });

  it('migrates reused v1 pin references into one multi-drop net', () => {
    const migrated = parseCanonicalProject({
      formatVersion: 1,
      boards: [],
      components: [
        {
          id: 'source',
          deviceId: 'SOURCE',
          manufacturer: '',
          model: '',
          position: { x: 0, y: 0 },
          pins: [{ id: 'out', label: 'OUT', direction: 'output' }],
        },
        {
          id: 'load-a',
          deviceId: 'LOAD-A',
          manufacturer: '',
          model: '',
          position: { x: 100, y: 0 },
          pins: [{ id: 'in', label: 'IN', direction: 'input' }],
        },
        {
          id: 'load-b',
          deviceId: 'LOAD-B',
          manufacturer: '',
          model: '',
          position: { x: 100, y: 100 },
          pins: [{ id: 'in', label: 'IN', direction: 'input' }],
        },
      ],
      nets: [
        {
          id: 'wire-a',
          wireId: 'W1',
          source: { componentId: 'source', pinId: 'out' },
          target: { componentId: 'load-a', pinId: 'in' },
        },
        {
          id: 'wire-b',
          wireId: 'W2',
          source: { componentId: 'source', pinId: 'out' },
          target: { componentId: 'load-b', pinId: 'in' },
        },
      ],
    });

    expect(migrated.electrical.nets).toHaveLength(1);
    expect(migrated.electrical.nets[0].endpoints).toHaveLength(3);
    expect(migrated.electrical.nets[0].conductors).toHaveLength(2);
  });

  it('rejects a v1 wire whose two ends are the same endpoint', () => {
    const raw = legacyTwoPointProject();
    const nets = raw['nets'];
    if (!Array.isArray(nets) || typeof nets[0] !== 'object' || nets[0] === null) {
      throw new Error('legacy fixture has no net');
    }
    (nets[0] as Record<string, unknown>)['target'] = {
      componentId: 'source',
      pinId: 'out',
    };
    expect(() => parseCanonicalProject(raw)).toThrow(/both ends are the same endpoint/);
  });

  it('rejects conflicting effective colors for a reused v1 wire id', () => {
    const raw = legacyTwoPointProject();
    const nets = raw['nets'];
    if (!Array.isArray(nets) || typeof nets[0] !== 'object' || nets[0] === null) {
      throw new Error('legacy fixture has no net');
    }
    nets.push({
      ...(nets[0] as Record<string, unknown>),
      id: 'wire-b',
      colorCode: 'BU',
    });
    expect(() => parseCanonicalProject(raw)).toThrow(/cores contraditórias/);
  });

  it.each([
    ['root is not an object', 'not-an-object'],
    ['root is null', null],
    ['root is an array', []],
  ])('rejects when %s', (_label, raw) => {
    expect(() => parseCanonicalProject(raw)).toThrow(CanonicalProjectError);
  });

  it('rejects a missing formatVersion', () => {
    const raw = clone(validRaw) as Record<string, unknown>;
    delete raw['formatVersion'];
    expect(() => parseCanonicalProject(raw)).toThrow(/formatVersion/);
  });

  it('rejects an unsupported formatVersion', () => {
    const raw = clone(validRaw) as Record<string, unknown>;
    raw['formatVersion'] = 99;
    expect(() => parseCanonicalProject(raw)).toThrow(/formatVersion/);
  });

  it('rejects boards that are not an array', () => {
    const raw = clone(validRaw) as { layout: Record<string, unknown> };
    raw.layout['boards'] = {};
    expect(() => parseCanonicalProject(raw)).toThrow(/project\.layout\.boards/);
  });

  it('rejects a component with a non-string manufacturer', () => {
    const raw = clone(validRaw) as { electrical: { components: Record<string, unknown>[] } };
    raw.electrical.components[0]['manufacturer'] = 42;
    expect(() => parseCanonicalProject(raw)).toThrow(/manufacturer/);
  });

  it('rejects a non-finite position coordinate', () => {
    const raw = clone(validRaw) as {
      layout: { components: { position: Record<string, unknown> }[] };
    };
    raw.layout.components[0].position['x'] = 'not-a-number';
    expect(() => parseCanonicalProject(raw)).toThrow(CanonicalProjectError);
  });

  it('rejects a board id that collides with a component id', () => {
    const raw = clone(validRaw) as {
      electrical: { components: { id: string }[] };
      layout: { boards: { id: string }[] };
    };
    raw.layout.boards[0].id = raw.electrical.components[0].id;
    expect(() => parseCanonicalProject(raw)).toThrow(/duplicate node id/);
  });

  it('rejects two nets with the same id', () => {
    const raw = clone(validRaw) as { electrical: { nets: { id: string }[] } };
    raw.electrical.nets[1].id = raw.electrical.nets[0].id;
    expect(() => parseCanonicalProject(raw)).toThrow(/duplicate id/);
  });

  it('rejects two pins with the same id on one component', () => {
    const raw = clone(validRaw) as {
      electrical: { components: { pins: { id: string }[] }[] };
    };
    const component = raw.electrical.components.find((candidate) => candidate.pins.length >= 2);
    if (!component) throw new Error('fixture has no component with at least two pins');
    component.pins[1].id = component.pins[0].id;
    expect(() => parseCanonicalProject(raw)).toThrow(/duplicate id/);
  });

  it('rejects a net endpoint referencing a non-existent component', () => {
    const raw = clone(validRaw) as {
      electrical: { nets: { endpoints: { componentId?: string }[] }[] };
    };
    const endpoint = raw.electrical.nets[0].endpoints.find((candidate) => candidate.componentId);
    if (!endpoint) throw new Error('fixture has no component endpoint');
    endpoint.componentId = 'no-such-component';
    expect(() => parseCanonicalProject(raw)).toThrow(/no component/);
  });

  it('rejects a net endpoint referencing a non-existent pin', () => {
    const raw = clone(validRaw) as {
      electrical: { nets: { endpoints: { pinId?: string }[] }[] };
    };
    const endpoint = raw.electrical.nets[0].endpoints.find((candidate) => candidate.pinId);
    if (!endpoint) throw new Error('fixture has no pin endpoint');
    endpoint.pinId = 'no-such-pin';
    expect(() => parseCanonicalProject(raw)).toThrow(/has no pin/);
  });

  it("rejects a pin hole that does not fit its component's declared board", () => {
    const raw = clone(validRaw) as {
      layout: { components: { pinHoles?: { hole: { row: number } }[] }[] };
    };
    const placement = raw.layout.components.flatMap((component) => component.pinHoles ?? [])[0];
    if (!placement) throw new Error('fixture has no pin placement');
    placement.hole.row = 9999;
    expect(() => parseCanonicalProject(raw)).toThrow(/does not fit board/);
  });

  it('rejects a component with a hole but no boardId', () => {
    const raw = clone(validRaw) as {
      layout: { components: { boardId?: string; pinHoles?: unknown[] }[] };
    };
    const component = raw.layout.components.find((candidate) => candidate.pinHoles?.length);
    if (!component) throw new Error('fixture has no component with a hole');
    delete component.boardId;
    expect(() => parseCanonicalProject(raw)).toThrow(/no boardId/);
  });

  it('rejects a component boardId that does not match any board', () => {
    const raw = clone(validRaw) as { layout: { components: { boardId?: string }[] } };
    const component = raw.layout.components.find((candidate) => candidate.boardId !== undefined);
    if (!component) throw new Error('fixture has no component with a boardId');
    component.boardId = 'no-such-board';
    expect(() => parseCanonicalProject(raw)).toThrow(/does not match any board/);
  });

  it('rejects a non-positive board pitch', () => {
    const raw = clone(validRaw) as { layout: { boards: { pitch: number }[] } };
    raw.layout.boards[0].pitch = 0;
    expect(() => parseCanonicalProject(raw)).toThrow(/pitch/);
  });

  it('rejects a negative hole coordinate', () => {
    const raw = clone(validRaw) as {
      layout: { components: { pinHoles?: { hole: { row: number } }[] }[] };
    };
    const placement = raw.layout.components.flatMap((component) => component.pinHoles ?? [])[0];
    if (!placement) throw new Error('fixture has no pin placement');
    placement.hole.row = -1;
    expect(() => parseCanonicalProject(raw)).toThrow(CanonicalProjectError);
  });

  it('accepts only manual as an explicit persisted routing mode', () => {
    const manual = clone(validRaw) as {
      layout: { conductors: { routingMode?: string }[] };
    };
    manual.layout.conductors[0].routingMode = 'manual';
    expect(() => parseCanonicalProject(manual)).not.toThrow();

    const automatic = clone(validRaw) as {
      layout: { conductors: { routingMode?: string }[] };
    };
    automatic.layout.conductors[0].routingMode = 'auto';
    expect(() => parseCanonicalProject(automatic)).toThrow(/routingMode/);
  });

  it('rejects an invalid pin direction', () => {
    const raw = clone(validRaw) as {
      electrical: { components: { pins: { direction: string }[] }[] };
    };
    raw.electrical.components[0].pins[0].direction = 'inout';
    expect(() => parseCanonicalProject(raw)).toThrow(/direction/);
  });

  it('normalizes short cable color and wirelabel arrays to every declared slot', () => {
    const raw = emptyV2();
    raw.electrical.cables.push({
      name: 'C',
      wireCount: 3,
      colors: ['RD'],
      wireLabels: ['feed'],
    });

    expect(parseCanonicalProject(raw).electrical.cables[0]).toMatchObject({
      colors: ['RD', '', ''],
      wireLabels: ['feed', '', ''],
    });
  });

  it('accepts a valid internal WireViz loop and rejects a cable-backed loop', () => {
    const loopProject = emptyV2();
    loopProject.electrical.components.push({
      id: 'x1',
      deviceId: 'X1',
      manufacturer: '',
      model: '',
      pins: [
        { id: 'a', label: 'A', direction: 'output' },
        { id: 'b', label: 'B', direction: 'output' },
      ],
    });
    loopProject.electrical.nets.push({
      id: 'loop-net',
      name: '',
      endpoints: [
        { kind: 'pin', componentId: 'x1', pinId: 'a' },
        { kind: 'pin', componentId: 'x1', pinId: 'b' },
      ],
      conductors: [
        {
          id: 'loop',
          from: { kind: 'pin', componentId: 'x1', pinId: 'a' },
          to: { kind: 'pin', componentId: 'x1', pinId: 'b' },
          wirevizLoop: true,
        },
      ],
    });
    loopProject.layout.components.push({ componentId: 'x1', position: { x: 0, y: 0 } });
    loopProject.layout.conductors.push({ conductorId: 'loop' });

    expect(parseCanonicalProject(clone(loopProject))).toEqual(loopProject);

    const cableBacked = clone(loopProject);
    cableBacked.electrical.cables.push({ name: 'C', wireCount: 1, colors: ['RD'] });
    cableBacked.electrical.nets[0].conductors[0].cable = { name: 'C', wireIndex: 1 };
    expect(() => parseCanonicalProject(cableBacked)).toThrow(/loop cannot reference a cable/);
  });

  it('rejects canonical or dangerous keys in preserved WireViz extras', () => {
    const reserved = clone(validProject);
    reserved.electrical.components[0].wirevizExtras = { type: 'override' };
    expect(() => parseCanonicalProject(reserved)).toThrow(/cannot replace a canonical/);

    const dangerous = clone(validProject);
    dangerous.electrical.components[0].wirevizExtras = { x: { prototype: 'bad' } };
    expect(() => parseCanonicalProject(dangerous)).toThrow(/dangerous key/);
  });
});
