import { describe, expect, it } from 'vitest';
import { removeStraightSegments } from './remove-straight-segments';

describe('removeStraightSegments', () => {
  it('returns the input unchanged when no triple is collinear', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 200 },
      { x: 220, y: 200 },
    ];
    expect(removeStraightSegments(path, 5)).toEqual(path);
  });

  it('drops a middle bend exactly on the line between its neighbours', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ];
    expect(removeStraightSegments(path, 5)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ]);
  });

  it('drops a near-collinear bend within the tolerance window', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 3 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ];
    expect(removeStraightSegments(path, 5)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ]);
  });

  it('keeps a bend whose offset exceeds the tolerance', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ];
    expect(removeStraightSegments(path, 5)).toEqual(path);
  });

  it('preserves both endpoints', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const result = removeStraightSegments(path, 5);
    expect(result[0]).toEqual({ x: 0, y: 0 });
    expect(result[result.length - 1]).toEqual({ x: 100, y: 0 });
  });

  it('does not mutate the input', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const snapshot = JSON.stringify(path);
    removeStraightSegments(path, 5);
    expect(JSON.stringify(path)).toBe(snapshot);
  });
});
