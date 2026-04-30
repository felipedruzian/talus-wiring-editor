import { type Point } from 'ng-diagram';
import { segmentMidpoint } from './point-array';
import { type BendHandle, type GhostHandle, type HandlerPositions } from './path-types';

/**
 * Computes the bend (vertex) and ghost (segment-midpoint) handle positions
 * for an orthogonal edge path. Bends sit at every interior vertex; ghosts sit
 * at the midpoint of every interior segment (segments 0 and last, which touch
 * the port stubs, get no ghost — there's no insert gesture there).
 *
 * Empty arrays for short paths so callers don't need to guard.
 */
export const getHandlerPositions = (points: readonly Point[]): HandlerPositions => {
  if (points.length < 3) return { bends: [], ghosts: [] };

  const bends: BendHandle[] = points.slice(1, -1).map((p, i) => ({
    x: p.x,
    y: p.y,
    pointIndex: i + 1,
  }));

  const ghosts: GhostHandle[] = [];
  for (let i = 1; i <= points.length - 3; i++) {
    const mid = segmentMidpoint(points[i], points[i + 1]);
    ghosts.push({ x: mid.x, y: mid.y, segmentIndex: i });
  }

  return { bends, ghosts };
};
