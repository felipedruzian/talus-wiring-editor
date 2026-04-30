import { type Point } from 'ng-diagram';
import { ALIGNMENT_TOLERANCE, ENDPOINT_OFFSET, MAX_SAFE_ITERATIONS } from './constants';
import { correctPath } from './correct-path';
import { expectedSegmentOrientation } from './expected-segment-orientation';
import { type Orientation } from './path-types';
import { removeStraightSegments } from './remove-straight-segments';

export interface SimplifyOptions {
  alignmentTolerance: number;
  endpointOffset: number;
  minInteriorBends: number;
  gridSize?: { x: number; y: number };
}

const defaults: SimplifyOptions = {
  alignmentTolerance: ALIGNMENT_TOLERANCE,
  endpointOffset: ENDPOINT_OFFSET,
  minInteriorBends: 0,
};

/**
 * Grid-snap that respects orthogonal-edge constraints:
 * - Source/target endpoints are driven by port positions — never snapped.
 * - First and last bends share an axis with their port (e.g. H stub →
 *   first bend's y equals source.y); that axis must stay aligned, not be
 *   snapped.
 * - Only the shared coord of an interior segment (one whose neither
 *   endpoint is a port) is free to snap. Snapping that one coord and
 *   propagating it to both segment endpoints preserves orthogonality and
 *   keeps the constrained axes intact.
 */
const snapToGrid = (
  points: readonly Point[],
  grid: { x: number; y: number },
  sourceOrientation: Orientation,
): Point[] => {
  if (points.length < 4) return points.slice();

  const result = points.map((p) => ({ ...p }));

  for (let segIdx = 1; segIdx <= result.length - 3; segIdx++) {
    const orient = expectedSegmentOrientation(segIdx, sourceOrientation);
    const a = result[segIdx];
    const b = result[segIdx + 1];

    if (orient === 'horizontal') {
      const snapped = Math.round(a.y / grid.y) * grid.y;
      a.y = snapped;
      b.y = snapped;
    } else {
      const snapped = Math.round(a.x / grid.x) * grid.x;
      a.x = snapped;
      b.x = snapped;
    }
  }

  return result;
};

const samePath = (a: readonly Point[], b: readonly Point[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
};

/**
 * Iteratively normalises a (possibly mid-drag-noisy) orthogonal path:
 * removes collinear bends, snaps drifted segments back to H/V alternation,
 * enforces the endpoint min-length, and optionally snaps to grid. Bails out
 * after MAX_SAFE_ITERATIONS — convergence is fast in practice but the loop
 * is bounded for safety.
 *
 * Honors `minInteriorBends`: if a collinear merge would drop below the
 * minimum, the bend is preserved and only the corrective pass runs.
 */
export const simplifyPath = (
  points: readonly Point[],
  sourceOrientation: Orientation,
  targetOrientation: Orientation,
  options?: Partial<SimplifyOptions>,
): Point[] => {
  const opts: SimplifyOptions = { ...defaults, ...options };
  let current = points.slice();

  for (let i = 0; i < MAX_SAFE_ITERATIONS; i++) {
    const previousLength = current.length;
    const removed = removeStraightSegments(current, opts.alignmentTolerance);
    const removedInterior = removed.length - 2;
    const candidate = removedInterior >= opts.minInteriorBends ? removed : current;

    let next = correctPath(candidate, sourceOrientation, targetOrientation, opts.endpointOffset);
    if (opts.gridSize) next = snapToGrid(next, opts.gridSize, sourceOrientation);

    if (samePath(next, current) && next.length === previousLength) return next;
    current = next;
  }

  return current;
};
