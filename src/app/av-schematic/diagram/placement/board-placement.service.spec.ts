import { TestBed } from '@angular/core/testing';
import { NgDiagramModelService, type Edge, type Node } from 'ng-diagram';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { placementNodePosition, syncPortHolesToPlacement } from '../model/footprint-geometry';
import { type Footprint } from '../model/footprint';
import {
  EdgeTemplateType,
  NodeTemplateType,
  type BoardNodeData,
  type DeviceNodeData,
  type WireEdgeData,
} from '../model/interfaces';
import { BoardPlacementService } from './board-placement.service';

const footprint: Footprint = {
  id: 'link',
  label: 'Link',
  rows: 1,
  cols: 2,
  pins: [
    { id: 'a', label: 'A', cell: { row: 0, col: 0 } },
    { id: 'b', label: 'B', cell: { row: 0, col: 1 } },
  ],
  bodyCells: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ],
  shapes: [],
};

function board(position = { x: 0, y: 0 }): Node<BoardNodeData> {
  return {
    id: 'board',
    type: NodeTemplateType.BoardNode,
    position,
    data: { type: 'board', boardId: 'board', label: 'Board', rows: 4, cols: 5, pitch: 17 },
  };
}

function device(id: string, position: { x: number; y: number }): Node<DeviceNodeData> {
  return {
    id,
    type: NodeTemplateType.DeviceNode,
    position,
    data: {
      type: 'device',
      deviceId: id,
      manufacturer: '',
      model: 'Link',
      footprintId: footprint.id,
      footprint,
      ports: [
        { id: 'a', label: 'A', direction: 'input' },
        { id: 'b', label: 'B', direction: 'output' },
      ],
    },
  };
}

class ModelStub {
  nodes: Node[] = [];
  edges: Edge[] = [];

  readonly getModel = vi.fn(() => ({
    getNodes: () => this.nodes,
    getEdges: () => this.edges,
  }));
  readonly getNodeById = vi.fn((id: string) => this.nodes.find((node) => node.id === id));
  readonly getConnectedEdges = vi.fn((id: string) =>
    this.edges.filter((edge) => edge.source === id || edge.target === id),
  );
  readonly updateNode = vi.fn((id: string, patch: Partial<Node>) => {
    const index = this.nodes.findIndex((node) => node.id === id);
    if (index >= 0) this.nodes[index] = { ...this.nodes[index], ...patch } as Node;
    return Promise.resolve();
  });
  readonly updateEdges = vi.fn((patches: readonly ({ id: string } & Partial<Edge>)[]) => {
    for (const patch of patches) {
      const index = this.edges.findIndex((edge) => edge.id === patch.id);
      if (index >= 0) this.edges[index] = { ...this.edges[index], ...patch } as Edge;
    }
    return Promise.resolve();
  });
}

