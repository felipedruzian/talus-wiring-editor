import { type Edge, type Node } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { rowTrace } from './board-trace';
import { inspectPhysicalLayout } from './physical-diagnostics';
import {
  EdgeTemplateType,
  NodeTemplateType,
  type BoardNodeData,
  type DeviceNodeData,
  type WireEdgeData,
} from './interfaces';

const board: Node<BoardNodeData> = {
  id: 'board',
  type: NodeTemplateType.BoardNode,
  position: { x: 0, y: 0 },
  data: {
    type: 'board',
    boardId: 'board',
    label: 'Board',
    rows: 2,
    cols: 3,
    pitch: 17,
    traces: [rowTrace('vcc', 'VCC rail', 0, 3, 'VCC')],
  },
};

const device: Node<DeviceNodeData> = {
  id: 'device',
  type: NodeTemplateType.DeviceNode,
  position: { x: 100, y: 0 },
  data: {
    type: 'device',
    deviceId: 'D1',
    manufacturer: '',
    model: '',
    ports: [{ id: 'p', label: 'P', direction: 'input' }],
  },
};

function edge(netName: string): Edge<WireEdgeData> {
  return {
    id: 'wire',
    type: EdgeTemplateType.WireEdge,
    source: device.id,
    sourcePort: 'p',
    target: board.id,
    targetPort: 'trace:vcc',
    data: { type: 'wire', wireId: 'W1', netId: 'imported-id', netName },
  };
}

describe('inspectPhysicalLayout', () => {
  it('reports an authored/copper divergence as a savable warning', () => {
    expect(inspectPhysicalLayout([board, device], [edge('AUTHORED')])).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'net-copper-divergence' }),
    );
  });

  it('does not warn when the authored name agrees with copper', () => {
    expect(inspectPhysicalLayout([board, device], [edge('VCC')])).toEqual([]);
  });

  it('reports competing authored names that one copper trace would merge', () => {
    const first = edge('ALPHA');
    const second = { ...edge('BETA'), id: 'wire-2' };
    expect(inspectPhysicalLayout([board, device], [first, second])).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'authored-net-merge' }),
    );
  });

  it('reports overlapping copper as an error with a board path', () => {
    const invalid = {
      ...board,
      data: {
        ...board.data,
        traces: [
          rowTrace('a', 'A', 0, 3, 'A'),
          { id: 'b', label: 'B', segments: [{ from: { row: 0, col: 1 }, to: { row: 1, col: 1 } }] },
        ],
      },
    };
    expect(inspectPhysicalLayout([invalid], [])).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'trace-overlap' }),
    );
  });
});
