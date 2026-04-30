import { Injectable, inject } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramViewportService,
  type Point,
} from 'ng-diagram';
import { BendPointDragService } from '../bend-point-drag.service';
import { EdgeReshapeCommandDispatcher } from '../commands/dispatcher';
import {
  getDefaultMinInteriorBends,
  getEdgePortOrientations,
  insertCollocatedBends,
  moveBend,
  type Orientation,
} from '../logic';

const fallbackOrientation: Orientation = 'horizontal';

/**
 * Translates pointer-phase events from `EdgeReshapeDirective` into reshape
 * commands. Looks up source-port orientation per gesture so moveBend works
 * for any port side, not just AV's left/right invariant.
 */
@Injectable()
export class EdgeReshapeEventHandler {
  private readonly state = inject(BendPointDragService);
  private readonly viewport = inject(NgDiagramViewportService);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly dispatcher = inject(EdgeReshapeCommandDispatcher);

  onVertexStart(
    edgeId: string,
    bendIndex: number,
    points: readonly Point[],
    pointerId: number,
  ): void {
    if (points.length < 3) return;
    const snapshot = points.slice();
    this.state.set({
      edgeId,
      bendIndex,
      pointerId,
      originalPoints: snapshot,
      lastComputedPoints: snapshot,
    });
    this.dispatcher.dispatch({ type: 'reshapeEdgeStart', edgeId });
  }

  onGhostStart(
    edgeId: string,
    segmentIndex: number,
    points: readonly Point[],
    pointerId: number,
  ): void {
    const insertion = insertCollocatedBends(points, segmentIndex);
    if (!insertion) return;

    this.state.set({
      edgeId,
      bendIndex: insertion.newBendIndex,
      pointerId,
      originalPoints: insertion.points,
      lastComputedPoints: insertion.points,
    });
    this.dispatcher.dispatch({ type: 'reshapeEdgeStart', edgeId });
    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId,
      points: insertion.points,
      finalize: false,
    });
  }

  onContinue(clientX: number, clientY: number, pointerId: number): void {
    const drag = this.state.get(pointerId);
    if (!drag) return;

    const sourceOrientation = this.sourceOrientationFor(drag.edgeId);
    const flowPos = this.viewport.clientToFlowPosition({ x: clientX, y: clientY });
    const next = moveBend(drag.originalPoints, drag.bendIndex, flowPos, sourceOrientation);

    this.state.updateLastComputed(pointerId, next);
    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId: drag.edgeId,
      points: next,
      finalize: false,
    });
  }

  onEnd(pointerId: number): void {
    const drag = this.state.get(pointerId);
    if (!drag) return;

    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId: drag.edgeId,
      points: drag.lastComputedPoints.slice(),
      finalize: true,
    });
    this.dispatcher.dispatch({ type: 'reshapeEdgeStop', edgeId: drag.edgeId });
    this.state.clear(pointerId);
  }

  /**
   * Removes an interior orthogonal segment. Both endpoint bends of the
   * segment go away; simplifyPath snaps the bridging segment back to
   * orthogonal alternation. Refused when:
   * - the segment touches a port stub (segmentIndex 0 or last segment),
   * - removal would drop interior bends below the per-edge minimum.
   *
   * Vertex right-click invokes this with `segmentIndex = bendIndex` —
   * "remove the segment after the clicked bend." Ghost right-click invokes
   * it with the ghost's own segment index.
   */
  onRemoveSegmentRequest(
    edgeId: string,
    segmentIndex: number,
    points: readonly Point[],
  ): void {
    if (segmentIndex < 1 || segmentIndex > points.length - 3) return;

    const orientations = this.orientationsFor(edgeId);
    const minBends = getDefaultMinInteriorBends(orientations.source, orientations.target);
    const remainingInteriorBends = points.length - 2 - 2;
    if (remainingInteriorBends < minBends) return;

    const next = [...points.slice(0, segmentIndex), ...points.slice(segmentIndex + 2)];

    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId,
      points: next,
      finalize: true,
    });
  }

  private sourceOrientationFor(edgeId: string): Orientation {
    return this.orientationsFor(edgeId).source;
  }

  private orientationsFor(edgeId: string): { source: Orientation; target: Orientation } {
    const edge = this.modelService.getEdgeById(edgeId);
    if (!edge) return { source: fallbackOrientation, target: fallbackOrientation };
    return getEdgePortOrientations(this.modelService.nodes(), edge);
  }
}
