import { type Orientation } from './types';

export const oppositeOrientation = (orientation: Orientation): Orientation =>
  orientation === 'horizontal' ? 'vertical' : 'horizontal';

/**
 * The orthogonal-invariant orientation of segment `index` in a path that exits
 * the source port with `sourceOrientation`. Segments alternate, so even indices
 * match the source, odd indices are perpendicular.
 */
export const expectedSegmentOrientation = (
  index: number,
  sourceOrientation: Orientation,
): Orientation => (index % 2 === 0 ? sourceOrientation : oppositeOrientation(sourceOrientation));
