import { inject, Injectable } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { ModelApplyService } from '../diagram/model/model-apply.service';
import { ModelChanges } from '../diagram/model/model-changes';
import {
  type DevicePort,
  type DeviceNodeData,
  type WireEdgeData,
} from '../diagram/model/interfaces';
import {
  formDataToDeviceData,
  type DeviceFieldChange,
} from '../shared/device-form/device-form.mappers';
import {
  formDataToWireData,
  type WireFieldChange,
} from './components/wire-form/wire-form.mappers';

/** Handles node and edge removal and live field edits from the sidebar forms. */
@Injectable()
export class ElementMutationService {
  private readonly modelService = inject(NgDiagramModelService);
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

  handleDeviceFieldChange(change: DeviceFieldChange): void {
    const node = this.modelService.getNodeById<DeviceNodeData>(change.entityId);
    if (!node) return;
    const updatedData = formDataToDeviceData(change.formData, node.data);

    const orphanedEdgeIds = change.fields.includes('ports')
      ? this.findOrphanedEdgeIds(change.entityId, node.data.ports, updatedData.ports)
      : [];

    if (orphanedEdgeIds.length > 0) {
      const changes = new ModelChanges();
      changes.addNodeUpdates({ id: change.entityId, data: updatedData });
      changes.addDeleteEdgeIds(...orphanedEdgeIds);
      void this.modelApplyService.apply(changes);
    } else {
      this.modelService.updateNodeData(change.entityId, updatedData);
    }
  }

  private findOrphanedEdgeIds(
    nodeId: string,
    oldPorts: readonly DevicePort[],
    newPorts: readonly DevicePort[],
  ): string[] {
    const newIds = new Set(newPorts.map((p) => p.id));
    const removedIds = new Set(oldPorts.filter((p) => !newIds.has(p.id)).map((p) => p.id));
    if (removedIds.size === 0) return [];

    return this.modelService
      .getConnectedEdges(nodeId)
      .filter(
        (edge) =>
          (edge.source === nodeId && removedIds.has(edge.sourcePort ?? '')) ||
          (edge.target === nodeId && removedIds.has(edge.targetPort ?? '')),
      )
      .map((edge) => edge.id);
  }

  handleWireFieldChange(change: WireFieldChange): void {
    const edge = this.modelService.getEdgeById<WireEdgeData>(change.edgeId);
    if (!edge) return;
    const updatedData = formDataToWireData(change.formData, edge.data);
    this.modelService.updateEdgeData(change.edgeId, updatedData);
  }
}
