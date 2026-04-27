import { inject, Injectable } from '@angular/core';
import { NgDiagramModelService, NgDiagramViewportService } from 'ng-diagram';

/**
 * Pans the viewport to the node connected to a given port on a given node.
 * No-op when the port has no edge.
 */
@Injectable()
export class PortFocusService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly viewportService = inject(NgDiagramViewportService);

  navigateToConnectedPort(portId: string, originNodeId: string): void {
    const edge = this.modelService
      .getConnectedEdges(originNodeId)
      .find(
        (e) =>
          (e.source === originNodeId && e.sourcePort === portId) ||
          (e.target === originNodeId && e.targetPort === portId),
      );
    if (!edge) return;

    const otherId = edge.source === originNodeId ? edge.target : edge.source;
    this.viewportService.centerOnNode(otherId);
  }
}
