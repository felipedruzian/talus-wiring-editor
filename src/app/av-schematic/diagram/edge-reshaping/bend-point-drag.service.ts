import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramViewportService,
  type Point,
} from 'ng-diagram';
import {
  insertPoint,
  moveBend,
  removeSegment,
  segmentMidpoint,
  segmentToRemoveForBend,
} from './logic';

interface DragState {
  edgeId: string;
  bendIndex: number;
  pointerId: number;
  originalPoints: readonly Point[];
}

@Injectable()
export class BendPointDragService implements OnDestroy {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly viewportService = inject(NgDiagramViewportService);

  private dragState: DragState | null = null;

  private readonly onPointerMove = (event: PointerEvent): void => this.move(event);
  private readonly onPointerUp = (event: PointerEvent): void => this.end(event);

  ngOnDestroy(): void {
    this.detachDocumentListeners();
  }

  startVertexDrag(
    event: PointerEvent,
    edgeId: string,
    bendIndex: number,
    currentPoints: readonly Point[],
  ): void {
    if (currentPoints.length < 3) return;
    this.beginDrag(event, edgeId, bendIndex, currentPoints);
  }

  startInsertAndDrag(
    event: PointerEvent,
    edgeId: string,
    segmentIndex: number,
    currentPoints: readonly Point[],
  ): void {
    if (segmentIndex < 0 || segmentIndex >= currentPoints.length - 1) return;

    const midpoint = segmentMidpoint(
      currentPoints[segmentIndex],
      currentPoints[segmentIndex + 1],
    );
    const firstInsertAt = segmentIndex + 1;
    const withFirst = insertPoint(currentPoints, firstInsertAt, midpoint);
    const newPoints = insertPoint(withFirst, firstInsertAt + 1, midpoint);

    this.modelService.updateEdge(edgeId, {
      points: newPoints,
      routingMode: 'manual',
    });

    this.beginDrag(event, edgeId, firstInsertAt + 1, newPoints);
  }

  removeSegmentAtBend(
    edgeId: string,
    bendIndex: number,
    currentPoints: readonly Point[],
  ): void {
    const segmentIndex = segmentToRemoveForBend(currentPoints, bendIndex);
    if (segmentIndex < 0) return;
    const patch = removeSegment(currentPoints, segmentIndex, 'horizontal');
    this.modelService.updateEdge(edgeId, patch);
  }

  private beginDrag(
    event: PointerEvent,
    edgeId: string,
    bendIndex: number,
    points: readonly Point[],
  ): void {
    event.preventDefault();
    event.stopPropagation();

    this.dragState = {
      edgeId,
      bendIndex,
      pointerId: event.pointerId,
      originalPoints: points.slice(),
    };

    document.addEventListener('pointermove', this.onPointerMove);
    document.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('pointercancel', this.onPointerUp);
  }

  private move(event: PointerEvent): void {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const flowPos = this.viewportService.clientToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const nextPoints = moveBend(state.originalPoints, state.bendIndex, flowPos, 'horizontal');

    this.modelService.updateEdge(state.edgeId, {
      points: nextPoints,
      routingMode: 'manual',
    });
  }

  private end(event: PointerEvent): void {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;
    this.dragState = null;
    this.detachDocumentListeners();
  }

  private detachDocumentListeners(): void {
    document.removeEventListener('pointermove', this.onPointerMove);
    document.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('pointercancel', this.onPointerUp);
  }
}
