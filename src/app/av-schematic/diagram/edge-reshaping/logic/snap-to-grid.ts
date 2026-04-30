import { type Point } from 'ng-diagram';
import { expectedSegmentOrientation } from './expected-segment-orientation';
import { type Orientation } from './path-types';

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
export const snapToGrid = (
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
