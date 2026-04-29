import { Injectable, inject } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramViewportService,
  type Point,
} from 'ng-diagram';
import { moveBend } from './edge-points';

interface DragState {
  edgeId: string;
  bendIndex: number;
  pointerId: number;
  target: Element;
  originalPoints: readonly Point[];
}

@Injectable()
export class BendPointDragService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly viewportService = inject(NgDiagramViewportService);

  private dragState: DragState | null = null;

  start(event: PointerEvent, edgeId: string, bendIndex: number, currentPoints: readonly Point[]): void {
    if (currentPoints.length < 3) return;

    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as Element | null;
    if (!target) return;
    target.setPointerCapture(event.pointerId);

    this.dragState = {
      edgeId,
      bendIndex,
      pointerId: event.pointerId,
      target,
      originalPoints: currentPoints.slice(),
    };
  }

  move(event: PointerEvent): void {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const flowPos = this.viewportService.clientToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const nextPoints = moveBend(state.originalPoints, state.bendIndex, flowPos);

    this.modelService.updateEdge(state.edgeId, {
      points: nextPoints,
      routingMode: 'manual',
    });
  }

  end(event: PointerEvent): void {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    if (state.target.hasPointerCapture(event.pointerId)) {
      state.target.releasePointerCapture(event.pointerId);
    }
    this.dragState = null;
  }
}
