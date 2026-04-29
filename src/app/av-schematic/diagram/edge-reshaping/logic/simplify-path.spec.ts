import { describe, expect, it } from 'vitest';
import { simplifyPath } from './simplify-path';

describe('simplifyPath', () => {
  describe('right ↔ left (H, H)', () => {
    it('leaves a clean Z-shape unchanged', () => {
      const ok = [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 200 },
        { x: 220, y: 200 },
      ];
      expect(simplifyPath(ok, 'horizontal', 'horizontal')).toEqual(ok);
    });

    it('merges three collinear segments back into one when interior bends are above the minimum', () => {
      const noisy = [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 100 },
        { x: 80, y: 200 },
        { x: 220, y: 200 },
      ];
      const simplified = simplifyPath(noisy, 'horizontal', 'horizontal', { minInteriorBends: 2 });
      expect(simplified).toEqual([
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 200 },
        { x: 220, y: 200 },
      ]);
    });

    it('refuses a merge that would drop interior bends below the minimum', () => {
      const zShape = [
        { x: 0, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 200 },
        { x: 220, y: 200 },
      ];
      const result = simplifyPath(zShape, 'horizontal', 'horizontal', { minInteriorBends: 2 });
      expect(result.length).toBe(4);
    });
  });

  describe('top ↔ bottom (V, V)', () => {
    it('snaps drifted segments to V/H alternation', () => {
      const drifted = [
        { x: 0, y: 0 },
        { x: 4, y: 80 },
        { x: 200, y: 84 },
        { x: 196, y: 220 },
      ];
      const result = simplifyPath(drifted, 'vertical', 'vertical', { alignmentTolerance: 0 });
      expect(result[0].x).toBe(result[1].x);
      expect(result[1].y).toBe(result[2].y);
      expect(result[2].x).toBe(result[3].x);
    });
  });

  describe('right ↔ top (H, V)', () => {
    it('keeps a clean L-shape unchanged', () => {
      const ok = [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
      ];
      expect(simplifyPath(ok, 'horizontal', 'vertical')).toEqual(ok);
    });
  });

  describe('grid snap', () => {
    it('snaps coordinates to the grid when gridSize is provided', () => {
      const path = [
        { x: 0, y: 0 },
        { x: 78, y: 0 },
        { x: 78, y: 197 },
        { x: 220, y: 197 },
      ];
      const result = simplifyPath(path, 'horizontal', 'horizontal', {
        gridSize: { x: 10, y: 10 },
      });
      expect(result[1].x).toBe(80);
      expect(result[2].y).toBe(200);
      expect(result[3].y).toBe(200);
    });
  });
});
