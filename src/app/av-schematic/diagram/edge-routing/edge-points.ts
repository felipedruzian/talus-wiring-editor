import { type Point } from 'ng-diagram';

export type EdgeEndpointSide = 'source' | 'target';

const EPS = 0.5;

const isHorizontal = (a: Point, b: Point): boolean => Math.abs(a.y - b.y) < EPS;
const isVertical = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < EPS;

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

  const prevH = isHorizontal(prev, curr);
  const prevV = isVertical(prev, curr);
  const nextH = isHorizontal(curr, next);
  const nextV = isVertical(curr, next);

  const yLocked = (prevH && prevIsEndpoint) || (nextH && nextIsEndpoint);
  const xLocked = (prevV && prevIsEndpoint) || (nextV && nextIsEndpoint);

  const newX = xLocked ? curr.x : newPosition.x;
  const newY = yLocked ? curr.y : newPosition.y;

  result[index] = { x: newX, y: newY };

  if (!prevIsEndpoint) {
    if (prevH) result[index - 1] = { x: prev.x, y: newY };
    else if (prevV) result[index - 1] = { x: newX, y: prev.y };
  }
  if (!nextIsEndpoint) {
    if (nextH) result[index + 1] = { x: next.x, y: newY };
    else if (nextV) result[index + 1] = { x: newX, y: next.y };
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
