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
  BUZZER_ACTIVE_12MM_ARTWORK,
  CAPACITOR_CERAMIC_100NF_ARTWORK,
  CAPACITOR_ELECTROLYTIC_470UF_16V_ARTWORK,
  CAPACITOR_ELECTROLYTIC_470UF_25V_ARTWORK,
  GY_521_MPU6050_ARTWORK,
  RESISTOR_AXIAL_1K8_ARTWORK,
  RESISTOR_AXIAL_1K_ARTWORK,
  TB6612FNG_ARTWORK,
  trustedArtworkForFootprintDefinition,
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
  /**
   * Physical center of the pin marker in artwork pitch units. When absent,
   * the marker is the legacy cell center (`x = col`, `y = row`). Keeping this
   * separate from `cell` lets a rigid component bridge a non-uniform board
   * without stretching its image to the board's address grid.
   */
  artworkPoint?: { x: number; y: number };
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

export interface FootprintPhysicalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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
  /** Rigid physical body bounds in pitch units, independent from its renderer. */
  physicalBounds?: FootprintPhysicalBounds;
  /** Whole-pitch terminal spacing for a renderer-adjustable axial body. */
  axialSpan?: number;
  /**
   * Cells the body physically covers beyond its pins. Absent means the body
   * covers its whole `rows x cols` bounding box, which is the usual case for a
   * DIP/module and the conservative answer for occupancy.
   */
  bodyCells?: FootprintCell[];
}

/** Two-pin axial part (resistor, diode, wire link) lying flat across `span + 1` holes. */
function legacyAxialFootprint(
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

export const AXIAL_RESISTOR_MIN_SPAN = 4;
export const AXIAL_RESISTOR_MAX_SPAN = 10;
export const AXIAL_RESISTOR_DEFAULT_SPAN = 4;

interface AxialResistorSpec {
  id: string;
  label: string;
  bandPaints: readonly FootprintPaint[];
  artwork: TrustedComponentArtwork;
}

const AXIAL_RESISTOR_SPECS: Readonly<Record<string, AxialResistorSpec>> = Object.freeze({
  'resistor-1k': {
    id: 'resistor-1k',
    label: '1 kOhm',
    bandPaints: ['body-alt', 'lead', 'polarity', 'accent'],
    artwork: RESISTOR_AXIAL_1K_ARTWORK,
  },
  'resistor-1k8': {
    id: 'resistor-1k8',
    label: '1,8 kOhm',
    bandPaints: ['body-alt', 'silk', 'polarity', 'accent'],
    artwork: RESISTOR_AXIAL_1K8_ARTWORK,
  },
});

function axialResistorShapes(
  label: string,
  span: number,
  bandPaints: readonly FootprintPaint[],
): FootprintShape[] {
  const center = span / 2;
  const bodyStart = center - 1.28;
  const bands: FootprintShape[] = bandPaints.map((paint, index) => ({
    kind: 'rect',
    x: center - 0.73 + index * 0.42,
    y: -0.46,
    width: 0.18,
    height: 0.92,
    rx: 0.04,
    fill: paint,
  }));
  return [
    { kind: 'line', x1: 0, y1: 0, x2: span, y2: 0, stroke: 'lead', width: 0.1 },
    {
      kind: 'rect',
      x: bodyStart,
      y: -0.49,
      width: 2.56,
      height: 0.98,
      rx: 0.45,
      fill: 'body',
      stroke: 'silk',
    },
    ...bands,
    { kind: 'text', x: center, y: -0.82, text: label, anchor: 'middle', size: 0.34 },
  ];
}

function adjustableAxialFootprint(spec: AxialResistorSpec, span: number): Footprint {
  if (!isValidAxialResistorSpan(span)) {
    throw new RangeError(
      `Axial resistor span must be an integer from ${AXIAL_RESISTOR_MIN_SPAN} to ${AXIAL_RESISTOR_MAX_SPAN}.`,
    );
  }
  const adjustable = spec.artwork.adjustableAxial;
  if (!adjustable) throw new Error(`Missing adjustable axial contract for ${spec.id}.`);
  return {
    id: spec.id,
    label: spec.label,
    rows: 1,
    cols: span + 1,
    axialSpan: span,
    pins: [
      {
        id: 'a',
        label: '1',
        cell: { row: 0, col: 0 },
        artworkPoint: { x: 0, y: 0 },
        primary: true,
      },
      {
        id: 'b',
        label: '2',
        cell: { row: 0, col: span },
        artworkPoint: { x: span, y: 0 },
      },
    ],
    shapes: axialResistorShapes(spec.label, span, spec.bandPaints),
    physicalBounds: {
      x: span / 2 + adjustable.bodyBounds.x,
      y: adjustable.bodyBounds.y,
      width: adjustable.bodyBounds.width,
      height: adjustable.bodyBounds.height,
    },
  };
}

export function isValidAxialResistorSpan(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= AXIAL_RESISTOR_MIN_SPAN &&
    value <= AXIAL_RESISTOR_MAX_SPAN
  );
}

