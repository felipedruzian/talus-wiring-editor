import { describe, expect, it } from 'vitest';
import { type Point } from 'ng-diagram';
import { orthogonalizePolyline, realignEndpointNeighbor } from './orthogonalize';

describe('orthogonalizePolyline', () => {
  it('replaces an oblique segment with a vertical-first L-bend', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ];
    // Vertical-first: the elbow shares the source X, so the segment arriving at
    // the target is horizontal — the correct approach for left/right ports.
    expect(orthogonalizePolyline(points)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ]);
  });

  it('leaves an already-orthogonal path untouched', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(orthogonalizePolyline(points)).toEqual(points);
  });
});

describe('realignEndpointNeighbor', () => {
  it('snaps the source neighbour onto a vertical end-segment', () => {
    const points = [
      { x: 5, y: 0 },
      { x: 3, y: 50 },
      { x: 100, y: 50 },
    ];
    realignEndpointNeighbor(points, 'source', 'vertical');
    expect(points[1].x).toBe(5);
  });

  it('snaps the target neighbour onto a horizontal end-segment', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 3 },
      { x: 200, y: 5 },
    ];
    realignEndpointNeighbor(points, 'target', 'horizontal');
    expect(points[1].y).toBe(5);
  });

  it('is a no-op for an oblique end-segment', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ];
    const copy = points.map((p) => ({ ...p }));
    realignEndpointNeighbor(points, 'source', null);
    expect(points).toEqual(copy);
  });
});
