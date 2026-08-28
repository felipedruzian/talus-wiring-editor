import type { NgDiagramModelService, Point } from 'ng-diagram';
import { describe, expect, it, vi } from 'vitest';
import { applyEdgeStretchOnSelectionMoved } from './edge-stretch-on-move';

interface EdgePointsPatch {
  id: string;
  points: Point[];
}

describe('applyEdgeStretchOnSelectionMoved', () => {
  it('re-anchors only incident manual wires and preserves their internal route', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
      { x: 80, y: 60 },
      { x: 80, y: 100 },
    ];
    const incident = {
      id: 'wire-1',
      source: 'source',
      sourcePort: 'out',
      target: 'target',
      targetPort: 'in',
      routingMode: 'manual',
      points: route,
      data: { type: 'wire', wireId: 'W1', notes: 'preserve me' },
    };
    const unrelated = {
      ...incident,
      id: 'wire-2',
      source: 'other-source',
      target: 'other-target',
      data: { type: 'wire', wireId: 'W2' },
    };
    const nodes = new Map([
      [
        'source',
        {
          id: 'source',
          position: { x: 20, y: 10 },
          measuredPorts: [
            {
              id: 'out',
              side: 'left',
              position: { x: 0, y: 0 },
              size: { width: 10, height: 20 },
            },
          ],
        },
      ],
      [
        'target',
        {
          id: 'target',
          position: { x: 80, y: 90 },
          measuredPorts: [
            {
              id: 'in',
              side: 'left',
              position: { x: 0, y: 0 },
              size: { width: 10, height: 20 },
            },
          ],
        },
      ],
    ]);
    const updateEdges = vi.fn<(patches: EdgePointsPatch[]) => void>();
    const model = {
      getModel: () => ({ getEdges: () => [incident, unrelated] }),
      getNodeById: (id: string) => nodes.get(id),
      updateEdges,
    };

    applyEdgeStretchOnSelectionMoved(
      model as unknown as NgDiagramModelService,
      new Set(['source']),
      false,
    );

    expect(updateEdges).toHaveBeenCalledOnce();
    expect(updateEdges).toHaveBeenCalledWith([
      {
        id: 'wire-1',
        points: [
          { x: 20, y: 20 },
          { x: 40, y: 20 },
          { x: 40, y: 60 },
          { x: 80, y: 60 },
          { x: 80, y: 100 },
        ],
      },
    ]);
    expect(updateEdges.mock.calls[0][0][0]).not.toHaveProperty('data');
    expect(route).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 60 },
      { x: 80, y: 60 },
      { x: 80, y: 100 },
    ]);
  });
});
