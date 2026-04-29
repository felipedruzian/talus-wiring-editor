import { describe, expect, it } from 'vitest';
import { correctPath } from './correct-path';

describe('correctPath', () => {
  describe('right ↔ left (H, H)', () => {
    it('snaps a drifted V segment back to vertical', () => {
      const drifted = [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 85, y: 200 },
        { x: 220, y: 200 },
      ];
      const result = correctPath(drifted, 'horizontal', 'horizontal', 1);
      expect(result[1].y).toBe(0);
      expect(result[2].x).toBe(result[1].x);
      expect(result[3]).toEqual({ x: 220, y: 200 });
    });

    it('leaves an already-orthogonal Z-shape unchanged', () => {
      const ok = [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 200 },
        { x: 220, y: 200 },
      ];
      expect(correctPath(ok, 'horizontal', 'horizontal', 1)).toEqual(ok);
    });
  });

  describe('top ↔ bottom (V, V)', () => {
    it('keeps even segments vertical and odd horizontal', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 5, y: 80 },
        { x: 200, y: 85 },
        { x: 205, y: 220 },
      ];
      const result = correctPath(path, 'vertical', 'vertical', 1);
      expect(result[0].x).toBe(result[1].x);
      expect(result[1].y).toBe(result[2].y);
      expect(result[2].x).toBe(result[3].x);
    });
  });

  describe('right ↔ top (H, V) — L-shape', () => {
    it('preserves a clean L-shape', () => {
      const ok = [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
      ];
      expect(correctPath(ok, 'horizontal', 'vertical', 1)).toEqual(ok);
    });

    it('snaps a drifted L back to orthogonal', () => {
      const drifted = [
        { x: 0, y: 0 },
        { x: 200, y: 5 },
        { x: 195, y: 200 },
      ];
      const result = correctPath(drifted, 'horizontal', 'vertical', 1);
      expect(result[1].y).toBe(0);
      expect(result[2].x).toBe(result[1].x);
    });
  });

  describe('endpoint offset', () => {
    it('nudges the last interior point off the target when the last segment has collapsed to zero length', () => {
      const collapsed = [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 0 },
      ];
      const result = correctPath(collapsed, 'horizontal', 'vertical', 1);
      expect(result[1]).not.toEqual(result[2]);
    });

    it('nudges along the segment expected axis (vertical-source case)', () => {
      const collapsed = [
        { x: 0, y: 0 },
        { x: 0, y: 80 },
        { x: 0, y: 80 },
      ];
      const result = correctPath(collapsed, 'vertical', 'horizontal', 1);
      expect(result[2]).not.toEqual(result[1]);
    });
  });

  it('does not mutate the input', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 80, y: 5 },
      { x: 220, y: 200 },
    ];
    const snapshot = JSON.stringify(path);
    correctPath(path, 'horizontal', 'vertical', 1);
    expect(JSON.stringify(path)).toBe(snapshot);
  });
});
