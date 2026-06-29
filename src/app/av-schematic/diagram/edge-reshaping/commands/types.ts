import type { Point } from 'ng-diagram';
import type { Orientation } from '../logic';

// Low-level: replace an edge's route, pinned to manual mode.
export interface SetEdgeRouteCommand {
  readonly kind: 'set-edge-route';
  readonly edgeId: string;
  readonly points: readonly Point[];
}

// Reshape: apply one live segment move (re-anchor to ports, orthogonalize, write).
export interface ReshapeMoveCommand {
  readonly kind: 'reshape-move';
  readonly edgeId: string;
  readonly initialPoints: readonly Point[];
  readonly segmentIndex: number;
  readonly axis: Orientation;
  readonly anchorPortAtSource: boolean;
  readonly anchorPortAtTarget: boolean;
  readonly grid: { x: number; y: number } | null;
  readonly dxWorld: number;
  readonly dyWorld: number;
}

// Reshape: fold redundant bends once, on drop.
export interface ReshapeFinishCommand {
  readonly kind: 'reshape-finish';
  readonly edgeId: string;
}

export type EdgeCommand = SetEdgeRouteCommand | ReshapeMoveCommand | ReshapeFinishCommand;
