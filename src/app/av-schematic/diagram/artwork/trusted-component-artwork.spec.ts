import { describe, expect, it } from 'vitest';
import {
  ARDUINO_NANO_ARTWORK,
  GY_521_MPU6050_ARTWORK,
  TB6612FNG_ARTWORK,
  TRUSTED_COMPONENT_ARTWORK,
  trustedArtworkForFootprint,
  trustedArtworkForFootprintDefinition,
} from './trusted-component-artwork';
import { ARDUINO_NANO_FOOTPRINT, cloneFootprint } from '../model/footprint';

describe('trusted component artwork contract', () => {
  it('keeps bundled SVGs versioned and outside the raster upload contract', () => {
    expect(TRUSTED_COMPONENT_ARTWORK).toHaveLength(3);
    for (const artwork of TRUSTED_COMPONENT_ARTWORK) {
      expect(artwork).toMatchObject({
        kind: 'trusted-component-svg',
        revision: '2026-09-03',
        license: 'MIT',
      });
      expect(artwork.href).toMatch(/^\/assets\/components\/[a-z0-9-]+\.svg$/);
      expect(artwork).not.toHaveProperty('assetHash');
      expect(artwork).not.toHaveProperty('dataUrl');
      expect(trustedArtworkForFootprint(artwork.footprintId)).toBe(artwork);
    }
  });

  it('defines the Nano body and all 30 physical holes in pitch units', () => {
    expect(ARDUINO_NANO_ARTWORK.bounds).toMatchObject({ width: 17, height: 7 });
    expect(ARDUINO_NANO_ARTWORK.grid).toEqual({ rows: 7, cols: 15 });
    expect(ARDUINO_NANO_ARTWORK.pins).toHaveLength(30);
    expect(ARDUINO_NANO_ARTWORK.pins.filter((pin) => pin.primary).map((pin) => pin.id)).toEqual([
      'd1',
    ]);
    expect(new Set(ARDUINO_NANO_ARTWORK.pins.map((pin) => `${pin.row}:${pin.col}`))).toHaveLength(
      30,
    );
  });

  it('defines the provisional GY-521 and TB6612FNG physical layouts', () => {
    expect(GY_521_MPU6050_ARTWORK).toMatchObject({
      provisional: true,
      bounds: { width: 8, height: 6.1 },
      grid: { rows: 6, cols: 8 },
    });
    expect(GY_521_MPU6050_ARTWORK.pins.map((pin) => pin.row)).toEqual(Array(8).fill(0));

    expect(TB6612FNG_ARTWORK).toMatchObject({
      provisional: true,
      bounds: { width: 8, height: 7 },
      grid: { rows: 7, cols: 8 },
    });
    expect(TB6612FNG_ARTWORK.pins.filter((pin) => pin.row === 0)).toHaveLength(8);
    expect(TB6612FNG_ARTWORK.pins.filter((pin) => pin.row === 6)).toHaveLength(8);
  });

  it('does not apply a reviewed figure to locally changed physical geometry', () => {
    const changed = cloneFootprint(ARDUINO_NANO_FOOTPRINT);
    const first = changed.pins[0];
    if (!first) throw new Error('Missing Nano pin');
    first.cell = { row: 1, col: 0 };

    expect(trustedArtworkForFootprintDefinition(ARDUINO_NANO_FOOTPRINT)).toBe(ARDUINO_NANO_ARTWORK);
    expect(trustedArtworkForFootprintDefinition(changed)).toBeUndefined();
  });
});
