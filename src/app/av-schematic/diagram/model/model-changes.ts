import { type Edge as DiagramEdge, type Node as DiagramNode } from 'ng-diagram';
import { type AvSchematicEdgeData, type AvSchematicNodeData } from './interfaces';

export type NodeUpdate = Omit<Partial<DiagramNode<AvSchematicNodeData>>, 'data'> & {
  id: string;
  data?: Partial<AvSchematicNodeData>;
};
export type EdgeUpdate = Omit<Partial<DiagramEdge<AvSchematicEdgeData>>, 'data'> & {
  id: string;
  data?: Partial<AvSchematicEdgeData>;
};

/**
 * Accumulates pending model mutations (adds, updates, deletes) that are
 * applied atomically in a single transaction via {@link ModelApplyService}.
 */
export class ModelChanges {
  readonly nodeUpdates: NodeUpdate[] = [];
  readonly edgeUpdates: EdgeUpdate[] = [];
  readonly newNodes: DiagramNode<AvSchematicNodeData>[] = [];
  readonly newEdges: DiagramEdge<AvSchematicEdgeData>[] = [];
  readonly deleteNodeIds: string[] = [];
  readonly deleteEdgeIds: string[] = [];

  addNodeUpdates(...updates: NodeUpdate[]): void {
    this.nodeUpdates.push(...updates);
  }

  addEdgeUpdates(...updates: EdgeUpdate[]): void {
    this.edgeUpdates.push(...updates);
  }

  addNewNodes(...nodes: DiagramNode<AvSchematicNodeData>[]): void {
    this.newNodes.push(...nodes);
  }

  addNewEdges(...edges: DiagramEdge<AvSchematicEdgeData>[]): void {
    this.newEdges.push(...edges);
  }

  addDeleteNodeIds(...ids: string[]): void {
    this.deleteNodeIds.push(...ids);
  }

  addDeleteEdgeIds(...ids: string[]): void {
    this.deleteEdgeIds.push(...ids);
  }
}
