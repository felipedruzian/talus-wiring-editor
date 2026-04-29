import { describe, expect, it } from 'vitest';
import { insertCollocatedBends } from './insert-collocated-bends';

describe('insertCollocatedBends', () => {
  const zShape = [
    { x: 0, y: 0 },
    { x: 80, y: 0 },
    { x: 80, y: 200 },
    { x: 220, y: 200 },
  ];

  it('inserts two bends at the segment midpoint and reports the dragged index', () => {
    const result = insertCollocatedBends(zShape, 1);
    expect(result?.points).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 100 },
      { x: 80, y: 100 },
      { x: 80, y: 200 },
      { x: 220, y: 200 },
    ]);
    expect(result?.newBendIndex).toBe(3);
  });

  it('returns null when the segment index is out of range', () => {
    expect(insertCollocatedBends(zShape, -1)).toBeNull();
    expect(insertCollocatedBends(zShape, zShape.length - 1)).toBeNull();
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.stringify(zShape);
    insertCollocatedBends(zShape, 1);
    expect(JSON.stringify(zShape)).toBe(snapshot);
  });
});
