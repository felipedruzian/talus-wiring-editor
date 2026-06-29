import { type Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from './constants';
import { type EdgeEndpointSide, type Orientation } from './types';

/**
 * Replace each oblique segment with a vertical-first L-bend, leaving already
 * orthogonal segments untouched. Used per-move to mop up any diagonal left by
 * re-anchoring an endpoint to a drifted port. The drag-end merge later folds
 * any inserted bend that turns out collinear.
 *
 * Vertical-first means the segment *arriving* at each vertex is horizontal —
 * the correct approach for AV's left/right ports.
 */
export const orthogonalizePolyline = (points: readonly Point[]): Point[] => {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const result: Point[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const sameX = Math.abs(prev.x - curr.x) < POSITION_TOLERANCE_PX;
    const sameY = Math.abs(prev.y - curr.y) < POSITION_TOLERANCE_PX;
    if (sameX || sameY) {
      result.push({ x: curr.x, y: curr.y });
      continue;
    }
    result.push({ x: prev.x, y: curr.y });
    result.push({ x: curr.x, y: curr.y });
  }
  return result;
};

/**
 * Snap the anchored end-point's neighbour onto the given axis to undo sub-pixel
 * port drift after the end was re-anchored to its live port. No-op for an
 * oblique end-segment (axis === null).
 */
export const realignEndpointNeighbor = (
  points: { x: number; y: number }[],
  side: EdgeEndpointSide,
  axis: Orientation | null,
): void => {
  if (axis === null || points.length < 2) return;
  const endIdx = side === 'source' ? 0 : points.length - 1;
  const neighborIdx = side === 'source' ? 1 : points.length - 2;
  if (axis === 'vertical') {
    points[neighborIdx].x = points[endIdx].x;
  } else {
    points[neighborIdx].y = points[endIdx].y;
  }
};
