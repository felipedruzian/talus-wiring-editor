import { type Point } from 'ng-diagram';

export type EdgeEndpointSide = 'source' | 'target';

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
