import { type Edge, type Node } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { NodeTemplateType, type BoardNodeData } from './interfaces';
import { planPastedBoardOwnership } from './pasted-board-jumpers';
import { InMemoryModelAdapter } from './testing/in-memory-model-adapter';
import { UndoableDiagramModelAdapter } from './undoable-model';

describe('planPastedBoardOwnership', () => {
  it('remaps a pasted jumper to the copied board domain id', () => {
    const original: Node<BoardNodeData> = {
      id: 'board-original-node',
      type: NodeTemplateType.BoardNode,
      position: { x: 0, y: 0 },
      data: {
        type: 'board',
        boardId: 'board-domain',
        label: 'Protoboard',
        surface: 'breadboard',
        rows: 2,
        cols: 3,
        pitch: 20,
      },
    };
    const copied: Node<BoardNodeData> = {
      ...original,
      id: 'board-copy-node',
      position: { x: 100, y: 100 },
    };
    const jumper: Edge = {
      id: 'jumper-copy',
      source: copied.id,
      sourcePort: 'hole:0:0',
      target: copied.id,
      targetPort: 'hole:1:2',
      data: { type: 'wire', wireId: 'J1', jumperBoardId: original.data.boardId },
    };

    const plan = planPastedBoardOwnership([copied], [jumper], [original, copied]);

    expect(plan.nodeUpdates).toContainEqual({
      id: copied.id,
      data: { ...copied.data, boardId: copied.id },
    });
    expect(plan.edgeUpdates).toContainEqual({
      id: jumper.id,
      data: { ...jumper.data, jumperBoardId: copied.id },
    });
    expect(plan.rejectedEdgeIds).toEqual([]);
  });

  it('rejects a pasted jumper whose owner cannot be resolved', () => {
    const orphan: Edge = {
      id: 'orphan-copy',
      source: 'missing-board-node',
      sourcePort: 'hole:0:0',
      target: 'missing-board-node',
      targetPort: 'hole:1:1',
      data: { type: 'wire', wireId: 'J1', jumperBoardId: 'missing-board-domain' },
    };

    expect(planPastedBoardOwnership([], [orphan], [])).toMatchObject({
      edgeUpdates: [],
      rejectedEdgeIds: [orphan.id],
    });
  });

  it('rejects a jumper when its owner board is not part of the pasted nodes', () => {
    const original: Node<BoardNodeData> = {
      id: 'board-existing-node',
      type: NodeTemplateType.BoardNode,
      position: { x: 0, y: 0 },
      data: {
        type: 'board',
        boardId: 'board-existing-domain',
        label: 'Existing',
        surface: 'breadboard',
        rows: 2,
        cols: 3,
        pitch: 20,
      },
    };
    const jumper: Edge = {
      id: 'jumper-without-board-copy',
      source: original.id,
      sourcePort: 'hole:0:0',
      target: original.id,
      targetPort: 'hole:1:2',
      data: { type: 'wire', wireId: 'J1', jumperBoardId: original.data.boardId },
    };

    expect(planPastedBoardOwnership([], [jumper], [original])).toMatchObject({
      edgeUpdates: [],
      rejectedEdgeIds: [jumper.id],
    });
  });

  it('remaps board ownership in one undoable paste operation', () => {
    const original: Node<BoardNodeData> = {
      id: 'board-original-node',
      type: NodeTemplateType.BoardNode,
      position: { x: 0, y: 0 },
      data: {
        type: 'board',
        boardId: 'board-domain',
        label: 'Original',
        surface: 'breadboard',
        rows: 2,
        cols: 3,
        pitch: 20,
      },
    };
    const copied: Node<BoardNodeData> = {
      ...original,
      id: 'board-copy-node',
      position: { x: 100, y: 100 },
    };
    const pastedJumper: Edge = {
      id: 'jumper-copy',
      source: copied.id,
      sourcePort: 'hole:0:0',
      target: copied.id,
      targetPort: 'hole:1:2',
      data: { type: 'wire', wireId: 'J1', jumperBoardId: original.data.boardId },
    };
    const model = new UndoableDiagramModelAdapter(new InMemoryModelAdapter([original], []));

    // FlowCore commits the copied elements immediately before clipboardPasted.
    model.updateNodes([original, copied]);
    model.updateEdges([pastedJumper]);
    model.beginHistoryGroup();
    const plan = planPastedBoardOwnership([copied], [pastedJumper], model.getNodes());
    model.updateNodes((nodes) =>
      nodes.map((node) => {
        const update = plan.nodeUpdates.find((candidate) => candidate.id === node.id);
        return update ? { ...node, ...update } : node;
      }),
    );
    model.updateEdges((edges) =>
      edges.map((edge) => {
        const update = plan.edgeUpdates.find((candidate) => candidate.id === edge.id);
        return update ? { ...edge, ...update } : edge;
      }),
    );
    model.endHistoryGroup();

    const assertValidPaste = (): void => {
      const owner = model.getNodes().find((node) => node.id === copied.id) as
        | Node<BoardNodeData>
        | undefined;
      const jumper = model.getEdges().find((edge) => edge.id === pastedJumper.id);
      expect(owner?.data.boardId).toBe(copied.id);
      expect(jumper?.data).toMatchObject({ jumperBoardId: owner?.data.boardId });
      expect(jumper).toMatchObject({ source: owner?.id, target: owner?.id });
    };
    assertValidPaste();

    model.undo();
    expect(model.getNodes()).toEqual([original]);
    expect(model.getEdges()).toEqual([]);

    model.redo();
    assertValidPaste();
  });
});
