import { Injectable, inject } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramViewportService,
  type Point,
} from 'ng-diagram';
import { EdgeReshapeCommandDispatcher } from '../commands/dispatcher';
import {
  getDefaultMinInteriorBends,
  getEdgePortOrientations,
  insertCollocatedBends,
  moveBend,
  type Orientation,
} from '../logic';

interface DragState {
  edgeId: string;
  bendIndex: number;
  pointerId: number;
  originalPoints: readonly Point[];
  lastComputedPoints: readonly Point[];
}

const fallbackOrientation: Orientation = 'horizontal';

/**
 * Translates pointer-phase events from `EdgeReshapeDirective` into reshape
 * commands. Owns the in-flight drag state for the duration of a gesture.
 *
 * Porting target: when this lands inside ng-diagram, the inline `state`
 * field moves to `ActionStateManager.edgeReshape` so other parts of the
 * system can observe it (mirror of how dragging/resize state lives there
 * today). Method shapes don't change.
 */
@Injectable()
export class EdgeReshapeEventHandler {
  private readonly viewport = inject(NgDiagramViewportService);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly dispatcher = inject(EdgeReshapeCommandDispatcher);

  private state: DragState | null = null;

  onVertexStart(
    edgeId: string,
    bendIndex: number,
    points: readonly Point[],
    pointerId: number,
  ): void {
    if (points.length < 3) return;
    const snapshot = points.slice();
    this.state = {
      edgeId,
      bendIndex,
      pointerId,
      originalPoints: snapshot,
      lastComputedPoints: snapshot,
    };
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

    this.state = {
      edgeId,
      bendIndex: insertion.newBendIndex,
      pointerId,
      originalPoints: insertion.points,
      lastComputedPoints: insertion.points,
    };
    this.dispatcher.dispatch({ type: 'reshapeEdgeStart', edgeId });
    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId,
      points: insertion.points,
      finalize: false,
    });
  }

  onContinue(clientX: number, clientY: number, pointerId: number): void {
    const drag = this.dragFor(pointerId);
    if (!drag) return;

    const sourceOrientation = this.sourceOrientationFor(drag.edgeId);
    const flowPos = this.viewport.clientToFlowPosition({ x: clientX, y: clientY });
    const next = moveBend(drag.originalPoints, drag.bendIndex, flowPos, sourceOrientation);

    this.state = { ...drag, lastComputedPoints: next };
    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId: drag.edgeId,
      points: next,
      finalize: false,
    });
  }

  onEnd(pointerId: number): void {
    const drag = this.dragFor(pointerId);
    if (!drag) return;

    this.dispatcher.dispatch({
      type: 'reshapeEdge',
      edgeId: drag.edgeId,
      points: drag.lastComputedPoints.slice(),
      finalize: true,
    });
    this.dispatcher.dispatch({ type: 'reshapeEdgeStop', edgeId: drag.edgeId });
    this.state = null;
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

  private dragFor(pointerId: number): DragState | null {
    return this.state?.pointerId === pointerId ? this.state : null;
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
