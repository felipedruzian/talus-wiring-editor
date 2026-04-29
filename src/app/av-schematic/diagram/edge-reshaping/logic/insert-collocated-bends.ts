import { type Point } from 'ng-diagram';
import { insertPoint, segmentMidpoint } from './point-array';

export interface CollocatedInsertion {
  points: Point[];
  newBendIndex: number;
}

/**
 * Splits a segment by inserting two collocated bends at its midpoint. The
 * caller drags the second of the two; the pair pulls apart along the
 * perpendicular axis as the user drags, growing an L-shaped detour. Returns
 * null when the segment index is out of range.
 */
export const insertCollocatedBends = (
  points: readonly Point[],
  segmentIndex: number,
): CollocatedInsertion | null => {
  if (segmentIndex < 0 || segmentIndex >= points.length - 1) return null;
  const midpoint = segmentMidpoint(points[segmentIndex], points[segmentIndex + 1]);
  const firstInsertAt = segmentIndex + 1;
  const withFirst = insertPoint(points, firstInsertAt, midpoint);
  const next = insertPoint(withFirst, firstInsertAt + 1, midpoint);
  return { points: next, newBendIndex: firstInsertAt + 1 };
};
