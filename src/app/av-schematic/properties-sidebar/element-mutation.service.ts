import { inject, Injectable } from '@angular/core';
import { ModelApplyService } from '../diagram/model/model-apply.service';
import { ModelChanges } from '../diagram/model/model-changes';

/** Handles node and edge removal. */
@Injectable()
export class ElementMutationService {
  private readonly modelApplyService = inject(ModelApplyService);

  async removeNode(nodeId: string): Promise<void> {
    const changes = new ModelChanges();
    changes.addDeleteNodeIds(nodeId);
    await this.modelApplyService.apply(changes);
  }

  async removeEdge(edgeId: string): Promise<void> {
    const changes = new ModelChanges();
    changes.addDeleteEdgeIds(edgeId);
    await this.modelApplyService.apply(changes);
  }
}
