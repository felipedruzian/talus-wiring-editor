import { type Point } from 'ng-diagram';

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
