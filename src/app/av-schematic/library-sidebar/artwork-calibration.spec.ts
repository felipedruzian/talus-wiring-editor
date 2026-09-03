import { describe, expect, it } from 'vitest';
import { calibrateArtwork, pinDistance } from './artwork-calibration';

const artwork = {
  assetHash: 'a'.repeat(64),
  x: -0.5,
  y: -0.5,
  width: 10,
  height: 5,
};

describe('artwork calibration', () => {
  it('uses two image references to set uniform scale and align the first pin', () => {
    const result = calibrateArtwork({
      artwork,
      imageWidth: 1000,
      imageHeight: 500,
      firstPoint: { x: 0.1, y: 0.2 },
      secondPoint: { x: 0.9, y: 0.2 },
      firstPin: { row: 2, col: 3 },
      secondPin: { row: 2, col: 11 },
      physicalDistance: 8,
    });

    expect(result).toMatchObject({ x: 2, y: 1, width: 10, height: 5, preserveAspectRatio: true });
    expect(result.x + 0.1 * result.width).toBeCloseTo(3);
    expect(result.y + 0.2 * result.height).toBeCloseTo(2);
  });

  it('infers Euclidean pitch distance from two terminal cells', () => {
    expect(pinDistance({ row: 1, col: 2 }, { row: 4, col: 6 })).toBe(5);
  });

  it('rejects the same pin position and coincident image points', () => {
    const base = {
      artwork,
      imageWidth: 100,
      imageHeight: 50,
      firstPoint: { x: 0.1, y: 0.2 },
      secondPoint: { x: 0.8, y: 0.2 },
      firstPin: { row: 0, col: 0 },
      secondPin: { row: 0, col: 1 },
      physicalDistance: 1,
    };
    expect(() => calibrateArtwork({ ...base, secondPin: { row: 0, col: 0 } })).toThrow(
      /posições físicas diferentes/,
    );
    expect(() => calibrateArtwork({ ...base, secondPoint: base.firstPoint })).toThrow(
      /dois pontos diferentes/,
    );
  });
});
