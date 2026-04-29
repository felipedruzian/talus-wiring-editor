import { Injectable, inject } from '@angular/core';
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
export class BendPointDragService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly viewportService = inject(NgDiagramViewportService);

  private dragState: DragState | null = null;

  beginVertexDrag(
    edgeId: string,
    bendIndex: number,
    currentPoints: readonly Point[],
    pointerId: number,
  ): void {
    if (currentPoints.length < 3) return;
    this.dragState = {
      edgeId,
      bendIndex,
      pointerId,
      originalPoints: currentPoints.slice(),
    };
  }

  beginInsertAndDrag(
    edgeId: string,
    segmentIndex: number,
    currentPoints: readonly Point[],
    pointerId: number,
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

    this.dragState = {
      edgeId,
      bendIndex: firstInsertAt + 1,
      pointerId,
      originalPoints: newPoints,
    };
  }

  applyDragMove(clientX: number, clientY: number, pointerId: number): void {
    const state = this.dragState;
    if (!state || state.pointerId !== pointerId) return;

    const flowPos = this.viewportService.clientToFlowPosition({ x: clientX, y: clientY });
    const nextPoints = moveBend(state.originalPoints, state.bendIndex, flowPos, 'horizontal');

    this.modelService.updateEdge(state.edgeId, {
      points: nextPoints,
      routingMode: 'manual',
    });
  }

  endDrag(pointerId: number): void {
    if (!this.dragState || this.dragState.pointerId !== pointerId) return;
    this.dragState = null;
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
}
