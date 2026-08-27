import { type Node } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { type DeviceNodeData } from '../diagram/model/interfaces';
import {
  MINIMAL_TWO_NETS_PLACEMENT,
  MINIMAL_TWO_NETS_WIREVIZ_YAML,
} from './fixtures/minimal-two-nets.fixture';
import { importWireViz } from './import-wireviz';
import { type WireVizDocument } from './wireviz-model';
import { WireVizImportError, wirevizConnectionsToEdges } from './wireviz-to-diagram';

function nanoNode(): Node<DeviceNodeData> {
  return {
    id: 'nano-1',
    type: 'deviceNode',
    position: { x: 0, y: 0 },
    data: {
      type: 'device',
      deviceId: 'NANO-1',
      manufacturer: 'Arduino',
      model: 'Nano',
      ports: [
        { id: 'd8', label: 'D8', direction: 'output' },
        { id: 'd9', label: 'D9', direction: 'output' },
      ],
    },
  };
}

function tb6612Node(): Node<DeviceNodeData> {
  return {
    id: 'tb6612-1',
    type: 'deviceNode',
    position: { x: 200, y: 0 },
    data: {
      type: 'device',
      deviceId: 'DRV-1',
      manufacturer: 'Toshiba',
      model: 'TB6612FNG',
      ports: [
        { id: 'pwma', label: 'PWMA', direction: 'input' },
        { id: 'ain1', label: 'AIN1', direction: 'input' },
      ],
    },
  };
}

function nodesById(): Map<string, Node<DeviceNodeData>> {
  return new Map([
    ['nano-1', nanoNode()],
    ['tb6612-1', tb6612Node()],
  ]);
}

describe('wirevizConnectionsToEdges', () => {
  it('creates exactly two edges from the minimal fixture', () => {
    const doc = importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML);
    const edges = wirevizConnectionsToEdges(doc, MINIMAL_TWO_NETS_PLACEMENT, nodesById());
    expect(edges).toHaveLength(2);
  });

  it('connects the correct source/target ports for each net', () => {
    const doc = importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML);
    const edges = wirevizConnectionsToEdges(doc, MINIMAL_TWO_NETS_PLACEMENT, nodesById());

    const pwm = edges.find((e) => e.data.wireId === 'W1');
    expect(pwm).toMatchObject({
      source: 'nano-1',
      sourcePort: 'd9',
      target: 'tb6612-1',
      targetPort: 'pwma',
    });

    const dir = edges.find((e) => e.data.wireId === 'W2');
    expect(dir).toMatchObject({
      source: 'nano-1',
      sourcePort: 'd8',
      target: 'tb6612-1',
      targetPort: 'ain1',
    });
  });

  it('resolves each net color from the WireViz color code', () => {
    const doc = importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML);
    const edges = wirevizConnectionsToEdges(doc, MINIMAL_TWO_NETS_PLACEMENT, nodesById());

    expect(edges.find((e) => e.data.wireId === 'W1')?.data.colorCode).toBe('YE');
    expect(edges.find((e) => e.data.wireId === 'W2')?.data.colorCode).toBe('OR');
    expect(edges.every((e) => typeof e.data.color === 'string')).toBe(true);
  });

  it('throws when a connector has no placement', () => {
    const doc = importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML);
    expect(() => wirevizConnectionsToEdges(doc, {}, nodesById())).toThrow(WireVizImportError);
  });

  it('throws when a pin has no matching port on the placed node', () => {
    const doc = importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML);
    const nodes = nodesById();
    nodes.set('tb6612-1', {
      ...tb6612Node(),
      data: { ...tb6612Node().data, ports: [] },
    });
    expect(() => wirevizConnectionsToEdges(doc, MINIMAL_TWO_NETS_PLACEMENT, nodes)).toThrow(
      WireVizImportError,
    );
  });

  it('generates unique, deterministic edge and net ids per conductor of a multicolored cable', () => {
    // One cable ("W3"), two wires (RD, BK), each used by its own connection —
    // the shape WireViz uses for a multi-conductor cable between two
    // connectors. Both connections reference the same cable name.
    const doc: WireVizDocument = {
      connectors: [
        { name: 'NANO', pins: ['D8', 'D9'] },
        { name: 'TB6612FNG', pins: ['PWMA', 'AIN1'] },
      ],
      cables: [{ name: 'W3', colors: ['RD', 'BK'] }],
      connections: [
        {
          source: { connector: 'NANO', pin: 'D9' },
          target: { connector: 'TB6612FNG', pin: 'PWMA' },
          cable: { name: 'W3', wireIndex: 1 },
        },
        {
          source: { connector: 'NANO', pin: 'D8' },
          target: { connector: 'TB6612FNG', pin: 'AIN1' },
          cable: { name: 'W3', wireIndex: 2 },
        },
      ],
    };

    const edges = wirevizConnectionsToEdges(doc, MINIMAL_TWO_NETS_PLACEMENT, nodesById());
    expect(edges).toHaveLength(2);

    const ids = edges.map((e) => e.id);
    const netIds = edges.map((e) => e.data.netId);
    expect(new Set(ids).size).toBe(2);
    expect(new Set(netIds).size).toBe(2);
    // Both edges still share the same wireId (the cable name), matching WireViz semantics.
    expect(edges.every((e) => e.data.wireId === 'W3')).toBe(true);

    const again = wirevizConnectionsToEdges(doc, MINIMAL_TWO_NETS_PLACEMENT, nodesById());
    expect(again.map((e) => e.id)).toEqual(ids);
    expect(again.map((e) => e.data.netId)).toEqual(netIds);
  });
});
