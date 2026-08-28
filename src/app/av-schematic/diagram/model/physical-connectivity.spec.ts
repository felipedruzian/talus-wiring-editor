import { type Edge, type Node } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { rowTrace } from './board-trace';
import { type Footprint } from './footprint';
import {
  initialNetNameFromCopper,
  physicalEdgeNet,
  physicalEndpoint,
  physicalNetLabelForEndpoint,
} from './physical-connectivity';
import {
  EdgeTemplateType,
  NodeTemplateType,
  type AvSchematicNodeData,
  type BoardNodeData,
  type DeviceNodeData,
  type WireEdgeData,
} from './interfaces';

const inlineFootprint: Footprint = {
  id: 'inline-link',
  label: 'Inline link',
  rows: 1,
  cols: 3,
  pins: [
    { id: 'a', label: 'A', cell: { row: 0, col: 0 } },
    { id: 'b', label: 'B', cell: { row: 0, col: 2 } },
  ],
  shapes: [],
  bodyCells: [
    { row: 0, col: 0 },
    { row: 0, col: 2 },
  ],
};

const board: Node<BoardNodeData> = {
  id: 'board-17',
  type: NodeTemplateType.BoardNode,
  position: { x: 20, y: 30 },
  data: {
    type: 'board',
    boardId: 'board-17',
    label: 'Board 17',
    rows: 3,
    cols: 4,
    pitch: 17,
    traces: [rowTrace('vcc', 'L1', 0, 4, 'VCC'), rowTrace('gnd', 'L3', 2, 4, 'GND')],
  },
};

const component: Node<DeviceNodeData> = {
  id: 'component-1',
  type: NodeTemplateType.FootprintNode,
  position: { x: 0, y: 0 },
  data: {
    type: 'device',
    deviceId: 'R1',
    manufacturer: 'generic',
    model: 'link',
    boardId: 'board-17',
    footprintId: inlineFootprint.id,
    footprint: inlineFootprint,
    placement: { boardId: 'board-17', anchor: { row: 0, col: 0 }, rotation: 0 },
    ports: [
      { id: 'a', label: 'A', direction: 'input' },
      { id: 'b', label: 'B', direction: 'output' },
    ],
  },
};

const nodes: Node<AvSchematicNodeData>[] = [board, component];

function edgeTo(targetPort: string): Edge<WireEdgeData> {
  return {
    id: `wire-${targetPort}`,
    type: EdgeTemplateType.WireEdge,
    source: component.id,
    sourcePort: 'a',
    target: board.id,
    targetPort,
    data: { type: 'wire', wireId: 'W1' },
  };
}

describe('physical connectivity', () => {
  it('resolves a placed pin through its hole and copper trace to a net', () => {
    expect(physicalEndpoint(nodes, component.id, 'a')).toEqual({
      boardId: 'board-17',
      hole: { row: 0, col: 0 },
      traceId: 'vcc',
      traceLabel: 'L1',
      netLabel: 'VCC',
    });
    expect(physicalNetLabelForEndpoint(nodes, component.id, 'a')).toBe('VCC');
  });

  it('keeps hand-addressed v2 pins connected without a footprint placement', () => {
    const handAddressed: Node<DeviceNodeData> = {
      ...component,
      id: 'manual-pin',
      type: NodeTemplateType.DeviceNode,
      data: {
        ...component.data,
        footprintId: undefined,
        footprint: undefined,
        placement: undefined,
        boardId: board.data.boardId,
        ports: [{ id: 'a', label: 'A', direction: 'input', hole: { row: 2, col: 1 } }],
      },
    };

    expect(physicalEndpoint([board, handAddressed], handAddressed.id, 'a')).toMatchObject({
      boardId: 'board-17',
      hole: { row: 2, col: 1 },
      traceId: 'gnd',
      netLabel: 'GND',
    });
  });

  it('resolves board hole and trace endpoints without a side table', () => {
    expect(physicalEndpoint(nodes, board.id, 'hole:0:2')).toMatchObject({
      boardId: 'board-17',
      hole: { row: 0, col: 2 },
      traceId: 'vcc',
      netLabel: 'VCC',
    });
    expect(physicalEndpoint(nodes, board.id, 'trace:gnd')).toMatchObject({
      boardId: 'board-17',
      hole: { row: 2, col: 0 },
      traceId: 'gnd',
      netLabel: 'GND',
    });
    expect(physicalEndpoint(nodes, board.id, 'hole:1:1')).toMatchObject({
      boardId: 'board-17',
      hole: { row: 1, col: 1 },
      netLabel: undefined,
    });
  });

  it('infers one physical edge net and reports incompatible copper endpoints', () => {
    expect(physicalEdgeNet(nodes, edgeTo('hole:0:3'))).toEqual({
      netLabel: 'VCC',
      conflict: [],
    });
    expect(physicalEdgeNet(nodes, edgeTo('trace:gnd'))).toEqual({
      conflict: ['VCC', 'GND'],
    });
  });

  it('uses copper only as a fallback and preserves an authored/imported net name', () => {
    expect(initialNetNameFromCopper(undefined, { netLabel: 'GND', conflict: [] })).toBe('GND');
    expect(initialNetNameFromCopper(undefined, { conflict: ['GND', 'VCC'] })).toBeUndefined();
    expect(initialNetNameFromCopper('AUTHORED', { netLabel: 'GND', conflict: [] })).toBe(
      'AUTHORED',
    );
  });
});
