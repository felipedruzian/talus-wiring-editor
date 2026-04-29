import { describe, expect, it } from 'vitest';
import {
  expectedSegmentOrientation,
  oppositeOrientation,
} from './expected-segment-orientation';

describe('oppositeOrientation', () => {
  it('flips horizontal to vertical', () => {
    expect(oppositeOrientation('horizontal')).toBe('vertical');
  });

  it('flips vertical to horizontal', () => {
    expect(oppositeOrientation('vertical')).toBe('horizontal');
  });
});

describe('expectedSegmentOrientation', () => {
  it('returns sourceOrientation for even indices', () => {
    expect(expectedSegmentOrientation(0, 'horizontal')).toBe('horizontal');
    expect(expectedSegmentOrientation(2, 'horizontal')).toBe('horizontal');
    expect(expectedSegmentOrientation(0, 'vertical')).toBe('vertical');
    expect(expectedSegmentOrientation(4, 'vertical')).toBe('vertical');
  });

  it('returns the opposite for odd indices', () => {
    expect(expectedSegmentOrientation(1, 'horizontal')).toBe('vertical');
    expect(expectedSegmentOrientation(3, 'horizontal')).toBe('vertical');
    expect(expectedSegmentOrientation(1, 'vertical')).toBe('horizontal');
  });
});
