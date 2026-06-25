// Reshapes an orthogonal edge when its endpoints move (a node drag, a relink),
// keeping every segment axis-aligned and preserving the user's interior bends.
import type { Point } from 'ng-diagram';
import { POSITION_TOLERANCE_PX } from './constants';
import { collapseCollinearBends } from './simplify';

const COLLINEAR_TOL = POSITION_TOLERANCE_PX;

// Project an orthogonal route onto new endpoints, preserving interior bends.
// Equal endpoint deltas → rigid translation, otherwise each moved end slides the
// touching bend along its cross-axis. Returns null when the result can't stay
// orthogonal — `stretchPolylineWithBendInsertion` then inserts an L-bend.
export function stretchPolyline(
  points: readonly Point[],
  newSource: Point | null,
  newTarget: Point | null,
): Point[] | null {
  if (points.length < 2) return null;
  if (!newSource && !newTarget) return points.map((p) => ({ x: p.x, y: p.y }));

  if (newSource && newTarget) {
    const lastIdx = points.length - 1;
    const dxS = newSource.x - points[0].x;
    const dyS = newSource.y - points[0].y;
    const dxT = newTarget.x - points[lastIdx].x;
    const dyT = newTarget.y - points[lastIdx].y;
    if (Math.abs(dxS - dxT) < COLLINEAR_TOL && Math.abs(dyS - dyT) < COLLINEAR_TOL) {
      return points.map((p) => ({ x: p.x + dxS, y: p.y + dyS }));
    }
  }

  const result: Point[] = points.map((p) => ({ x: p.x, y: p.y }));

  if (newSource) {
    result[0] = { x: newSource.x, y: newSource.y };
    if (result.length > 2) {
      const adjacent = result[1];
      const oldSource = points[0];
      const horizontal = Math.abs(oldSource.y - adjacent.y) < COLLINEAR_TOL;
      const vertical = Math.abs(oldSource.x - adjacent.x) < COLLINEAR_TOL;
      if (horizontal) {
        result[1] = { x: adjacent.x, y: newSource.y };
      } else if (vertical) {
        result[1] = { x: newSource.x, y: adjacent.y };
      } else {
        return null;
      }
    }
  }

  if (newTarget) {
    const lastIdx = result.length - 1;
    result[lastIdx] = { x: newTarget.x, y: newTarget.y };
    if (result.length > 2) {
      const adjacent = result[lastIdx - 1];
      const oldTarget = points[lastIdx];
      const horizontal = Math.abs(oldTarget.y - adjacent.y) < COLLINEAR_TOL;
      const vertical = Math.abs(oldTarget.x - adjacent.x) < COLLINEAR_TOL;
      if (horizontal) {
        result[lastIdx - 1] = { x: adjacent.x, y: newTarget.y };
      } else if (vertical) {
        result[lastIdx - 1] = { x: newTarget.x, y: adjacent.y };
      } else {
        return null;
      }
    }
  }

  // Reject any middle-seam diagonal; zero-length segments are kept and folded
  // later by `collapseCollinearBends`.
  for (let i = 0; i < result.length - 1; i++) {
    const sameX = Math.abs(result[i].x - result[i + 1].x) < COLLINEAR_TOL;
    const sameY = Math.abs(result[i].y - result[i + 1].y) < COLLINEAR_TOL;
    if (!sameX && !sameY) return null;
  }

  return result;
}

// Like `stretchPolyline`, but for manual-mode moves: inserts at most one L-bend
// at each drifted end when strict stretch can't preserve the interior bends.
// Null only when even bend insertion fails.
export function stretchPolylineWithBendInsertion(
  points: readonly Point[],
  newSource: Point | null,
  newTarget: Point | null,
): Point[] | null {
  if (points.length < 2) return null;
  if (!newSource && !newTarget)
    return collapseCollinearBends(points.map((p) => ({ x: p.x, y: p.y })));

  const strict = stretchPolyline(points, newSource, newTarget);
  if (strict) return collapseCollinearBends(strict);

  let working: Point[] = points.map((p) => ({ x: p.x, y: p.y }));

  if (newSource) {
    const next = insertSourceBend(working, newSource);
    if (!next) return null;
    working = next;
  }
  if (newTarget) {
    const next = insertTargetBend(working, newTarget);
    if (!next) return null;
    working = next;
  }

  for (let i = 0; i < working.length - 1; i++) {
    const sameX = Math.abs(working[i].x - working[i + 1].x) < COLLINEAR_TOL;
    const sameY = Math.abs(working[i].y - working[i + 1].y) < COLLINEAR_TOL;
    if (!sameX && !sameY) return null;
  }
  return collapseCollinearBends(working);
}

// Re-anchor the source end to `newSource`, adding one L-bend so the first
// segment keeps its original axis. Null when the original first segment wasn't
// axis-aligned.
function insertSourceBend(points: readonly Point[], newSource: Point): Point[] | null {
  const sourcePoint = points[0];
  const nextPoint = points[1];
  const wasVertical = Math.abs(sourcePoint.x - nextPoint.x) < COLLINEAR_TOL;
  const wasHorizontal = Math.abs(sourcePoint.y - nextPoint.y) < COLLINEAR_TOL;
  if (!wasVertical && !wasHorizontal) return null;

  const tail = points.slice(1).map((p) => ({ x: p.x, y: p.y }));

  if (wasVertical) {
    if (Math.abs(newSource.x - nextPoint.x) < COLLINEAR_TOL) {
      return [{ x: newSource.x, y: newSource.y }, ...tail];
    }
    return [{ x: newSource.x, y: newSource.y }, { x: nextPoint.x, y: newSource.y }, ...tail];
  }
  if (Math.abs(newSource.y - nextPoint.y) < COLLINEAR_TOL) {
    return [{ x: newSource.x, y: newSource.y }, ...tail];
  }
  return [{ x: newSource.x, y: newSource.y }, { x: newSource.x, y: nextPoint.y }, ...tail];
}

// Mirror of `insertSourceBend` for the target end.
function insertTargetBend(points: readonly Point[], newTarget: Point): Point[] | null {
  const lastIdx = points.length - 1;
  const targetPoint = points[lastIdx];
  const prevPoint = points[lastIdx - 1];
  const wasVertical = Math.abs(targetPoint.x - prevPoint.x) < COLLINEAR_TOL;
  const wasHorizontal = Math.abs(targetPoint.y - prevPoint.y) < COLLINEAR_TOL;
  if (!wasVertical && !wasHorizontal) return null;

  const head = points.slice(0, lastIdx).map((p) => ({ x: p.x, y: p.y }));

  if (wasVertical) {
    if (Math.abs(newTarget.x - prevPoint.x) < COLLINEAR_TOL) {
      return [...head, { x: newTarget.x, y: newTarget.y }];
    }
    return [...head, { x: prevPoint.x, y: newTarget.y }, { x: newTarget.x, y: newTarget.y }];
  }
  if (Math.abs(newTarget.y - prevPoint.y) < COLLINEAR_TOL) {
    return [...head, { x: newTarget.x, y: newTarget.y }];
  }
  return [...head, { x: newTarget.x, y: prevPoint.y }, { x: newTarget.x, y: newTarget.y }];
}
