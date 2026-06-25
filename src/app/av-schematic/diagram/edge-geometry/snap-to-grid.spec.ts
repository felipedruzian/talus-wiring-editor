import { describe, expect, it } from 'vitest';
import { type Point } from 'ng-diagram';
import { snapToGrid } from './snap-to-grid';

const grid = { x: 20, y: 20 };

describe('snapToGrid', () => {
  const route: Point[] = [
    { x: 0, y: 0 },
    { x: 53, y: 0 },
    { x: 53, y: 97 },
    { x: 100, y: 97 },
  ];

  it('leaves port-driven endpoints and their stub segments untouched', () => {
    const result = snapToGrid(route, grid, 'horizontal');
    // First and last points are stub-anchored to ports → unchanged.
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[result.length - 1]).toEqual({ x: 100, y: 97 });
  });

  it('snaps the shared coord of an interior segment to the grid', () => {
    const result = snapToGrid(route, grid, 'horizontal');
    // Interior vertical segment at x=53 snaps to 60, on both its vertices.
    expect(result[1].x).toBe(60);
    expect(result[2].x).toBe(60);
  });

  it('snaps a dangling source stub when sourceFree is set', () => {
    const result = snapToGrid(route, grid, 'horizontal', { sourceFree: true });
    // With a free source the first (horizontal) segment's Y snaps; here already 0.
    expect(result[0].y).toBe(0);
  });

  it('returns a copy for degenerate paths', () => {
    const single: Point[] = [{ x: 1, y: 1 }];
    const result = snapToGrid(single, grid, 'horizontal');
    expect(result).toEqual(single);
    expect(result).not.toBe(single);
  });
});
