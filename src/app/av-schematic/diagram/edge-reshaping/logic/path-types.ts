import { type Edge, type Point, type RoutingMode } from 'ng-diagram';

export type EdgeEndpointSide = 'source' | 'target';

export type Orientation = 'horizontal' | 'vertical';

export interface EdgeRoutingPatch {
  points: Point[] | undefined;
  routingMode: RoutingMode;
}

export interface BendHandle {
  x: number;
  y: number;
  pointIndex: number;
}

export interface GhostHandle {
  x: number;
  y: number;
  segmentIndex: number;
}

export interface HandlerPositions {
  bends: BendHandle[];
  ghosts: GhostHandle[];
}

export interface ReshapeOptions {
  alignmentTolerance: number;
  endpointOffset: number;
  pointDistance: number;
  getMinInteriorBends: (edge: Edge) => number;
  gridSize?: { x: number; y: number };
}
