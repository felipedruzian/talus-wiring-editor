import { Injectable, inject } from '@angular/core';
import { NgDiagramViewportService, type Point } from 'ng-diagram';
import { BendPointDragService } from '../bend-point-drag.service';
import { EdgeReshapeCommandDispatcher } from '../commands/dispatcher';
import {
  insertCollocatedBends,
  moveBend,
  removeSegment,
  segmentToRemoveForBend,
} from '../logic';

/**
 * Translates pointer-phase events from `EdgeReshapeDirective` into reshape
 * commands. Mirrors the ResizeEventHandler pattern from ng-diagram: the
 * handler holds gesture intent, the dispatcher routes the resulting commands.
 *
 * The 'horizontal' literal passed to moveBend / removeSegment matches today's
 * left/right port invariant; step 7 replaces it with a real port-side lookup.
 */
@Injectable()
export class EdgeReshapeEventHandler {
  private readonly state = inject(BendPointDragService);
  private readonly viewport = inject(NgDiagramViewportService);
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

    const flowPos = this.viewport.clientToFlowPosition({ x: clientX, y: clientY });
    const next = moveBend(drag.originalPoints, drag.bendIndex, flowPos, 'horizontal');

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
    const patch = removeSegment(points, segmentIndex, 'horizontal');
    if (!patch.points) return;

    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId,
      points: patch.points,
      finalize: true,
    });
  }
}
