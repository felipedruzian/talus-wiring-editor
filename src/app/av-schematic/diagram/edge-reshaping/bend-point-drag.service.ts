import { Injectable } from '@angular/core';
import { type Point } from 'ng-diagram';

export interface DragState {
  edgeId: string;
  bendIndex: number;
  pointerId: number;
  originalPoints: readonly Point[];
  lastComputedPoints: readonly Point[];
}

/**
 * In-flight drag state for an edge-reshape gesture. Intentionally minimal:
 * just a single-slot store keyed by pointerId. The handler reads/writes
 * here; commands and the dispatcher don't touch this. When the feature
 * lands inside ng-diagram, this collapses into `ActionStateManager.edgeReshape`.
 */
@Injectable()
export class BendPointDragService {
  private state: DragState | null = null;

  set(state: DragState): void {
    this.state = state;
  }

  get(pointerId: number): DragState | null {
    return this.state?.pointerId === pointerId ? this.state : null;
  }

  updateLastComputed(pointerId: number, points: readonly Point[]): void {
    if (this.state?.pointerId === pointerId) {
      this.state = { ...this.state, lastComputedPoints: points };
    }
  }

  clear(pointerId: number): void {
    if (this.state?.pointerId === pointerId) this.state = null;
  }
}