export function isCoherentAxialFootprint(
  footprint: Pick<Footprint, 'rows' | 'cols' | 'pins' | 'axialSpan'>,
): boolean {
  const span = footprint.axialSpan;
  if (
    span === undefined ||
    !isValidAxialResistorSpan(span) ||
    footprint.rows !== 1 ||
    footprint.cols !== span + 1 ||
    footprint.pins.length !== 2
  ) {
    return false;
  }
  const endpoints = new Set(footprint.pins.map((pin) => `${pin.cell.row}:${pin.cell.col}`));
  return endpoints.size === 2 && endpoints.has('0:0') && endpoints.has(`0:${span}`);
}

export type AxialSpanResizeResult =
  | { ok: true; footprint: Footprint }
  | { ok: false; message: string };

/** Resize only the renderer-owned leads; body and band geometry stay rigid around the midpoint. */
export function resizeAxialFootprintSpan(
  footprint: Footprint,
  requestedSpan: number,
): AxialSpanResizeResult {
  const spec = AXIAL_RESISTOR_SPECS[footprint.id];
  const artwork = trustedArtworkForFootprintDefinition(footprint);
  const adjustable = artwork?.adjustableAxial;
  if (!spec || !adjustable || !isCoherentAxialFootprint(footprint)) {
    return { ok: false, message: 'Este footprint não possui vão axial ajustável.' };
  }
  if (!isValidAxialResistorSpan(requestedSpan)) {
    return {
      ok: false,
      message: `Informe um vão inteiro entre ${AXIAL_RESISTOR_MIN_SPAN} e ${AXIAL_RESISTOR_MAX_SPAN} passos.`,
    };
  }
  const resized = adjustableAxialFootprint(spec, requestedSpan);
  return {
    ok: true,
    footprint: {
      ...footprint,
      rows: resized.rows,
      cols: resized.cols,
      axialSpan: resized.axialSpan,
      pins: footprint.pins.map((pin) => {
        const resizedPin = resized.pins.find((candidate) => candidate.id === pin.id);
        return resizedPin
          ? {
              ...pin,
              cell: { ...resizedPin.cell },
              artworkPoint: resizedPin.artworkPoint ? { ...resizedPin.artworkPoint } : undefined,
            }
          : pin;
      }),
      shapes: resized.shapes,
      physicalBounds: resized.physicalBounds ? { ...resized.physicalBounds } : undefined,
      bodyCells: undefined,
    },
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
      artworkPoint: { ...pin.marker },
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
    physicalBounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
  };
}

