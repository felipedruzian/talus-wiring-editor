import { type Point } from 'ng-diagram';
import { expectedSegmentOrientation } from './expected-segment-orientation';
import { type Orientation } from './path-types';

/**
 * Repairs an orthogonal path so segments alternate H/V starting from the
 * source-port orientation. Where a segment has drifted off-axis, snaps it
 * back. After alternation, if the first or last segment has collapsed to
 * zero length (interior point coincident with the port endpoint), nudges
 * the interior point by `endpointOffset` along the segment's expected axis
 * so the corner remains measurable.
 *
 * `targetOrientation` is currently unused — bend-count mismatches (e.g.,
 * H source + V target with an even number of segments) are not the
 * concern of this pass; simplifyPath handles bend counts elsewhere. The
 * parameter is kept on the signature so callers don't need to change when
 * the simplify loop later consults it.
 */
export const correctPath = (
  points: readonly Point[],
  sourceOrientation: Orientation,
  _targetOrientation: Orientation,
  endpointOffset: number,
): Point[] => {
  if (points.length < 2) return points.slice();

  const result = points.map((p) => ({ ...p }));

  for (let segIdx = 0; segIdx < result.length - 1; segIdx++) {
    const expected = expectedSegmentOrientation(segIdx, sourceOrientation);
    const a = result[segIdx];
    const b = result[segIdx + 1];

    if (expected === 'horizontal' && a.y !== b.y) {
      if (segIdx === result.length - 2) a.y = b.y;
      else b.y = a.y;
    } else if (expected === 'vertical' && a.x !== b.x) {
      if (segIdx === result.length - 2) a.x = b.x;
      else b.x = a.x;
    }
  }

  if (result.length >= 2) {
    const firstA = result[0];
    const firstB = result[1];
    if (firstA.x === firstB.x && firstA.y === firstB.y) {
      const firstExpected = expectedSegmentOrientation(0, sourceOrientation);
      if (firstExpected === 'horizontal') firstB.x += endpointOffset;
      else firstB.y += endpointOffset;
    }
  }

  if (result.length >= 3) {
    const lastA = result[result.length - 2];
    const lastB = result[result.length - 1];
    if (lastA.x === lastB.x && lastA.y === lastB.y) {
      const lastExpected = expectedSegmentOrientation(result.length - 2, sourceOrientation);
      if (lastExpected === 'horizontal') lastA.x -= endpointOffset;
      else lastA.y -= endpointOffset;
    }
  }

  return result;
};
