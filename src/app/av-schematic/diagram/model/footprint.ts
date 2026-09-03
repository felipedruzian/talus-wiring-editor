/**
 * Physical footprints: what a component looks like, and where its pins sit
 * relative to a board's hole grid.
 *
 * A footprint is expressed entirely in **hole units** - one unit is one board
 * pitch - never in pixels. That is what lets the same footprint be seated on
 * any board this app can describe: placa A at 20 px pitch and a zoomed-out
 * 6 x 28 origin board at some other pitch use the identical definition, and
 * the pixel geometry is derived at render time (see `footprint-geometry.ts`).
 *
 * Illustration shapes use the same hole-unit coordinate space, with the origin
 * at cell (0, 0) - so a shape at `x: 1.5` sits halfway between the second and
 * third pin column, whatever the board's pitch turns out to be.
 */

import {
  ARDUINO_NANO_ARTWORK,
  GY_521_MPU6050_ARTWORK,
  TB6612FNG_ARTWORK,
  type TrustedComponentArtwork,
} from '../artwork/trusted-component-artwork';

export interface FootprintCell {
  row: number;
  col: number;
}

/**
 * Bounded palette of paint roles. Footprints name a role, `footprint-node`'s
 * stylesheet resolves it to a CSS custom property - so themes (and the light /
 * dark toggle) stay in CSS and no footprint definition hardcodes a hex value.
 */
export type FootprintPaint = 'none' | 'body' | 'body-alt' | 'accent' | 'lead' | 'silk' | 'polarity';

export type FootprintShape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      /** Corner radius, in hole units. */
      rx?: number;
      fill?: FootprintPaint;
      stroke?: FootprintPaint;
    }
  | {
      kind: 'circle';
      cx: number;
      cy: number;
      r: number;
      fill?: FootprintPaint;
      stroke?: FootprintPaint;
    }
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke?: FootprintPaint;
      width?: number;
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      /** Font size in hole units. Defaults to 0.42. */
      size?: number;
      anchor?: 'start' | 'middle' | 'end';
      fill?: FootprintPaint;
    };

export interface FootprintPin {
  /**
   * Matches a `DevicePort.id` when the component exposes this pin
   * electrically. Pins with no matching port still occupy their hole - an
   * unused header pin is still soldered into the board.
   */
  id: string;
  label: string;
  cell: FootprintCell;
  /** Marks pin 1 / polarity so the illustration can key off it. */
  primary?: boolean;
}

/**
 * Raster artwork placed in the same pitch-unit coordinate system as pins and
 * vector shapes. The binary lives in the shared artwork asset store; keeping
 * only its SHA-256 hash here deduplicates identical uploads across components.
 */
export interface FootprintArtwork {
  assetHash: string;
  x: number;
  y: number;
  width: number;
  height: number;
  preserveAspectRatio?: boolean;
}

export interface Footprint {
  id: string;
  label: string;
  /** Bounding box of the footprint's cells, in hole units, unrotated. */
  rows: number;
  cols: number;
  pins: FootprintPin[];
  shapes: FootprintShape[];
  /** Optional user-supplied raster image, referenced by content hash. */
  artwork?: FootprintArtwork;
  /**
   * Cells the body physically covers beyond its pins. Absent means the body
   * covers its whole `rows x cols` bounding box, which is the usual case for a
   * DIP/module and the conservative answer for occupancy.
   */
  bodyCells?: FootprintCell[];
}

