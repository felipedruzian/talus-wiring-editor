import { type Point } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { isOrthogonalPolyline } from './bend-editing';
import { rebuildEndpointPath } from './relink-path';

const route: Point[] = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 80, y: 40 },
];

describe('rebuildEndpointPath', () => {
  it('relinks the source while preserving valid interior runs', () => {
    const result = rebuildEndpointPath(route, 'source', { x: 0, y: 20 }, false);

    expect(result).toEqual([
      { x: 0, y: 20 },
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
    ]);
    expect(isOrthogonalPolyline(result)).toBe(true);
    expect(route[0]).toEqual({ x: 0, y: 0 });
  });

  it('relinks the target and folds only a redundant drop-time bend', () => {
    const result = rebuildEndpointPath(route, 'target', { x: 100, y: 40 }, true);

    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 100, y: 40 },
    ]);
    expect(isOrthogonalPolyline(result)).toBe(true);
  });

  it('keeps a valid internal reversal when the endpoint is relinked', () => {
    const reversingRoute: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
    ];

    expect(rebuildEndpointPath(reversingRoute, 'target', { x: 120, y: 40 }, true)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 120, y: 40 },
    ]);
  });
});
