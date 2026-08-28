import { TestBed } from '@angular/core/testing';
import {
  NgDiagramModelService,
  NgDiagramService,
  NgDiagramViewportService,
  type Edge,
  type Point,
} from 'ng-diagram';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RelinkEndpointHandler } from './relink-endpoint.handler';
import { RelinkTargetHighlightService } from './relink-target-highlight.service';

describe('RelinkEndpointHandler', () => {
  const updateEdge = vi.fn<(edgeId: string, patch: Partial<Edge>) => void>();
  const highlight = { clear: vi.fn(), set: vi.fn() };
  const sourceNode = {
    id: 'source',
    position: { x: 0, y: 0 },
    measuredPorts: [],
    data: {},
  };
  const targetNode = {
    id: 'new-target',
    position: { x: 200, y: 20 },
    measuredPorts: [
      {
        id: 'in',
        side: 'left',
        position: { x: 0, y: 10 },
        size: { width: 10, height: 20 },
      },
    ],
    data: {},
  };
  const edge = { id: 'wire-1', source: 'source', target: 'old-target' };

  beforeEach(() => {
    updateEdge.mockReset();
    highlight.clear.mockReset();
    highlight.set.mockReset();
    TestBed.configureTestingModule({
      providers: [
        RelinkEndpointHandler,
        { provide: RelinkTargetHighlightService, useValue: highlight },
        {
          provide: NgDiagramModelService,
          useValue: {
            getEdgeById: vi.fn(() => edge),
            nodes: vi.fn(() => [sourceNode, targetNode]),
            updateEdge,
          },
        },
        {
          provide: NgDiagramViewportService,
          useValue: {
            clientToFlowPosition: vi.fn(({ x, y }: Point) => ({ x, y })),
          },
        },
        { provide: NgDiagramService, useValue: { config: vi.fn(() => undefined) } },
      ],
    });
  });

  it('previews a dangling endpoint, highlights the port, then commits one partial relink patch', () => {
    const handler = TestBed.inject(RelinkEndpointHandler);
    const route = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
    ];

    handler.onEndpointStart('wire-1', 'target', route, 9);
    handler.onEndpointContinue(201, 40, 9);

    expect(highlight.set).toHaveBeenCalledWith('new-target', 'in');
    expect(updateEdge).toHaveBeenNthCalledWith(
      1,
      'wire-1',
      expect.objectContaining({
        target: '',
        targetPort: undefined,
        targetPosition: { x: 200, y: 40 },
        routingMode: 'manual',
      }),
    );

    handler.onEndpointEnd(201, 40, 9);

    const committedPatch = updateEdge.mock.calls[1][1];
    expect(committedPatch).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 200, y: 40 },
      ],
      routingMode: 'manual',
      target: 'new-target',
      targetPort: 'in',
      targetPosition: undefined,
    });
    expect(committedPatch).not.toHaveProperty('data');
    expect(committedPatch).not.toHaveProperty('source');
    expect(route[1]).toEqual({ x: 100, y: 0 });
    expect(highlight.clear).toHaveBeenCalled();
  });
});
