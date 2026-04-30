import { describe, expect, it } from 'vitest';
import { type Edge, type Node } from 'ng-diagram';
import { getEdgePortOrientations, portSideToOrientation } from './port-orientation';

describe('portSideToOrientation', () => {
  it('maps left/right sides to horizontal', () => {
    expect(portSideToOrientation('left')).toBe('horizontal');
    expect(portSideToOrientation('right')).toBe('horizontal');
  });

  it('maps top/bottom sides to vertical', () => {
    expect(portSideToOrientation('top')).toBe('vertical');
    expect(portSideToOrientation('bottom')).toBe('vertical');
  });
});

describe('getEdgePortOrientations', () => {
  const makeNode = (id: string, portId: string, side: 'left' | 'right' | 'top' | 'bottom'): Node => ({
    id,
    position: { x: 0, y: 0 },
    data: {},
    measuredPorts: [{ id: portId, type: 'both', nodeId: id, side }],
  });

  const edge: Edge = {
    id: 'e1',
    source: 'a',
    target: 'b',
    sourcePort: 'a-out',
    targetPort: 'b-in',
    data: {},
  };

  it('reads orientations from measuredPorts on connected nodes', () => {
    const nodes = [makeNode('a', 'a-out', 'right'), makeNode('b', 'b-in', 'top')];
    expect(getEdgePortOrientations(nodes, edge)).toEqual({
      source: 'horizontal',
      target: 'vertical',
    });
  });

  it('falls back to horizontal when a port is missing', () => {
    const nodes = [makeNode('a', 'unknown-port', 'right'), makeNode('b', 'b-in', 'bottom')];
    expect(getEdgePortOrientations(nodes, edge)).toEqual({
      source: 'horizontal',
      target: 'vertical',
    });
  });

  it('falls back to horizontal when a node is missing', () => {
    const nodes = [makeNode('b', 'b-in', 'left')];
    expect(getEdgePortOrientations(nodes, edge)).toEqual({
      source: 'horizontal',
      target: 'horizontal',
    });
  });
});
