import { type Orientation } from './path-types';

/**
 * Minimum number of interior bends required for an orthogonal edge between
 * ports of the given orientations.
 *
 * - Same orientation: a Z-shape needs 2 bends (also covers the same-side U).
 *   When the ports happen to align on the perpendicular axis, the shape can
 *   collapse to 0; we don't return 0 here because that's a property of the
 *   actual coords, not the orientations alone.
 * - Perpendicular: an L-shape needs 1 bend.
 */
export const getDefaultMinInteriorBends = (
  sourceOrientation: Orientation,
  targetOrientation: Orientation,
): number => (sourceOrientation === targetOrientation ? 2 : 1);
