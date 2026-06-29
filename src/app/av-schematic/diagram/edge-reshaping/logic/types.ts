import type { Point } from 'ng-diagram';

export type Orientation = 'horizontal' | 'vertical';

export type EdgeEndpointSide = 'source' | 'target';

// How an edge end behaves under reshape: a fixed port ('anchored' — end
// segments grow an L-bend instead of dragging the end) or a loose end
// ('dangling' — nothing to anchor).
export type ReshapeEndpointKind = 'anchored' | 'dangling';

// One draggable segment of a selected edge: where its handle sits and how its
// ends behave when dragged. Produced by findReshapeableSegments per orthogonal segment.
export interface ReshapeSegment {
  readonly segmentIndex: number;
  readonly midpoint: Point;
  readonly axis: Orientation;
  // True when this end-segment touches an anchored port: drag grows an L-bend
  // off the port instead of dragging the port itself (see reshapeAnchoredSegment).
  readonly anchorPortAtSource: boolean;
  readonly anchorPortAtTarget: boolean;
}
