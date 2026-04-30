import { inject, Injectable } from '@angular/core';
import { NgDiagramModelService, NgDiagramService } from 'ng-diagram';
import { ModelChanges } from './model-changes';
import { resolveUpdates } from './resolve-updates';

/**
 * Applies accumulated model mutations in a single atomic transaction.
 *
 * Structural ops are guarded: skips adds for existing elements and deletes
 * for already-removed elements. Update patches are merged and resolved
 * against current state via the pure `resolveUpdates` helper.
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
          this.modelService.updateNodes(
            resolveUpdates(changes.nodeUpdates, (id) => this.modelService.getNodeById(id)),
          );
        }
        if (changes.edgeUpdates.length > 0) {
          this.modelService.updateEdges(
            resolveUpdates(changes.edgeUpdates, (id) => this.modelService.getEdgeById(id)),
          );
        }
      },
      { waitForMeasurements: true },
    );
  }
}
