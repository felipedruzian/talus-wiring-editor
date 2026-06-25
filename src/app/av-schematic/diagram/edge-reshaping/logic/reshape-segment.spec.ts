import { describe, expect, it } from 'vitest';
import { type Point } from 'ng-diagram';
import { findReshapeableSegments, reshapeSegment, reshapeAnchoredSegment } from './reshape-segment';

// An L-shaped route: source (0,0) → corner (100,0) → target (100,100).
const lShape: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
];

describe('findReshapeableSegments', () => {
  it('returns one descriptor per orthogonal segment', () => {
    const segments = findReshapeableSegments(lShape, 'anchored', 'anchored');
    expect(segments.map((s) => s.segmentIndex)).toEqual([0, 1]);
    expect(segments[0].axis).toBe('horizontal');
    expect(segments[1].axis).toBe('vertical');
  });

  it('places the handle at the segment midpoint', () => {
    const [first] = findReshapeableSegments(lShape, 'anchored', 'anchored');
    expect(first.midpoint).toEqual({ x: 50, y: 0 });
  });

  it('flags port anchoring only for the matching end segments', () => {
    const segments = findReshapeableSegments(lShape, 'anchored', 'anchored');
    expect(segments[0].anchorPortAtSource).toBe(true);
    expect(segments[0].anchorPortAtTarget).toBe(false);
    expect(segments[1].anchorPortAtTarget).toBe(true);
  });

  it('does not anchor a dangling end', () => {
    const segments = findReshapeableSegments(lShape, 'dangling', 'anchored');
    expect(segments[0].anchorPortAtSource).toBe(false);
  });

  it('skips diagonal and zero-length segments', () => {
    const diagonal: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ];
    const segments = findReshapeableSegments(diagonal, 'anchored', 'anchored');
    expect(segments.map((s) => s.segmentIndex)).toEqual([2]);
  });

  it('returns nothing for a path with fewer than two points', () => {
    expect(findReshapeableSegments([{ x: 0, y: 0 }], 'anchored', 'anchored')).toEqual([]);
    expect(findReshapeableSegments(undefined, 'anchored', 'anchored')).toEqual([]);
  });
});

const grid = { x: 20, y: 20 };

describe('reshapeSegment', () => {
  it('slides a horizontal segment on Y and snaps to grid', () => {
    const result = reshapeSegment(lShape, 0, 'horizontal', 0, 17, grid);
    expect(result[0].y).toBe(20);
    expect(result[1].y).toBe(20);
    expect(result[0].x).toBe(0);
  });

  it('slides a vertical segment on X and snaps to grid', () => {
    const result = reshapeSegment(lShape, 1, 'vertical', 26, 0, grid);
    expect(result[1].x).toBe(120);
    expect(result[2].x).toBe(120);
  });

  it('moves freely without snapping when grid is null', () => {
    const result = reshapeSegment(lShape, 0, 'horizontal', 0, 17, null);
    expect(result[0].y).toBe(17);
    expect(result[1].y).toBe(17);
  });

  it('does not mutate the input', () => {
    const copy = lShape.map((p) => ({ ...p }));
    reshapeSegment(lShape, 0, 'horizontal', 0, 40, grid);
    expect(lShape).toEqual(copy);
  });
});

describe('reshapeAnchoredSegment', () => {
  it('inserts an L-bend at the source so the anchored port stays put', () => {
    const result = reshapeAnchoredSegment(lShape, 0, 'horizontal', 0, 40, grid, true, false);
    // Source point is unchanged; an elbow now carries the dragged Y.
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[1]).toEqual({ x: 0, y: 40 });
    expect(result[2]).toEqual({ x: 100, y: 40 });
  });

  it('inserts an L-bend at the target end segment', () => {
    const result = reshapeAnchoredSegment(lShape, 1, 'vertical', 40, 0, grid, false, true);
    const last = result.length - 1;
    // Target point unchanged; elbow before it carries the dragged X.
    expect(result[last]).toEqual({ x: 100, y: 100 });
    expect(result[last - 1]).toEqual({ x: 140, y: 100 });
  });

  it('does not insert a bend when the segment is not an anchored end', () => {
    const mid: Point[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ];
    const result = reshapeAnchoredSegment(mid, 1, 'vertical', 20, 0, grid, true, true);
    expect(result.length).toBe(mid.length);
  });
});
