import { describe, expect, it } from 'vitest';
import { moveBend } from './move-bend';
import { reflowEndpoint } from './reflow-endpoint';

describe('moveBend — top ↔ bottom (V, V)', () => {
  const zShapeV = [
    { x: 0, y: 0 },
    { x: 0, y: 80 },
    { x: 200, y: 80 },
    { x: 200, y: 220 },
  ];

  it('locks X at the corner adjacent to a vertical source stub', () => {
    const moved = moveBend(zShapeV, 1, { x: 50, y: 120 }, 'vertical');
    expect(moved[1]).toEqual({ x: 0, y: 120 });
  });

  it('propagates Y to the H neighbour to keep the H segment horizontal', () => {
    const moved = moveBend(zShapeV, 1, { x: 50, y: 120 }, 'vertical');
    expect(moved[2]).toEqual({ x: 200, y: 120 });
  });

  it('locks X at the corner adjacent to a vertical target stub', () => {
    const moved = moveBend(zShapeV, 2, { x: 260, y: 150 }, 'vertical');
    expect(moved[2]).toEqual({ x: 200, y: 150 });
    expect(moved[3]).toEqual({ x: 200, y: 220 });
  });
});

describe('moveBend — right ↔ top (H, V) — L-shape', () => {
  const lShape = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 200 },
  ];

  it('locks both axes when the only interior bend is between a H source and V target stub', () => {
    const moved = moveBend(lShape, 1, { x: 50, y: 50 }, 'horizontal');
    expect(moved[1]).toEqual({ x: 200, y: 0 });
  });
});

describe('reflowEndpoint — vertical stub orientations', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 0, y: 80 },
    { x: 200, y: 80 },
    { x: 200, y: 220 },
  ];

  it('source side with vertical stub: neighbour shares X with the new port position', () => {
    const result = reflowEndpoint(path, 'source', { x: 30, y: -40 }, 'vertical');
    expect(result).toEqual([
      { x: 30, y: -40 },
      { x: 30, y: 80 },
      { x: 200, y: 80 },
      { x: 200, y: 220 },
    ]);
  });

  it('target side with vertical stub: neighbour shares X with the new port position', () => {
    const result = reflowEndpoint(path, 'target', { x: 260, y: 280 }, 'vertical');
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 260, y: 80 },
      { x: 260, y: 280 },
    ]);
  });
});
