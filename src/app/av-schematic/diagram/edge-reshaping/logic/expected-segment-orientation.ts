import { type Orientation } from './path-types';

export const oppositeOrientation = (orientation: Orientation): Orientation =>
  orientation === 'horizontal' ? 'vertical' : 'horizontal';

/**
 * The orthogonal-invariant orientation of segment `index` in a path that exits
 * the source port with `sourceOrientation`. Segments alternate, so even indices
 * match the source, odd indices are perpendicular. This is *expected* — used
 * to enforce orthogonality even when a segment is currently degenerate (two
 * collocated points after a ghost-handle insert) and so has no coord-derived
 * orientation.
 */
export const expectedSegmentOrientation = (
  index: number,
  sourceOrientation: Orientation,
): Orientation => (index % 2 === 0 ? sourceOrientation : oppositeOrientation(sourceOrientation));
