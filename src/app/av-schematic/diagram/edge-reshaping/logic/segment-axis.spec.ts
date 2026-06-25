import { describe, expect, it } from 'vitest';
import { type Point } from 'ng-diagram';
import { segmentAxis, endpointNeighborAxis, pathSourceOrientation } from './segment-axis';

describe('segmentAxis', () => {
  it('classifies a horizontal segment', () => {
    expect(segmentAxis({ x: 0, y: 0 }, { x: 50, y: 0 })).toBe('horizontal');
  });

  it('classifies a vertical segment', () => {
    expect(segmentAxis({ x: 0, y: 0 }, { x: 0, y: 50 })).toBe('vertical');
  });

  it('returns null for an oblique segment', () => {
    expect(segmentAxis({ x: 0, y: 0 }, { x: 50, y: 50 })).toBeNull();
  });

  it('returns null for a zero-length segment', () => {
    expect(segmentAxis({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
  });
});

describe('endpointNeighborAxis', () => {
  const route: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it('reads the source end segment', () => {
    expect(endpointNeighborAxis(route, 'source')).toBe('horizontal');
  });

  it('reads the target end segment', () => {
    expect(endpointNeighborAxis(route, 'target')).toBe('vertical');
  });
});

describe('pathSourceOrientation', () => {
  it('uses the first segment axis when orthogonal', () => {
    const route: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 50 },
    ];
    expect(pathSourceOrientation(route, 'horizontal')).toBe('vertical');
  });

  it('falls back when the first segment is degenerate', () => {
    const route: Point[] = [{ x: 0, y: 0 }];
    expect(pathSourceOrientation(route, 'horizontal')).toBe('horizontal');
  });
});