/** Two-pin axial part (resistor, diode, wire link) lying flat across `span + 1` holes. */
function axialFootprint(
  id: string,
  label: string,
  span: number,
  bandPaints: readonly FootprintPaint[],
  pinIds: readonly [string, string] = ['a', 'b'],
): Footprint {
  const bodyStart = 0.55;
  const bodyEnd = span - 0.55;
  const bodyWidth = bodyEnd - bodyStart;
  const bands: FootprintShape[] = bandPaints.map((paint, index) => ({
    kind: 'rect',
    x: bodyStart + bodyWidth * (0.22 + index * 0.18),
    y: -0.26,
    width: bodyWidth * 0.09,
    height: 0.52,
    fill: paint,
  }));
  return {
    id,
    label,
    rows: 1,
    cols: span + 1,
    pins: [
      { id: pinIds[0], label: '1', cell: { row: 0, col: 0 }, primary: true },
      { id: pinIds[1], label: '2', cell: { row: 0, col: span } },
    ],
    shapes: [
      { kind: 'line', x1: 0, y1: 0, x2: span, y2: 0, stroke: 'lead', width: 0.09 },
      {
        kind: 'rect',
        x: bodyStart,
        y: -0.3,
        width: bodyWidth,
        height: 0.6,
        rx: 0.28,
        fill: 'body',
        stroke: 'silk',
      },
      ...bands,
      { kind: 'text', x: span / 2, y: -0.55, text: label, anchor: 'middle', size: 0.4 },
    ],
  };
}

/** Radial capacitor standing between two rows `span` holes apart in one column. */
function radialCapFootprint(
  id: string,
  label: string,
  span: number,
  polarized: boolean,
): Footprint {
  const bodyTop = 0.6;
  const bodyBottom = span - 0.6;
  return {
    id,
    label,
    rows: span + 1,
    cols: 1,
    pins: [
      { id: 'plus', label: polarized ? '+' : '1', cell: { row: 0, col: 0 }, primary: true },
      { id: 'minus', label: polarized ? '-' : '2', cell: { row: span, col: 0 } },
    ],
    shapes: [
      { kind: 'line', x1: 0, y1: 0, x2: 0, y2: span, stroke: 'lead', width: 0.09 },
      {
        kind: 'rect',
        x: -0.62,
        y: bodyTop,
        width: 1.24,
        height: bodyBottom - bodyTop,
        rx: polarized ? 0.3 : 0.6,
        fill: 'body',
        stroke: 'silk',
      },
      ...(polarized
        ? ([
            {
              kind: 'rect',
              x: 0.18,
              y: bodyTop,
              width: 0.44,
              height: bodyBottom - bodyTop,
              fill: 'polarity',
            },
            { kind: 'text', x: -0.2, y: bodyTop + 0.5, text: '+', anchor: 'middle', size: 0.5 },
          ] satisfies FootprintShape[])
        : []),
      {
        kind: 'text',
        x: 0,
        y: (bodyTop + bodyBottom) / 2 + 0.15,
        text: label,
        anchor: 'middle',
        size: 0.36,
      },
    ],
  };
}

/** Bundled module whose SVG, fallback vector and DXF share one pitch-unit contract. */
function trustedModuleFootprint(
  artwork: TrustedComponentArtwork,
  label: string,
  fallbackText: string,
): Footprint {
  const { bounds } = artwork;
  return {
    id: artwork.footprintId,
    label,
    rows: artwork.grid.rows,
    cols: artwork.grid.cols,
    pins: artwork.pins.map((pin) => ({
      id: pin.id,
      label: pin.label,
      cell: { row: pin.row, col: pin.col },
      primary: pin.primary,
    })),
    shapes: [
      {
        kind: 'rect',
        x: bounds.x + 0.05,
        y: bounds.y + 0.05,
        width: bounds.width - 0.1,
        height: bounds.height - 0.1,
        rx: 0.22,
        fill: 'body',
        stroke: 'silk',
      },
      {
        kind: 'text',
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        text: fallbackText,
        anchor: 'middle',
        size: 0.44,
        fill: 'silk',
      },
    ],
  };
}

/**
 * Arduino Nano v3: 30 pins on a 0.6" (6 hole) row span, 15 holes long.
 *
 * Deliberately kept faithful: on a 6-row board it does **not** fit, which is
 * exactly why the real Talus-Droid Nano sits beside placa A and taps its rails
 * through wires instead of being seated on it. The footprint reports that
 * honestly rather than being shrunk to make a demo fit.
 */
