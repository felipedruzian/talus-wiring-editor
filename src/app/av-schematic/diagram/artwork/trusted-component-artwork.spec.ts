import { describe, expect, it } from 'vitest';
import {
  ARDUINO_NANO_ARTWORK,
  BUZZER_ACTIVE_12MM_ARTWORK,
  CAPACITOR_CERAMIC_100NF_ARTWORK,
  CAPACITOR_ELECTROLYTIC_470UF_25V_ARTWORK,
  GY_521_MPU6050_ARTWORK,
  RESISTOR_AXIAL_1K_ARTWORK,
  TB6612FNG_ARTWORK,
  TRUSTED_COMPONENT_ARTWORK,
  trustedArtworkForFootprint,
  trustedArtworkForFootprintDefinition,
} from './trusted-component-artwork';
import {
  ARDUINO_NANO_FOOTPRINT,
  CAP_100N_FOOTPRINT,
  CAP_470U_25V_FOOTPRINT,
  cloneFootprint,
  RESISTOR_1K_FOOTPRINT,
  resizeAxialFootprintSpan,
} from '../model/footprint';

describe('trusted component artwork contract', () => {
  it('keeps bundled SVGs versioned and outside the raster upload contract', () => {
    expect(TRUSTED_COMPONENT_ARTWORK).toHaveLength(9);
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

  it('keeps fixed passive pin spans and polarity explicit', () => {
    expect(BUZZER_ACTIVE_12MM_ARTWORK).toMatchObject({
      terminalModel: 'integral-fixed',
      grid: { rows: 1, cols: 4 },
      pins: [
        { id: 'plus', row: 0, col: 0, primary: true },
        { id: 'minus', row: 0, col: 3 },
      ],
    });
    expect(CAPACITOR_ELECTROLYTIC_470UF_25V_ARTWORK.pins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'plus', col: 0, primary: true }),
        expect.objectContaining({ id: 'minus', col: 2 }),
      ]),
    );
    expect(CAPACITOR_CERAMIC_100NF_ARTWORK.pins.some((pin) => pin.primary)).toBe(false);
    expect(
      CAP_470U_25V_FOOTPRINT.shapes.flatMap((shape) =>
        shape.kind === 'text' && (shape.text === '+' || shape.text === '-') ? [shape.text] : [],
      ),
    ).toEqual(['+', '-']);
    expect(trustedArtworkForFootprintDefinition(CAP_470U_25V_FOOTPRINT)).toBeDefined();
    expect(trustedArtworkForFootprintDefinition(CAP_100N_FOOTPRINT)).toBeDefined();
  });

  it('centers a rigid resistor body while resolving every valid axial span', () => {
    const minimum = trustedArtworkForFootprintDefinition(RESISTOR_1K_FOOTPRINT);
    const maximumResult = resizeAxialFootprintSpan(RESISTOR_1K_FOOTPRINT, 10);
    if (!minimum || !maximumResult.ok) throw new Error('Missing resistor artwork');
    const maximum = trustedArtworkForFootprintDefinition(maximumResult.footprint);

    expect(minimum).toMatchObject({
      terminalModel: 'adjustable-axial',
      bounds: { width: 2.76, height: 1.18 },
      grid: { rows: 1, cols: 5 },
    });
    expect(maximum).toMatchObject({
      bounds: { width: 2.76, height: 1.18 },
      grid: { rows: 1, cols: 11 },
    });
    expect(minimum.bounds.x).toBeCloseTo(0.62);
    expect(maximum?.bounds.x).toBeCloseTo(3.62);
    expect(maximum?.pins.find((pin) => pin.id === 'b')?.col).toBe(10);
    expect(RESISTOR_AXIAL_1K_ARTWORK.adjustableAxial).toMatchObject({
      minSpan: 4,
      maxSpan: 10,
    });
  });

  it('does not resolve axial artwork for invalid or incoherent spans', () => {
    const invalid = cloneFootprint(RESISTOR_1K_FOOTPRINT);
    invalid.axialSpan = 3;
    invalid.cols = 4;
    invalid.pins[1].cell.col = 3;
    expect(trustedArtworkForFootprintDefinition(invalid)).toBeUndefined();

    const fractional = cloneFootprint(RESISTOR_1K_FOOTPRINT);
    fractional.axialSpan = 4.5;
    expect(trustedArtworkForFootprintDefinition(fractional)).toBeUndefined();
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

    const changedBounds = cloneFootprint(ARDUINO_NANO_FOOTPRINT);
    if (!changedBounds.physicalBounds) throw new Error('Missing Nano physical bounds');
    changedBounds.physicalBounds.width += 1;
    expect(trustedArtworkForFootprintDefinition(changedBounds)).toBeUndefined();
  });

  it('requires the persisted physical bounds to match the reviewed figure', () => {
    const withoutBounds = cloneFootprint(ARDUINO_NANO_FOOTPRINT);
    delete withoutBounds.physicalBounds;
    const changedBounds = cloneFootprint(ARDUINO_NANO_FOOTPRINT);
    if (!changedBounds.physicalBounds) throw new Error('Missing Nano physical bounds');
    changedBounds.physicalBounds.width += 0.1;

    expect(trustedArtworkForFootprintDefinition(withoutBounds)).toBeUndefined();
    expect(trustedArtworkForFootprintDefinition(changedBounds)).toBeUndefined();
  });
});
