import { type Point } from 'ng-diagram';
import { expectedSegmentOrientation } from './expected-segment-orientation';
import { type EdgeRoutingPatch, type Orientation } from './path-types';

/**
 * Removes a whole inter-bend segment (both of its endpoint bends) and snaps
 * the bridging segment back to a 90° angle. Refuses port-adjacent segments and
 * paths that would be left below the 2-interior-bend baseline.
 *
 * Note: this is the segment-removal model from the original AV schematic
 * implementation. Step 9 of the refactor replaces the right-click semantics
 * with bend-removal (delete one point, then run simplifyPath). Until then this
 * stays as the canonical removal op.
 */
export const removeSegment = (
  points: readonly Point[],
  segmentIndex: number,
  sourceOrientation: Orientation,
): EdgeRoutingPatch => {
  const interior = points.length - 2;
  if (interior - 2 < 2) return { points: points.slice(), routingMode: 'manual' };
  if (segmentIndex < 1 || segmentIndex > points.length - 3) {
    return { points: points.slice(), routingMode: 'manual' };
  }

  const next = points.slice();
  next.splice(segmentIndex, 2);

  const bridgingIsH =
    expectedSegmentOrientation(segmentIndex - 1, sourceOrientation) === 'horizontal';
  const leftIdx = segmentIndex - 1;
  const rightIdx = segmentIndex;
  const leftIsEndpoint = leftIdx === 0;

  if (bridgingIsH) {
    if (leftIsEndpoint) {
      next[rightIdx] = { x: next[rightIdx].x, y: next[leftIdx].y };
    } else {
      next[leftIdx] = { x: next[leftIdx].x, y: next[rightIdx].y };
    }
  } else {
    if (leftIsEndpoint) {
      next[rightIdx] = { x: next[leftIdx].x, y: next[rightIdx].y };
    } else {
      next[leftIdx] = { x: next[rightIdx].x, y: next[leftIdx].y };
    }
  }

  return { points: next, routingMode: 'manual' };
};

export const segmentToRemoveForBend = (
  points: readonly Point[],
  bendIndex: number,
): number => {
  const lastInteriorIdx = points.length - 2;
  if (bendIndex < 1 || bendIndex > lastInteriorIdx) return -1;

  const after = bendIndex;
  if (after >= 1 && after <= points.length - 3) return after;

  const before = bendIndex - 1;
  if (before >= 1 && before <= points.length - 3) return before;

  return -1;
};
