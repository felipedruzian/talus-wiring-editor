import { Injectable, inject } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramViewportService,
  type Point,
} from 'ng-diagram';
import { BendPointDragService } from '../bend-point-drag.service';
import { EdgeReshapeCommandDispatcher } from '../commands/dispatcher';
import {
  getEdgePortOrientations,
  insertCollocatedBends,
  moveBend,
  removeSegment,
  segmentToRemoveForBend,
  type Orientation,
} from '../logic';

const fallbackOrientation: Orientation = 'horizontal';

/**
 * Translates pointer-phase events from `EdgeReshapeDirective` into reshape
 * commands. Looks up source-port orientation per gesture so moveBend and
 * removeSegment work for any port side, not just AV's left/right invariant.
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

  onRemoveSegmentRequest(
    edgeId: string,
    bendIndex: number,
    points: readonly Point[],
  ): void {
    const segmentIndex = segmentToRemoveForBend(points, bendIndex);
    if (segmentIndex < 0) return;
    const sourceOrientation = this.sourceOrientationFor(edgeId);
    const patch = removeSegment(points, segmentIndex, sourceOrientation);
    if (!patch.points) return;

    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId,
      points: patch.points,
      finalize: true,
    });
  }

  private sourceOrientationFor(edgeId: string): Orientation {
    const edge = this.modelService.getEdgeById(edgeId);
    if (!edge) return fallbackOrientation;
    return getEdgePortOrientations(this.modelService.nodes(), edge).source;
  }
}