describe('BoardPlacementService', () => {
  let model: ModelStub;
  let service: BoardPlacementService;

  beforeEach(() => {
    model = new ModelStub();
    TestBed.configureTestingModule({
      providers: [
        BoardPlacementService,
        { provide: NgDiagramModelService, useValue: model },
      ],
    });
    service = TestBed.inject(BoardPlacementService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('snaps a dropped footprint and derives its pin holes', async () => {
    const boardNode = board();
    const placement = { boardId: 'board', anchor: { row: 1, col: 1 }, rotation: 0 as const };
    const part = device('part', placementNodePosition({ board: boardNode.data, position: boardNode.position }, placement));
    model.nodes = [boardNode, part];

    await service.settleDrag(new Set(['part']));

    const seated = model.nodes.find((node) => node.id === 'part') as Node<DeviceNodeData>;
    expect(seated.type).toBe(NodeTemplateType.FootprintNode);
    expect(seated.data.placement).toEqual(placement);
    expect(seated.data.ports.map((port) => port.hole)).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
    ]);
  });

  it('rejects a silently overlapping placement and exposes the blocker', async () => {
    const boardNode = board();
    const placement = { boardId: 'board', anchor: { row: 1, col: 1 }, rotation: 0 as const };
    const fixed = device('fixed', { x: 0, y: 0 });
    fixed.type = NodeTemplateType.FootprintNode;
    fixed.data = syncPortHolesToPlacement({ ...fixed.data, boardId: 'board', placement });
    fixed.position = placementNodePosition({ board: boardNode.data, position: boardNode.position }, placement);
    const moving = device('moving', { ...fixed.position });
    model.nodes = [boardNode, fixed, moving];

    await service.settleDrag(new Set(['moving']));

    expect(service.conflict()).toMatchObject({ kind: 'occupied', blockedBy: ['fixed'] });
    expect(model.nodes.find((node) => node.id === 'moving')?.type).toBe(
      NodeTemplateType.DeviceNode,
    );
  });

  it('recomputes seated positions when the board moves', async () => {
    const boardNode = board({ x: 100, y: 80 });
    const placement = { boardId: 'board', anchor: { row: 2, col: 2 }, rotation: 0 as const };
    const part = device('part', { x: 0, y: 0 });
    part.type = NodeTemplateType.FootprintNode;
    part.data = syncPortHolesToPlacement({ ...part.data, boardId: 'board', placement });
    model.nodes = [boardNode, part];

    const affected = await service.settleDrag(new Set(['board']));

    expect(affected.has('part')).toBe(true);
    expect(model.nodes.find((node) => node.id === 'part')?.position).toEqual(
      placementNodePosition({ board: boardNode.data, position: boardNode.position }, placement),
    );
  });

  it('unseats a part dropped outside every board without rewriting its wire', async () => {
    const boardNode = board();
    const placement = { boardId: 'board', anchor: { row: 1, col: 1 }, rotation: 0 as const };
    const part = device('part', { x: 999, y: 999 });
    part.type = NodeTemplateType.FootprintNode;
    part.data = syncPortHolesToPlacement({ ...part.data, boardId: 'board', placement });
    const external = device('external', { x: 700, y: 0 });
    external.data = { ...external.data, footprintId: undefined, footprint: undefined };
    const wire: Edge<WireEdgeData> = {
      id: 'wire',
      type: EdgeTemplateType.WireEdge,
      source: part.id,
      sourcePort: 'a',
      target: external.id,
      targetPort: 'a',
      routingMode: 'manual',
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
      ],
      data: {
        type: 'wire',
        wireId: 'W1',
        netId: 'imported-id',
        netName: 'AUTHORED',
      },
    };
    model.nodes = [boardNode, part, external];
    model.edges = [wire];

    await service.settleDrag(new Set(['part']));

    const unseated = model.nodes.find((node) => node.id === 'part') as Node<DeviceNodeData>;
    expect(unseated.type).toBe(NodeTemplateType.DeviceNode);
    expect(unseated.data.placement).toBeUndefined();
    expect(unseated.data.boardId).toBeUndefined();
    expect(unseated.data.ports.every((port) => port.hole === undefined)).toBe(true);
    expect(model.edges[0]).toEqual(wire);
  });

  it('reports an unseated footprint dropped outside every board', async () => {
    const part = device('part', { x: 999, y: 999 });
    model.nodes = [part];

    await service.settleDrag(new Set(['part']));

    expect(service.conflict()).toEqual({
      kind: 'unknown-board',
      nodeId: 'part',
      boardId: '',
      holes: [],
      blockedBy: [],
    });
  });

  it('rotates a legal seat and keeps pin 1 on the same hole', async () => {
    const boardNode = board();
    const placement = { boardId: 'board', anchor: { row: 1, col: 1 }, rotation: 0 as const };
    const part = device('part', { x: 0, y: 0 });
    part.type = NodeTemplateType.FootprintNode;
    part.data = syncPortHolesToPlacement({ ...part.data, boardId: 'board', placement });
    model.nodes = [boardNode, part];
    const before = part.data.ports.find((port) => port.id === 'a')?.hole;

    expect(await service.rotate('part', 1)).toBe(true);

    const rotated = model.nodes.find((node) => node.id === 'part') as Node<DeviceNodeData>;
    expect(rotated.data.placement?.rotation).toBe(90);
    expect(rotated.data.ports.find((port) => port.id === 'a')?.hole).toEqual(before);
  });
});
