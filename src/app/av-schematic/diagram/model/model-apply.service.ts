import { inject, Injectable } from '@angular/core';
import { NgDiagramModelService, NgDiagramService } from 'ng-diagram';
import { ModelChanges, type EdgeUpdate, type NodeUpdate } from './model-changes';

/**
 * Applies accumulated model mutations in a single atomic transaction.
 *
 * Structural ops are guarded: skips adds for existing elements and deletes
 * for already-removed elements.
 */
@Injectable()
export class ModelApplyService {
  private readonly diagramService = inject(NgDiagramService);
  private readonly modelService = inject(NgDiagramModelService);

  async apply(changes: ModelChanges = new ModelChanges()): Promise<void> {
    await this.diagramService.transaction(
      () => {
        if (changes.deleteEdgeIds.length > 0) {
          const toDelete = changes.deleteEdgeIds.filter((id) => this.modelService.getEdgeById(id));
          if (toDelete.length > 0) this.modelService.deleteEdges(toDelete);
        }
        if (changes.deleteNodeIds.length > 0) {
          const toDelete = changes.deleteNodeIds.filter((id) => this.modelService.getNodeById(id));
          if (toDelete.length > 0) this.modelService.deleteNodes(toDelete);
        }
        if (changes.newNodes.length > 0) {
          const toAdd = changes.newNodes.filter((n) => !this.modelService.getNodeById(n.id));
          if (toAdd.length > 0) this.modelService.addNodes(toAdd);
        }
        if (changes.newEdges.length > 0) {
          const toAdd = changes.newEdges.filter((e) => !this.modelService.getEdgeById(e.id));
          if (toAdd.length > 0) this.modelService.addEdges(toAdd);
        }
        if (changes.nodeUpdates.length > 0) {
          this.modelService.updateNodes(this.resolveNodeUpdates(changes.nodeUpdates));
        }
        if (changes.edgeUpdates.length > 0) {
          this.modelService.updateEdges(this.resolveEdgeUpdates(changes.edgeUpdates));
        }
      },
      { waitForMeasurements: true },
    );
  }

  /**
   * Dedupes patches by id (merging them) and resolves each merged `data`
   * against the entity's current `data`, so ng-diagram receives a full object.
   *
   * Inside `data`: later keys win; `undefined` is preserved.
   * Top-level: later non-`undefined` values win; `undefined` is dropped.
   */
  private resolveUpdates<
    TData extends object,
    TPatch extends { id: string; data?: Partial<TData> },
  >(updates: readonly TPatch[], getById: (id: string) => { data?: TData } | null): TPatch[] {
    const byId = new Map<string, TPatch>();

    for (const update of updates) {
      const existing = byId.get(update.id);
      byId.set(update.id, existing ? this.mergePatch(existing, update) : { ...update });
    }

    for (const [id, entry] of byId) {
      if (entry.data) {
        const current = getById(id);
        if (current?.data) {
          entry.data = { ...current.data, ...entry.data };
        }
      }
    }

    return [...byId.values()];
  }

  private mergePatch<TPatch extends { id: string; data?: object }>(a: TPatch, b: TPatch): TPatch {
    const merged: Record<string, unknown> = { ...a };
    for (const [key, value] of Object.entries(b)) {
      if (key === 'id') continue;
      if (key === 'data' && value) {
        merged['data'] = { ...((merged['data'] as object) ?? {}), ...(value as object) };
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }
    return merged as TPatch;
  }

  private resolveNodeUpdates(updates: readonly NodeUpdate[]): NodeUpdate[] {
    return this.resolveUpdates(updates, (id) => this.modelService.getNodeById(id));
  }

  private resolveEdgeUpdates(updates: readonly EdgeUpdate[]): EdgeUpdate[] {
    return this.resolveUpdates(updates, (id) => this.modelService.getEdgeById(id));
  }
}
