import { describe, expect, it } from 'vitest';
import { getDefaultMinInteriorBends } from './get-default-min-interior-bends';

describe('getDefaultMinInteriorBends', () => {
  it('returns 2 for matching orientations (Z-shape, U-shape)', () => {
    expect(getDefaultMinInteriorBends('horizontal', 'horizontal')).toBe(2);
    expect(getDefaultMinInteriorBends('vertical', 'vertical')).toBe(2);
  });

  it('returns 1 for perpendicular orientations (L-shape)', () => {
    expect(getDefaultMinInteriorBends('horizontal', 'vertical')).toBe(1);
    expect(getDefaultMinInteriorBends('vertical', 'horizontal')).toBe(1);
  });
});