function trustedFixedFootprint(
  artwork: TrustedComponentArtwork,
  label: string,
  shapes: FootprintShape[],
): Footprint {
  return {
    id: artwork.footprintId,
    label,
    rows: artwork.grid.rows,
    cols: artwork.grid.cols,
    pins: artwork.pins.map((pin) => ({
      id: pin.id,
      label: pin.label,
      cell: { row: pin.row, col: pin.col },
      artworkPoint: { ...pin.marker },
      primary: pin.primary,
    })),
    shapes,
    physicalBounds: {
      x: artwork.bounds.x,
      y: artwork.bounds.y,
      width: artwork.bounds.width,
      height: artwork.bounds.height,
    },
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

export const BUZZER_ACTIVE_12MM_FOOTPRINT = trustedFixedFootprint(
  BUZZER_ACTIVE_12MM_ARTWORK,
  'Buzzer ativo 12 mm',
  [
    { kind: 'line', x1: 0, y1: 0, x2: 3, y2: 0, stroke: 'lead', width: 0.1 },
    { kind: 'circle', cx: 1.5, cy: 0, r: 2.31, fill: 'body-alt', stroke: 'silk' },
    { kind: 'text', x: 0, y: -0.54, text: '+', anchor: 'middle', size: 0.62 },
    { kind: 'text', x: 3, y: -0.54, text: '-', anchor: 'middle', size: 0.62 },
  ],
);

export const RESISTOR_1K_FOOTPRINT = adjustableAxialFootprint(
  AXIAL_RESISTOR_SPECS['resistor-1k'],
  AXIAL_RESISTOR_DEFAULT_SPAN,
);

export const RESISTOR_1K8_FOOTPRINT = adjustableAxialFootprint(
  AXIAL_RESISTOR_SPECS['resistor-1k8'],
  AXIAL_RESISTOR_DEFAULT_SPAN,
);

/** Historic two-pitch UART divider parts; kept out of the adjustable library contract. */
export const UART_DIVIDER_RESISTOR_1K_FOOTPRINT = legacyAxialFootprint(
  'uart-divider-resistor-1k',
  '1k',
  2,
  ['accent', 'polarity', 'accent'],
);

export const UART_DIVIDER_RESISTOR_1K8_FOOTPRINT = legacyAxialFootprint(
  'uart-divider-resistor-1k8',
  '1k8',
  2,
  ['accent', 'polarity', 'silk'],
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

export const CAP_470U_25V_FOOTPRINT = trustedFixedFootprint(
  CAPACITOR_ELECTROLYTIC_470UF_25V_ARTWORK,
  '470 uF / 25 V',
  [
    { kind: 'line', x1: 0, y1: 0, x2: 2, y2: 0, stroke: 'lead', width: 0.1 },
    { kind: 'circle', cx: 1, cy: 0, r: 1.92, fill: 'body-alt', stroke: 'silk' },
    { kind: 'text', x: 0, y: -0.45, text: '+', anchor: 'middle', size: 0.58 },
    { kind: 'text', x: 2, y: -0.45, text: '-', anchor: 'middle', size: 0.58 },
  ],
);

export const CAP_470U_16V_FOOTPRINT = trustedFixedFootprint(
  CAPACITOR_ELECTROLYTIC_470UF_16V_ARTWORK,
  '470 uF / 16 V',
  [
    { kind: 'line', x1: 0, y1: 0, x2: 2, y2: 0, stroke: 'lead', width: 0.1 },
    { kind: 'circle', cx: 1, cy: 0, r: 1.52, fill: 'body-alt', stroke: 'silk' },
    { kind: 'text', x: 0, y: -0.39, text: '+', anchor: 'middle', size: 0.52 },
    { kind: 'text', x: 2, y: -0.39, text: '-', anchor: 'middle', size: 0.52 },
  ],
);

export const CAP_100N_FOOTPRINT = trustedFixedFootprint(CAPACITOR_CERAMIC_100NF_ARTWORK, '100 nF', [
  { kind: 'line', x1: 0, y1: 0, x2: 2, y2: 0, stroke: 'lead', width: 0.1 },
  {
    kind: 'rect',
    x: 0.215,
    y: -0.785,
    width: 1.57,
    height: 1.57,
    rx: 0.2,
    fill: 'accent',
    stroke: 'silk',
  },
]);

export const FOOTPRINTS: Readonly<Record<string, Footprint>> = Object.freeze(
  Object.fromEntries(
    [
      ARDUINO_NANO_FOOTPRINT,
      GY_521_MPU6050_FOOTPRINT,
      TB6612FNG_FOOTPRINT,
      BUZZER_ACTIVE_12MM_FOOTPRINT,
      RESISTOR_1K_FOOTPRINT,
      RESISTOR_1K8_FOOTPRINT,
      UART_DIVIDER_RESISTOR_1K_FOOTPRINT,
      UART_DIVIDER_RESISTOR_1K8_FOOTPRINT,
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
    pins: footprint.pins.map((pin) => ({
      ...pin,
      cell: { ...pin.cell },
      artworkPoint: pin.artworkPoint ? { ...pin.artworkPoint } : undefined,
    })),
    shapes: footprint.shapes.map((shape) => ({ ...shape })),
    artwork: footprint.artwork ? { ...footprint.artwork } : undefined,
    physicalBounds: footprint.physicalBounds ? { ...footprint.physicalBounds } : undefined,
    bodyCells: footprint.bodyCells?.map((cell) => ({ ...cell })),
  };
}
