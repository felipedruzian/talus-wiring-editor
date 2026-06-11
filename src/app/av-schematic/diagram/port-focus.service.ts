import { inject, Injectable } from '@angular/core';
import { NgDiagramModelService, NgDiagramViewportService, type Node, type Point } from 'ng-diagram';
import { ViewportAnimationService } from './viewport-animation.service';

/**
 * Pans the viewport to the node connected to a given port on a given node.
 * No-op when the port has no edge.
 */
@Injectable()
export class PortFocusService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly viewportAnimation = inject(ViewportAnimationService);

  navigateToConnectedPort(portId: string, originNodeId: string): void {
    const connectedEdge = this.modelService
      .getConnectedEdges(originNodeId)
      .find(
        (edge) =>
          (edge.source === originNodeId && edge.sourcePort === portId) ||
          (edge.target === originNodeId && edge.targetPort === portId),
      );
    if (!connectedEdge) return;

    const connectedNodeId =
      connectedEdge.source === originNodeId ? connectedEdge.target : connectedEdge.source;
    const connectedNode = this.modelService.getNodeById(connectedNodeId);
    if (!connectedNode) return;

    this.viewportAnimation.animateTo(this.viewportTargetForNode(connectedNode));
  }

  private viewportTargetForNode(node: Node): Point {
    const viewport = this.viewportService.viewport();
    const scale = viewport.scale;
    const viewportWidth = viewport.width ?? 0;
    const viewportHeight = viewport.height ?? 0;
    const nodeWidth = node.size?.width ?? 0;
    const nodeHeight = node.size?.height ?? 0;

    const nodeCenterX = node.position.x + nodeWidth / 2;
    const nodeCenterY = node.position.y + nodeHeight / 2;

    return {
      x: viewportWidth / 2 - nodeCenterX * scale,
      y: viewportHeight / 2 - nodeCenterY * scale,
    };
  }
}
