import type { Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from './constants';

const COLLINEAR_TOL = POSITION_TOLERANCE_PX;

// Fold genuinely redundant interior points. A point folds only when collinear
// with its neighbours AND between them (a straight pass-through); a U-turn
// extremum is a real bend (e.g. a collapsed reshape) and is kept.
export const collapseCollinearBends = (points: readonly Point[]): Point[] => {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const result: Point[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const collinearX =
      Math.abs(prev.x - curr.x) < COLLINEAR_TOL &&
      Math.abs(curr.x - next.x) < COLLINEAR_TOL &&
      isBetween(prev.y, curr.y, next.y);
    const collinearY =
      Math.abs(prev.y - curr.y) < COLLINEAR_TOL &&
      Math.abs(curr.y - next.y) < COLLINEAR_TOL &&
      isBetween(prev.x, curr.x, next.x);
    if (collinearX || collinearY) continue;
    result.push({ x: curr.x, y: curr.y });
  }
  result.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
  return result;
}

// `b` within [a, c] (either order), with tolerance — pass-through vs U-turn.
const isBetween = (a: number, b: number, c: number): boolean =>
  b >= Math.min(a, c) - COLLINEAR_TOL && b <= Math.max(a, c) + COLLINEAR_TOL;

// Fold a route to its minimal set of bends: collinear pass-throughs, then
// same-axis near-collinear runs. A visually straight run becomes one segment.
export const normalizeRoute = (points: readonly Point[] | undefined): Point[] => {
  if (!points) return [];
  return dropSameAxisBends(collapseCollinearBends(points));
};

// Drop interior points whose incoming/outgoing segments share a dominant
// axis. Looser than `collapseCollinearBends` — catches quasi-collinear
// 3-point routes left sub-grid-misaligned by the reshape. L corners stay.
export const dropSameAxisBends = (points: readonly Point[]): Point[] => {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const result: Point[] = [{ x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const incomingAxis: 'h' | 'v' =
      Math.abs(curr.x - prev.x) > Math.abs(curr.y - prev.y) ? 'h' : 'v';
    const outgoingAxis: 'h' | 'v' =
      Math.abs(next.x - curr.x) > Math.abs(next.y - curr.y) ? 'h' : 'v';
    if (incomingAxis === outgoingAxis) continue;
    result.push({ x: curr.x, y: curr.y });
  }
  result.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
  return result;
}

/**
 * Drop collinear interior points within the given tolerance, merging three
 * consecutive segments into one when the middle bend is (nearly) on the line
 * from its neighbours. Always preserves the source and target endpoints.
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
}
