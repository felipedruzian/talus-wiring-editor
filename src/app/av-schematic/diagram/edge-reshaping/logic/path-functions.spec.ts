import { describe, expect, it } from 'vitest';
import {
  deletePoint,
  insertPoint,
  moveBend,
  reflowEndpoint,
  removeSegment,
  segmentMidpoint,
  segmentToRemoveForBend,
} from './index';

describe('insertPoint', () => {
  it('inserts at the given index without mutating the input', () => {
    const original = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const result = insertPoint(original, 1, { x: 50, y: 0 });

    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(original).toHaveLength(2);
  });
});

describe('deletePoint', () => {
  it('removes the point at the given index without mutating the input', () => {
    const original = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const result = deletePoint(original, 1);

    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(original).toHaveLength(3);
  });
});

describe('segmentMidpoint', () => {
  it('returns the average of two points', () => {
    expect(segmentMidpoint({ x: 0, y: 0 }, { x: 100, y: 200 })).toEqual({ x: 50, y: 100 });
  });
});

describe('removeSegment', () => {
  const fourBendPath = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 100 },
    { x: 220, y: 100 },
    { x: 220, y: 200 },
    { x: 300, y: 200 },
  ];

  it('removes the requested segment and snaps the bridging segment to V', () => {
    const result = removeSegment(fourBendPath, 2, 'horizontal');
    expect(result.routingMode).toBe('manual');
    expect(result.points).toEqual([
      { x: 0, y: 0 },
      { x: 220, y: 0 },
      { x: 220, y: 200 },
      { x: 300, y: 200 },
    ]);
  });

  it('refuses removal when the path has only 2 interior bends', () => {
    const zShape = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 200 },
      { x: 220, y: 200 },
    ];
    expect(removeSegment(zShape, 1, 'horizontal')).toEqual({
      points: zShape,
      routingMode: 'manual',
    });
  });

  it('refuses removal of a port-adjacent segment (segment 0)', () => {
    expect(removeSegment(fourBendPath, 0, 'horizontal')).toEqual({
      points: fourBendPath,
      routingMode: 'manual',
    });
  });

  it('refuses removal of the last segment (touches target port)', () => {
    expect(removeSegment(fourBendPath, fourBendPath.length - 2, 'horizontal')).toEqual({
      points: fourBendPath,
      routingMode: 'manual',
    });
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.stringify(fourBendPath);
    removeSegment(fourBendPath, 2, 'horizontal');
    expect(JSON.stringify(fourBendPath)).toBe(snapshot);
  });
});

describe('segmentToRemoveForBend', () => {
  const fourBendPath = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 100 },
    { x: 220, y: 100 },
    { x: 220, y: 200 },
    { x: 300, y: 200 },
  ];

  it('prefers the segment after the bend when both sides are removable', () => {
    expect(segmentToRemoveForBend(fourBendPath, 2)).toBe(2);
    expect(segmentToRemoveForBend(fourBendPath, 3)).toBe(3);
  });

  it('falls back to the segment before for the last interior bend', () => {
    expect(segmentToRemoveForBend(fourBendPath, 4)).toBe(3);
  });

  it('returns -1 when the bend index is outside the interior range', () => {
    expect(segmentToRemoveForBend(fourBendPath, 0)).toBe(-1);
    expect(segmentToRemoveForBend(fourBendPath, fourBendPath.length - 1)).toBe(-1);
  });
});

describe('moveBend', () => {
  const zShape = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 200 },
    { x: 220, y: 200 },
  ];

  it('locks Y at a corner whose H neighbour is the source port', () => {
    const moved = moveBend(zShape, 1, { x: 120, y: 50 }, 'horizontal');
    expect(moved[1]).toEqual({ x: 120, y: 0 });
  });

  it('propagates X to the V neighbour to keep the V segment vertical', () => {
    const moved = moveBend(zShape, 1, { x: 120, y: 50 }, 'horizontal');
    expect(moved[2]).toEqual({ x: 120, y: 200 });
  });

  it('does not move the source endpoint when propagating', () => {
    const moved = moveBend(zShape, 1, { x: 120, y: 50 }, 'horizontal');
    expect(moved[0]).toEqual({ x: 0, y: 0 });
  });

  it('locks Y at the target-side corner adjacent to the target port', () => {
    const moved = moveBend(zShape, 2, { x: 150, y: 260 }, 'horizontal');
    expect(moved[2]).toEqual({ x: 150, y: 200 });
    expect(moved[3]).toEqual({ x: 220, y: 200 });
  });

  it('allows free movement on a corner whose neighbours are both interior', () => {
    const longer = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 300, y: 200 },
    ];
    const moved = moveBend(longer, 2, { x: 90, y: 130 }, 'horizontal');
    expect(moved[2]).toEqual({ x: 90, y: 130 });
    expect(moved[1]).toEqual({ x: 90, y: 0 });
    expect(moved[3]).toEqual({ x: 200, y: 130 });
  });

  it('returns the original points unchanged for endpoint indices', () => {
    expect(moveBend(zShape, 0, { x: 99, y: 99 }, 'horizontal')).toEqual(zShape);
    expect(moveBend(zShape, zShape.length - 1, { x: 99, y: 99 }, 'horizontal')).toEqual(zShape);
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.stringify(zShape);
    moveBend(zShape, 1, { x: 50, y: 50 }, 'horizontal');
    expect(JSON.stringify(zShape)).toBe(snapshot);
  });
});

describe('reflowEndpoint', () => {
  const interiorPath = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 200 },
    { x: 220, y: 200 },
    { x: 300, y: 200 },
  ];

  it('moves the source endpoint and aligns the first interior bend in y', () => {
    const result = reflowEndpoint(interiorPath, 'source', { x: -40, y: 60 }, 'horizontal');

    expect(result).toEqual([
      { x: -40, y: 60 },
      { x: 80, y: 60 },
      { x: 80, y: 200 },
      { x: 220, y: 200 },
      { x: 300, y: 200 },
    ]);
  });

  it('moves the target endpoint and aligns the last interior bend in y', () => {
    const result = reflowEndpoint(interiorPath, 'target', { x: 360, y: 140 }, 'horizontal');

    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 200 },
      { x: 220, y: 140 },
      { x: 360, y: 140 },
    ]);
  });

  it('preserves all other interior bend coordinates', () => {
    const result = reflowEndpoint(interiorPath, 'source', { x: 99, y: 11 }, 'horizontal');

    expect(result?.[2]).toEqual({ x: 80, y: 200 });
    expect(result?.[3]).toEqual({ x: 220, y: 200 });
  });

  it('returns null when the edge has fewer than 3 points', () => {
    const tooShort = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];

    expect(reflowEndpoint(tooShort, 'source', { x: 5, y: 5 }, 'horizontal')).toBeNull();
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.stringify(interiorPath);
    reflowEndpoint(interiorPath, 'source', { x: 9, y: 9 }, 'horizontal');
    expect(JSON.stringify(interiorPath)).toBe(snapshot);
  });
});
