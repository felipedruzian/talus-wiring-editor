import { type Point } from 'ng-diagram';
import { type EdgeEndpointSide, type Orientation } from './path-types';

/**
 * Patches the port-side endpoint of an orthogonal manual-routed edge after the
 * connected node has moved, while keeping all user-placed interior bends in
 * place. `endpointOrientation` is the orientation of the stub leaving the
 * port — for a horizontal stub the neighbour shares Y with the port, for a
 * vertical stub it shares X.
 *
 * Returns null when the edge has fewer than 3 points.
 */
export const reflowEndpoint = (
  points: readonly Point[],
  side: EdgeEndpointSide,
  newPortPosition: Point,
  endpointOrientation: Orientation,
): Point[] | null => {
  if (points.length < 3) return null;

  const next = points.slice();
  const endpointIndex = side === 'source' ? 0 : next.length - 1;
  const neighbourIndex = side === 'source' ? 1 : next.length - 2;

  next[endpointIndex] = { x: newPortPosition.x, y: newPortPosition.y };

  if (endpointOrientation === 'horizontal') {
    next[neighbourIndex] = { x: next[neighbourIndex].x, y: newPortPosition.y };
  } else {
    next[neighbourIndex] = { x: newPortPosition.x, y: next[neighbourIndex].y };
  }

  return next;
};
