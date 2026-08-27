import { type Node, type Port } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { portFlowPosition } from './port-position';

function measuredNode(port: Port): Node {
  return {
    id: 'node-1',
    position: { x: 100, y: 200 },
    data: {},
    measuredPorts: [port],
  };
}

describe('portFlowPosition', () => {
  it('uses the measured left edge and vertical center for a centerLeft physical port', () => {
    const node = measuredNode({
      id: 'hole:0:0',
      nodeId: 'node-1',
      type: 'both',
      side: 'left',
      position: { x: 16, y: 11 },
      size: { width: 14, height: 14 },
    });

    expect(portFlowPosition(node, 'hole:0:0')).toEqual({ x: 116, y: 218 });
  });

  it.each([
    ['right', { x: 130, y: 227 }],
    ['top', { x: 123, y: 220 }],
    ['bottom', { x: 123, y: 234 }],
  ] as const)('anchors the %s side of a measured port box', (side, expected) => {
    const node = measuredNode({
      id: `port-${side}`,
      nodeId: 'node-1',
      type: 'both',
      side,
      position: { x: 16, y: 20 },
      size: { width: 14, height: 14 },
    });

    expect(portFlowPosition(node, `port-${side}`)).toEqual(expected);
  });
});
