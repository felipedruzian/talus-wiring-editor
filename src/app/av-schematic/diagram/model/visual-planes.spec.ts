import { type Edge, type Node } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { NodeTemplateType, EdgeTemplateType } from './interfaces';
import { applyVisualZOrder, DEFAULT_VISUAL_PLANES } from './visual-planes';

const node = (id: string, type: 'board' | 'device' | 'junction', visualPlane?: number): Node => ({
  id,
  type:
    type === 'board'
      ? NodeTemplateType.BoardNode
      : type === 'junction'
        ? NodeTemplateType.JunctionNode
        : NodeTemplateType.DeviceNode,
  position: { x: 0, y: 0 },
  data: { type, visualPlane },
});

const edge = (id: string, visualPlane?: number): Edge => ({
  id,
  type: EdgeTemplateType.WireEdge,
  source: 'a',
  target: 'b',
  data: { type: 'wire', visualPlane },
});

describe('visual plane ordering', () => {
  it('places boards below components, conductors and junctions by default', () => {
    const ordered = applyVisualZOrder(
      [node('junction', 'junction'), node('board', 'board'), node('component', 'device')],
      [edge('wire')],
    );
    const z = new Map<string, number | undefined>([
      ...ordered.nodes.map((item) => [item.id, item.zOrder] as const),
      ...ordered.edges.map((item) => [item.id, item.zOrder] as const),
    ]);
    expect(z.get('board')).toBeLessThan(z.get('component') ?? -1);
    expect(z.get('component')).toBeLessThan(z.get('wire') ?? -1);
    expect(z.get('wire')).toBeLessThan(z.get('junction') ?? -1);
    expect(ordered.nodes.find((item) => item.id === 'board')?.data).toMatchObject({
      visualPlane: DEFAULT_VISUAL_PLANES.board,
    });
  });

  it('uses kind and id as deterministic tie breakers inside one plane', () => {
    const first = applyVisualZOrder(
      [node('z', 'device', 7), node('a', 'device', 7)],
      [edge('m', 7)],
    );
    const second = applyVisualZOrder([...first.nodes].reverse(), first.edges);
    const zOrders = (value: typeof first) =>
      new Map<string, number | undefined>([
        ...value.nodes.map((item) => [item.id, item.zOrder] as const),
        ...value.edges.map((item) => [item.id, item.zOrder] as const),
      ]);
    expect(zOrders(second)).toEqual(zOrders(first));
  });

  it('lets an authored plane move a wire below a board', () => {
    const ordered = applyVisualZOrder([node('board', 'board')], [edge('wire', -1)]);
    expect(ordered.edges[0].zOrder).toBeLessThan(ordered.nodes[0].zOrder ?? -1);
  });

  it('renormalizes stale copied z-orders into one deterministic sequence after paste', () => {
    const copiedNodes = [
      { ...node('component-copy', 'device', 10), zOrder: 99 },
      { ...node('component', 'device', 10), zOrder: 99 },
    ];
    const copiedEdges = [
      { ...edge('wire-copy', 20), zOrder: 99 },
      { ...edge('wire', 20), zOrder: 99 },
    ];

    const first = applyVisualZOrder(copiedNodes, copiedEdges);
    const second = applyVisualZOrder([...copiedNodes].reverse(), [...copiedEdges].reverse());
    const zOrders = (value: typeof first) =>
      new Map<string, number | undefined>([
        ...value.nodes.map((item) => [item.id, item.zOrder] as const),
        ...value.edges.map((item) => [item.id, item.zOrder] as const),
      ]);

    expect(new Set(zOrders(first).values())).toEqual(new Set([0, 1, 2, 3]));
    expect(zOrders(second)).toEqual(zOrders(first));
  });
});
