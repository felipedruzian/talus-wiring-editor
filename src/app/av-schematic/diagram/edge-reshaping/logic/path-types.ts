export type EdgeEndpointSide = 'source' | 'target';

export type Orientation = 'horizontal' | 'vertical';

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