export const ARDUINO_NANO_FOOTPRINT: Footprint = trustedModuleFootprint(
  ARDUINO_NANO_ARTWORK,
  'Arduino Nano',
  'NANO',
);

/** GY-521 breakout: one 1 x 8 header; body dimensions remain provisional. */
export const GY_521_MPU6050_FOOTPRINT: Footprint = trustedModuleFootprint(
  GY_521_MPU6050_ARTWORK,
  'GY-521 / MPU6050',
  'GY-521',
);

/** TB6612FNG breakout: two 1 x 8 headers separated by six pitch units. */
export const TB6612FNG_FOOTPRINT: Footprint = trustedModuleFootprint(
  TB6612FNG_ARTWORK,
  'TB6612FNG',
  'TB6612',
);

export const RESISTOR_1K_FOOTPRINT = axialFootprint(
  'resistor-1k',
  '1k',
  2,
  ['accent', 'polarity', 'accent'],
  ['a', 'b'],
);

export const RESISTOR_1K8_FOOTPRINT = axialFootprint(
  'resistor-1k8',
  '1k8',
  2,
  ['accent', 'polarity', 'silk'],
  ['a', 'b'],
);

export const WIRE_LINK_FOOTPRINT: Footprint = {
  id: 'wire-link',
  label: 'jumper',
  rows: 1,
  cols: 3,
  pins: [
    { id: 'a', label: '1', cell: { row: 0, col: 0 }, primary: true },
    { id: 'b', label: '2', cell: { row: 0, col: 2 } },
  ],
  shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 2, y2: 0, stroke: 'lead', width: 0.14 }],
  bodyCells: [
    { row: 0, col: 0 },
    { row: 0, col: 2 },
  ],
};

export const CAP_470U_25V_FOOTPRINT = radialCapFootprint('cap-470u-25v', '470u', 5, true);
export const CAP_470U_16V_FOOTPRINT = radialCapFootprint('cap-470u-16v', '470u', 5, true);
export const CAP_100N_FOOTPRINT = radialCapFootprint('cap-100n', '100n', 5, false);

export const FOOTPRINTS: Readonly<Record<string, Footprint>> = Object.freeze(
  Object.fromEntries(
    [
      ARDUINO_NANO_FOOTPRINT,
      GY_521_MPU6050_FOOTPRINT,
      TB6612FNG_FOOTPRINT,
      RESISTOR_1K_FOOTPRINT,
      RESISTOR_1K8_FOOTPRINT,
      WIRE_LINK_FOOTPRINT,
      CAP_470U_25V_FOOTPRINT,
      CAP_470U_16V_FOOTPRINT,
      CAP_100N_FOOTPRINT,
    ].map((footprint) => [footprint.id, footprint]),
  ),
);

export function getFootprint(footprintId: string | undefined): Footprint | undefined {
  return footprintId === undefined ? undefined : FOOTPRINTS[footprintId];
}

export interface FootprintReference {
  footprintId?: string;
  footprint?: Footprint;
}

/** Prefer a project-owned definition, falling back to the built-in palette catalog. */
export function resolveFootprint(reference: FootprintReference): Footprint | undefined {
  if (reference.footprint) return reference.footprint;
  return getFootprint(reference.footprintId);
}

/** Plain-data clone suitable for persistence and defensive runtime ownership. */
export function cloneFootprint(footprint: Footprint): Footprint {
  return {
    ...footprint,
    pins: footprint.pins.map((pin) => ({ ...pin, cell: { ...pin.cell } })),
    shapes: footprint.shapes.map((shape) => ({ ...shape })),
    artwork: footprint.artwork ? { ...footprint.artwork } : undefined,
    bodyCells: footprint.bodyCells?.map((cell) => ({ ...cell })),
  };
}
