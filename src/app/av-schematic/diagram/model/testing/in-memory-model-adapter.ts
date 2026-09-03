import {
  type Edge,
  type Metadata,
  type ModelAdapter,
  type ModelChanges,
  type Node,
} from 'ng-diagram';

/** Minimal mutable delegate for integration tests of model history. */
export class InMemoryModelAdapter implements ModelAdapter {
  private readonly callbacks: ((changes: ModelChanges) => void)[] = [];

  constructor(
    private nodes: Node[],
    private edges: Edge[],
    private metadata: Metadata = { viewport: { x: 0, y: 0, scale: 1 } },
  ) {}

  destroy(): void {
    this.callbacks.length = 0;
  }

  getNodes(): Node[] {
    return this.nodes;
  }

  getEdges(): Edge[] {
    return this.edges;
  }

  updateNodes(value: Node[] | ((nodes: Node[]) => Node[])): void {
    this.nodes = typeof value === 'function' ? value(this.nodes) : value;
    this.emit();
  }

  updateEdges(value: Edge[] | ((edges: Edge[]) => Edge[])): void {
    this.edges = typeof value === 'function' ? value(this.edges) : value;
    this.emit();
  }

  getMetadata(): Metadata {
    return this.metadata;
  }

  updateMetadata(value: Metadata | ((metadata: Metadata) => Metadata)): void {
    this.metadata = typeof value === 'function' ? value(this.metadata) : value;
    this.emit();
  }

  onChange(callback: (changes: ModelChanges) => void): void {
    this.callbacks.push(callback);
  }

  unregisterOnChange(callback: (changes: ModelChanges) => void): void {
    const index = this.callbacks.indexOf(callback);
    if (index >= 0) this.callbacks.splice(index, 1);
  }

  undo(): void {
    throw new Error('delegate undo must not be called');
  }

  redo(): void {
    throw new Error('delegate redo must not be called');
  }

  toJSON(): string {
    return JSON.stringify({ nodes: this.nodes, edges: this.edges, metadata: this.metadata });
  }

  private emit(): void {
    const changes = { nodes: this.nodes, edges: this.edges, metadata: this.metadata };
    for (const callback of this.callbacks) callback(changes);
  }
}
