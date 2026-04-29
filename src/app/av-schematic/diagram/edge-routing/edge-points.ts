import { type Point, type RoutingMode } from 'ng-diagram';

export type EdgeEndpointSide = 'source' | 'target';

export interface EdgeRoutingPatch {
  points: Point[] | undefined;
  routingMode: RoutingMode;
}

// AV ports always sit on the left/right side of devices, so the source stub
// (segment 0) is always horizontal. Subsequent segments alternate.
const isHorizontalSegment = (segmentIndex: number): boolean => segmentIndex % 2 === 0;

export const insertPoint = (
  points: readonly Point[],
  index: number,
  point: Point,
): Point[] => {
  const next = points.slice();
  next.splice(index, 0, point);
  return next;
};

export const deletePoint = (
  points: readonly Point[],
  index: number,
): Point[] => {
  const next = points.slice();
  next.splice(index, 1);
  return next;
};

export const segmentMidpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

/**
 * Removes a whole inter-bend segment (both of its endpoint bends) and snaps
 * the bridging segment back to a 90° angle. We deliberately do NOT support
 * removing a single bend — that would always leave a non-orthogonal corner.
 *
 * Refuses the operation (returns the original points unchanged) when:
 * - the segment is not "interior" (one of its endpoints is the source/target
 *   port — those can't be deleted),
 * - the path would be left with fewer than 2 interior bends (callers shouldn't
 *   reach below the auto-routed Z-shape baseline).
 *
 * Re-alignment: after dropping `points[k]` and `points[k+1]`, the new
 * bridging segment lies at index `k-1` of the new path. Its expected
 * orientation matches the alternation pattern (`H,V,H,V,...` from segment 0).
 * To restore that, we move the LEFT bridge endpoint onto the right one's
 * shared coordinate. If the left side is the source port (immovable), we move
 * the right side instead.
 */
export const removeSegment = (
  points: readonly Point[],
  segmentIndex: number,
): EdgeRoutingPatch => {
  const interior = points.length - 2;
  if (interior - 2 < 2) return { points: points.slice(), routingMode: 'manual' };
  if (segmentIndex < 1 || segmentIndex > points.length - 3) {
    return { points: points.slice(), routingMode: 'manual' };
  }

  const next = points.slice();
  next.splice(segmentIndex, 2);

  const bridgingIsH = isHorizontalSegment(segmentIndex - 1);
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

/**
 * Picks the segment to remove when the user right-clicks a bend. Prefers the
 * segment AFTER the bend; if that one isn't removable (its other endpoint is
 * the target port), falls back to the segment BEFORE. Returns -1 if neither
 * side is removable.
 */
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

/**
 * Moves an interior bend to a new flow position while preserving orthogonality
 * of the adjacent segments. If a segment's other endpoint is the source/target
 * port (a fixed endpoint), the perpendicular axis is locked instead of
 * propagating the move into the port. Free interior neighbours are nudged in
 * the same direction so each segment's H/V character is kept.
 */
export const moveBend = (
  points: readonly Point[],
  index: number,
  newPosition: Point,
): Point[] => {
  if (index <= 0 || index >= points.length - 1) return points.slice();

  const result = points.slice();
  const prev = result[index - 1];
  const curr = result[index];
  const next = result[index + 1];

  const prevIsEndpoint = index - 1 === 0;
  const nextIsEndpoint = index + 1 === result.length - 1;

  const prevH = isHorizontalSegment(index - 1);
  const nextH = isHorizontalSegment(index);

  const yLocked = (prevH && prevIsEndpoint) || (nextH && nextIsEndpoint);
  const xLocked = (!prevH && prevIsEndpoint) || (!nextH && nextIsEndpoint);

  const newX = xLocked ? curr.x : newPosition.x;
  const newY = yLocked ? curr.y : newPosition.y;

  result[index] = { x: newX, y: newY };

  if (!prevIsEndpoint) {
    if (prevH) result[index - 1] = { x: prev.x, y: newY };
    else result[index - 1] = { x: newX, y: prev.y };
  }
  if (!nextIsEndpoint) {
    if (nextH) result[index + 1] = { x: next.x, y: newY };
    else result[index + 1] = { x: newX, y: next.y };
  }

  return result;
};

/**
 * Patches the port-side endpoint of an orthogonal manual-routed edge after the
 * connected node has moved, while keeping all user-placed interior bends in
 * place. Relies on the AV-schematic invariant that ports sit on the left/right
 * sides of nodes, so the stub leaving the port is always horizontal.
 *
 * Returns null when the edge has fewer than 3 points — there is no interior
 * bend to anchor against, so the caller should flip the edge back to auto
 * routing instead.
 */
export const reflowEndpoint = (
  points: readonly Point[],
  side: EdgeEndpointSide,
  newPortPosition: Point,
): Point[] | null => {
  if (points.length < 3) return null;

  const next = points.slice();
  const endpointIndex = side === 'source' ? 0 : next.length - 1;
  const neighbourIndex = side === 'source' ? 1 : next.length - 2;

  next[endpointIndex] = { x: newPortPosition.x, y: newPortPosition.y };
  next[neighbourIndex] = {
    x: next[neighbourIndex].x,
    y: newPortPosition.y,
  };

  return next;
};
