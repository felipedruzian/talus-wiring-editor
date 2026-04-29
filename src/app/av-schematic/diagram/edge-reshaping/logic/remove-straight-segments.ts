import { type Point } from 'ng-diagram';

/**
 * Drops collinear interior points within the given tolerance, merging
 * three consecutive segments into one when the middle bend is (nearly)
 * on the line from its neighbours. Always preserves the source endpoint
 * (index 0) and the target endpoint (last index).
 */
export const removeStraightSegments = (
  points: readonly Point[],
  alignmentTolerance: number,
): Point[] => {
  if (points.length < 3) return points.slice();

  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const xAligned =
      Math.abs(prev.x - curr.x) <= alignmentTolerance &&
      Math.abs(curr.x - next.x) <= alignmentTolerance;
    const yAligned =
      Math.abs(prev.y - curr.y) <= alignmentTolerance &&
      Math.abs(curr.y - next.y) <= alignmentTolerance;

    if (xAligned || yAligned) continue;
    result.push(curr);
  }
  result.push(points[points.length - 1]);
  return result;
};
