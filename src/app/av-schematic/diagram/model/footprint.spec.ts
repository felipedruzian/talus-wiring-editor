import { describe, expect, it } from 'vitest';
import {
  AXIAL_RESISTOR_MAX_SPAN,
  AXIAL_RESISTOR_MIN_SPAN,
  cloneFootprint,
  RESISTOR_1K_FOOTPRINT,
  resizeAxialFootprintSpan,
} from './footprint';

function resized(span: number) {
  const result = resizeAxialFootprintSpan(RESISTOR_1K_FOOTPRINT, span);
  if (!result.ok) throw new Error(result.message);
  return result.footprint;
}

function bodyRect(footprint: typeof RESISTOR_1K_FOOTPRINT) {
  const body = footprint.shapes.find(
    (shape) => shape.kind === 'rect' && shape.width === 2.56 && shape.height === 0.98,
  );
  if (body?.kind !== 'rect') throw new Error('Missing axial resistor body');
  return body;
}

describe('adjustable axial resistor footprint', () => {
  it.each([AXIAL_RESISTOR_MIN_SPAN, AXIAL_RESISTOR_MAX_SPAN])(
    'accepts the endpoint span %s and moves only the terminal holes',
    (span) => {
      const footprint = resized(span);
      expect(footprint).toMatchObject({ axialSpan: span, rows: 1, cols: span + 1 });
      expect(footprint.pins.map((pin) => pin.cell)).toEqual([
        { row: 0, col: 0 },
        { row: 0, col: span },
      ]);
      expect(
        footprint.shapes.find((shape) => shape.kind === 'line' && shape.x1 === 0),
      ).toMatchObject({ x2: span });
    },
  );

  it.each([3, 11, 4.5, Number.NaN])(
    'rejects invalid span %s without mutating the footprint',
    (span) => {
      const before = cloneFootprint(RESISTOR_1K_FOOTPRINT);
      expect(resizeAxialFootprintSpan(before, span)).toMatchObject({ ok: false });
      expect(before).toEqual(RESISTOR_1K_FOOTPRINT);
    },
  );

  it('keeps body and band dimensions rigid and centered from minimum to maximum', () => {
    const minimum = resized(AXIAL_RESISTOR_MIN_SPAN);
    const maximum = resized(AXIAL_RESISTOR_MAX_SPAN);
    const minimumBody = bodyRect(minimum);
    const maximumBody = bodyRect(maximum);
    const bandGeometry = (footprint: typeof minimum) =>
      footprint.shapes.flatMap((shape) =>
        shape.kind === 'rect' && shape.width === 0.18
          ? [{ x: shape.x, width: shape.width, height: shape.height }]
          : [],
      );
    const minimumBands = bandGeometry(minimum);
    const maximumBands = bandGeometry(maximum);

    expect({ width: minimumBody.width, height: minimumBody.height }).toEqual({
      width: maximumBody.width,
      height: maximumBody.height,
    });
    expect(minimumBody.x + minimumBody.width / 2).toBe(AXIAL_RESISTOR_MIN_SPAN / 2);
    expect(maximumBody.x + maximumBody.width / 2).toBe(AXIAL_RESISTOR_MAX_SPAN / 2);
    expect(minimumBands).toHaveLength(4);
    expect(minimumBands.map(({ width, height }) => ({ width, height }))).toEqual(
      maximumBands.map(({ width, height }) => ({ width, height })),
    );
    maximumBands.forEach((band, index) => {
      expect(band.x - minimumBands[index].x).toBeCloseTo(
        (AXIAL_RESISTOR_MAX_SPAN - AXIAL_RESISTOR_MIN_SPAN) / 2,
      );
    });
  });
});
