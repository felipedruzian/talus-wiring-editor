import { type Point } from 'ng-diagram';
import { expectedSegmentOrientation } from './expected-segment-orientation';
import { type Orientation } from './path-types';

export const moveBend = (
  points: readonly Point[],
  index: number,
  newPosition: Point,
  sourceOrientation: Orientation,
): Point[] => {
  if (index <= 0 || index >= points.length - 1) return points.slice();

  const result = points.slice();
  const prev = result[index - 1];
  const curr = result[index];
  const next = result[index + 1];

  const prevIsEndpoint = index - 1 === 0;
  const nextIsEndpoint = index + 1 === result.length - 1;

  const prevIsHorizontal =
    expectedSegmentOrientation(index - 1, sourceOrientation) === 'horizontal';
  const nextIsHorizontal = expectedSegmentOrientation(index, sourceOrientation) === 'horizontal';

  const yLocked = (prevIsHorizontal && prevIsEndpoint) || (nextIsHorizontal && nextIsEndpoint);
  const xLocked = (!prevIsHorizontal && prevIsEndpoint) || (!nextIsHorizontal && nextIsEndpoint);

  const newX = xLocked ? curr.x : newPosition.x;
  const newY = yLocked ? curr.y : newPosition.y;

  result[index] = { x: newX, y: newY };

  if (!prevIsEndpoint) {
    if (prevIsHorizontal) result[index - 1] = { x: prev.x, y: newY };
    else result[index - 1] = { x: newX, y: prev.y };
  }
  if (!nextIsEndpoint) {
    if (nextIsHorizontal) result[index + 1] = { x: next.x, y: newY };
    else result[index + 1] = { x: newX, y: next.y };
  }

  return result;
};
