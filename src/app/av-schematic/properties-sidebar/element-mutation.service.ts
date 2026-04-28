import { inject, Injectable } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { ModelApplyService } from '../diagram/model/model-apply.service';
import { ModelChanges } from '../diagram/model/model-changes';
import { type DeviceNodeData, type WireEdgeData } from '../diagram/model/interfaces';
import {
  formDataToDeviceData,
  type DeviceFieldChange,
} from './components/device-form/device-form.mappers';
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
    const node = this.modelService.getNodeById<DeviceNodeData>(change.nodeId);
    if (!node) return;
    const updatedData = formDataToDeviceData(change.formData, node.data);
    this.modelService.updateNodeData(change.nodeId, updatedData);
  }

  handleWireFieldChange(change: WireFieldChange): void {
    const edge = this.modelService.getEdgeById<WireEdgeData>(change.edgeId);
    if (!edge) return;
    const updatedData = formDataToWireData(change.formData, edge.data);
    this.modelService.updateEdgeData(change.edgeId, updatedData);
  }
}
