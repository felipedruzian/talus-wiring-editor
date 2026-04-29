import { describe, expect, it } from 'vitest';
import { getHandlerPositions } from './get-handler-positions';

describe('getHandlerPositions', () => {
  it('returns empty handles for paths under 3 points', () => {
    expect(
      getHandlerPositions([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({ bends: [], ghosts: [] });
  });

  describe('right ↔ left (H, H) — Z-shape', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 200 },
      { x: 220, y: 200 },
    ];

    it('produces a bend handle for each interior point', () => {
      const { bends } = getHandlerPositions(path);
      expect(bends).toEqual([
        { x: 80, y: 0, pointIndex: 1 },
        { x: 80, y: 200, pointIndex: 2 },
      ]);
    });

    it('produces ghost handles only at interior segment midpoints', () => {
      const { ghosts } = getHandlerPositions(path);
      expect(ghosts).toEqual([{ x: 80, y: 100, segmentIndex: 1 }]);
    });
  });

  describe('top ↔ bottom (V, V) — rotated Z-shape', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 200, y: 80 },
      { x: 200, y: 220 },
    ];

    it('locates bends at interior vertices regardless of segment orientation', () => {
      const { bends } = getHandlerPositions(path);
      expect(bends).toEqual([
        { x: 0, y: 80, pointIndex: 1 },
        { x: 200, y: 80, pointIndex: 2 },
      ]);
    });

    it('places ghost on the interior horizontal segment', () => {
      const { ghosts } = getHandlerPositions(path);
      expect(ghosts).toEqual([{ x: 100, y: 80, segmentIndex: 1 }]);
    });
  });

  describe('right ↔ top (H, V) — L-shape', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
    ];

    it('returns one bend handle, zero ghosts (no interior segment)', () => {
      const { bends, ghosts } = getHandlerPositions(path);
      expect(bends).toEqual([{ x: 200, y: 0, pointIndex: 1 }]);
      expect(ghosts).toEqual([]);
    });
  });

  describe('right ↔ right (H, H) — same-side U-shape', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 200 },
      { x: 0, y: 200 },
    ];

    it('returns 2 bends and 1 ghost (same shape as right↔left)', () => {
      const { bends, ghosts } = getHandlerPositions(path);
      expect(bends).toHaveLength(2);
      expect(ghosts).toHaveLength(1);
      expect(ghosts[0]).toEqual({ x: 80, y: 100, segmentIndex: 1 });
    });
  });
});
