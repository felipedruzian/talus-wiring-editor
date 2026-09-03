/**
 * A bundled SVG whose geometry and pin markers were reviewed with the source.
 *
 * This contract is deliberately separate from `RasterArtworkAsset`: trusted
 * artwork is immutable application code, never a data URL, local-storage
 * payload or user upload. Its revision identifies the exact bundled drawing
 * while all geometry stays in board-pitch units.
 */
export interface TrustedComponentArtwork {
  readonly kind: 'trusted-component-svg';
  /** Whether the SVG includes its terminals or is a rigid body composed with renderer-owned leads. */
  readonly terminalModel: 'integral-fixed' | 'adjustable-axial';
  readonly id: string;
  readonly footprintId: string;
  readonly revision: string;
  readonly license: 'MIT';
  readonly href: `/assets/components/${string}.svg`;
  readonly provisional: boolean;
  readonly bounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
    preserveAspectRatio: true;
  }>;
  readonly grid: Readonly<{ rows: number; cols: number }>;
  readonly pins: readonly TrustedComponentPin[];
  readonly adjustableAxial?: Readonly<{
    minSpan: number;
    maxSpan: number;
    defaultSpan: number;
    firstPinId: string;
    secondPinId: string;
    /** SVG viewBox relative to the midpoint between the two terminal holes. */
    bodyBounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  }>;
}

export interface TrustedComponentPin {
  readonly id: string;
  readonly label: string;
  /** Electrical board address used by legacy/uniform grids. */
  readonly row: number;
  readonly col: number;
  /** Physical marker center in artwork pitch units. */
  readonly marker: Readonly<{ x: number; y: number }>;
  readonly primary?: true;
}

const REVISION = '2026-09-03';

type TrustedComponentPinInput = Omit<TrustedComponentPin, 'marker'> & {
  readonly marker?: Readonly<{ x: number; y: number }>;
};

function trustedArtwork(
  definition: Omit<TrustedComponentArtwork, 'kind' | 'revision' | 'license' | 'pins'> & {
    readonly pins: readonly TrustedComponentPinInput[];
  },
): TrustedComponentArtwork {
  return Object.freeze({
    ...definition,
    kind: 'trusted-component-svg' as const,
    revision: REVISION,
    license: 'MIT' as const,
    bounds: Object.freeze({ ...definition.bounds }),
    grid: Object.freeze({ ...definition.grid }),
    pins: Object.freeze(
      definition.pins.map((pin) =>
        Object.freeze({
          ...pin,
          marker: Object.freeze({ ...(pin.marker ?? { x: pin.col, y: pin.row }) }),
        }),
      ),
    ),
    adjustableAxial: definition.adjustableAxial
      ? Object.freeze({
          ...definition.adjustableAxial,
          bodyBounds: Object.freeze({ ...definition.adjustableAxial.bodyBounds }),
        })
      : undefined,
  });
}

export const ARDUINO_NANO_ARTWORK = trustedArtwork({
  terminalModel: 'integral-fixed',
  id: 'arduino-nano-classic',
  footprintId: 'arduino-nano',
  href: '/assets/components/arduino-nano-classic.svg',
  provisional: false,
  bounds: { x: -1.5, y: -0.5, width: 17, height: 7, preserveAspectRatio: true },
  grid: { rows: 7, cols: 15 },
  pins: [
    ...[
      ['d13', 'D13'],
      ['3v3', '3V3'],
      ['aref', 'REF'],
      ['a0', 'A0'],
      ['a1', 'A1'],
      ['a2', 'A2'],
      ['a3', 'A3'],
      ['a4', 'A4'],
      ['a5', 'A5'],
      ['a6', 'A6'],
      ['a7', 'A7'],
      ['5v', '5V'],
      ['rst', 'RST'],
      ['gnd', 'GND'],
      ['vin', 'VIN'],
    ].map(([id, label], col) => ({ id, label, row: 0, col })),
    ...[
      ['d12', 'D12'],
      ['d11', 'D11'],
      ['d10', 'D10'],
      ['d9', 'D9'],
      ['d8', 'D8'],
      ['d7', 'D7'],
      ['d6', 'D6'],
      ['d5', 'D5'],
      ['d4', 'D4'],
      ['d3', 'D3'],
      ['d2', 'D2'],
      ['gnd-2', 'GND 2'],
      ['rst-2', 'RST 2'],
      ['d0', 'D0'],
      ['d1', 'D1'],
    ].map(([id, label], col) => ({
      id,
      label,
      row: 6,
      col,
      ...(id === 'd1' ? { primary: true as const } : {}),
    })),
  ],
});

export const GY_521_MPU6050_ARTWORK = trustedArtwork({
  terminalModel: 'integral-fixed',
  id: 'gy-521-mpu6050',
  footprintId: 'gy-521-mpu6050',
  href: '/assets/components/gy-521-mpu6050.svg',
  provisional: true,
  bounds: { x: -0.5, y: -0.5, width: 8, height: 6.1, preserveAspectRatio: true },
  grid: { rows: 6, cols: 8 },
  pins: ['vcc', 'gnd', 'scl', 'sda', 'xda', 'xcl', 'ad0', 'int'].map((id, col) => ({
    id,
    label: id.toUpperCase(),
    row: 0,
    col,
    ...(id === 'vcc' ? { primary: true as const } : {}),
  })),
});

export const TB6612FNG_ARTWORK = trustedArtwork({
  terminalModel: 'integral-fixed',
  id: 'tb6612fng-talus',
  footprintId: 'tb6612fng',
  href: '/assets/components/tb6612fng-talus.svg',
  provisional: true,
  bounds: { x: -0.5, y: -0.5, width: 8, height: 7, preserveAspectRatio: true },
  grid: { rows: 7, cols: 8 },
  pins: [
    ...['vm', 'vcc', 'gnd', 'ao1', 'ao2', 'bo2', 'bo1', 'gnd-2'].map((id, col) => ({
      id,
      label: id === 'gnd-2' ? 'GND 2' : id.toUpperCase(),
      row: 0,
      col,
      ...(id === 'vm' ? { primary: true as const } : {}),
    })),
    ...['pwma', 'ain2', 'ain1', 'stby', 'bin1', 'bin2', 'pwmb', 'gnd-3'].map((id, col) => ({
      id,
      label: id === 'gnd-3' ? 'GND 3' : id.toUpperCase(),
      row: 6,
      col,
    })),
  ],
});

export const BUZZER_ACTIVE_12MM_ARTWORK = trustedArtwork({
  terminalModel: 'integral-fixed',
  id: 'buzzer-active-12mm',
  footprintId: 'buzzer-active-12mm',
  href: '/assets/components/buzzer-active-12mm.svg',
  provisional: false,
  bounds: { x: -0.86, y: -2.36, width: 4.72, height: 4.72, preserveAspectRatio: true },
  grid: { rows: 1, cols: 4 },
  pins: [
    { id: 'plus', label: '+', row: 0, col: 0, primary: true },
    { id: 'minus', label: '-', row: 0, col: 3 },
  ],
});

export const CAPACITOR_ELECTROLYTIC_470UF_25V_ARTWORK = trustedArtwork({
  terminalModel: 'integral-fixed',
  id: 'capacitor-electrolytic-470uf-25v',
  footprintId: 'cap-470u-25v',
  href: '/assets/components/capacitor-electrolytic-470uf-25v.svg',
  provisional: false,
  bounds: { x: -0.97, y: -1.97, width: 3.94, height: 3.94, preserveAspectRatio: true },
  grid: { rows: 1, cols: 3 },
  pins: [
    { id: 'plus', label: '+', row: 0, col: 0, primary: true },
    { id: 'minus', label: '-', row: 0, col: 2 },
  ],
});

export const CAPACITOR_ELECTROLYTIC_470UF_16V_ARTWORK = trustedArtwork({
  terminalModel: 'integral-fixed',
  id: 'capacitor-electrolytic-470uf-16v-lead-formed',
  footprintId: 'cap-470u-16v',
  href: '/assets/components/capacitor-electrolytic-470uf-16v-lead-formed.svg',
  provisional: true,
  bounds: { x: -0.575, y: -1.575, width: 3.15, height: 3.15, preserveAspectRatio: true },
  grid: { rows: 1, cols: 3 },
  pins: [
    { id: 'plus', label: '+', row: 0, col: 0, primary: true },
    { id: 'minus', label: '-', row: 0, col: 2 },
  ],
});

export const CAPACITOR_CERAMIC_100NF_ARTWORK = trustedArtwork({
  terminalModel: 'integral-fixed',
  id: 'capacitor-ceramic-100nf',
  footprintId: 'cap-100n',
  href: '/assets/components/capacitor-ceramic-100nf.svg',
  provisional: false,
  bounds: { x: -0.25, y: -0.85, width: 2.5, height: 1.7, preserveAspectRatio: true },
  grid: { rows: 1, cols: 3 },
  pins: [
    { id: 'a', label: '1', row: 0, col: 0 },
    { id: 'b', label: '2', row: 0, col: 2 },
  ],
});

function axialResistorArtwork(
  id: string,
  footprintId: string,
  href: TrustedComponentArtwork['href'],
): TrustedComponentArtwork {
  const defaultSpan = 4;
  return trustedArtwork({
    terminalModel: 'adjustable-axial',
    id,
    footprintId,
    href,
    provisional: false,
    bounds: {
      x: defaultSpan / 2 - 1.38,
      y: -0.59,
      width: 2.76,
      height: 1.18,
      preserveAspectRatio: true,
    },
    grid: { rows: 1, cols: defaultSpan + 1 },
    pins: [
      { id: 'a', label: '1', row: 0, col: 0, primary: true },
      { id: 'b', label: '2', row: 0, col: defaultSpan },
    ],
    adjustableAxial: {
      minSpan: 4,
      maxSpan: 10,
      defaultSpan,
      firstPinId: 'a',
      secondPinId: 'b',
      bodyBounds: { x: -1.38, y: -0.59, width: 2.76, height: 1.18 },
    },
  });
}

export const RESISTOR_AXIAL_1K_ARTWORK = axialResistorArtwork(
  'resistor-axial-1k',
  'resistor-1k',
  '/assets/components/resistor-axial-1k.svg',
);

export const RESISTOR_AXIAL_1K8_ARTWORK = axialResistorArtwork(
  'resistor-axial-1k8',
  'resistor-1k8',
  '/assets/components/resistor-axial-1k8.svg',
);

export const TRUSTED_COMPONENT_ARTWORK = Object.freeze([
  ARDUINO_NANO_ARTWORK,
  GY_521_MPU6050_ARTWORK,
  TB6612FNG_ARTWORK,
  BUZZER_ACTIVE_12MM_ARTWORK,
  RESISTOR_AXIAL_1K_ARTWORK,
  RESISTOR_AXIAL_1K8_ARTWORK,
  CAPACITOR_ELECTROLYTIC_470UF_25V_ARTWORK,
  CAPACITOR_ELECTROLYTIC_470UF_16V_ARTWORK,
  CAPACITOR_CERAMIC_100NF_ARTWORK,
] as const);

const ARTWORK_BY_FOOTPRINT = new Map(
  TRUSTED_COMPONENT_ARTWORK.map((artwork) => [artwork.footprintId, artwork]),
);

export function trustedArtworkForFootprint(
  footprintId: string | undefined,
): TrustedComponentArtwork | undefined {
  return footprintId ? ARTWORK_BY_FOOTPRINT.get(footprintId) : undefined;
}

export interface TrustedFootprintDefinition {
  readonly id?: string;
  readonly rows: number;
  readonly cols: number;
  readonly physicalBounds?: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly axialSpan?: number;
  readonly pins?: readonly {
    readonly id: string;
    readonly cell: Readonly<{ row: number; col: number }>;
    readonly artworkPoint?: Readonly<{ x: number; y: number }>;
    readonly primary?: boolean;
  }[];
}

/** Resolve artwork only while the embedded physical geometry still matches its reviewed contract. */
export function trustedArtworkForFootprintDefinition(
  footprint: TrustedFootprintDefinition,
): TrustedComponentArtwork | undefined {
  const artwork = trustedArtworkForFootprint(footprint.id);
  if (!artwork) {
    return undefined;
  }
  const adjustable = artwork.adjustableAxial;
  if (adjustable) {
    const span = footprint.axialSpan;
    if (
      !Number.isSafeInteger(span) ||
      span === undefined ||
      span < adjustable.minSpan ||
      span > adjustable.maxSpan ||
      footprint.rows !== 1 ||
      footprint.cols !== span + 1 ||
      footprint.pins?.length !== 2
    ) {
      return undefined;
    }
    const resolvedPins = artwork.pins.map((pin) =>
      pin.id === adjustable.secondPinId
        ? {
            ...pin,
            col: span,
            marker: Object.freeze({ x: span, y: pin.marker.y }),
          }
        : pin,
    );
    if (!pinsMatch(footprint.pins, resolvedPins)) return undefined;
    return Object.freeze({
      ...artwork,
      bounds: Object.freeze({
        x: span / 2 + adjustable.bodyBounds.x,
        y: adjustable.bodyBounds.y,
        width: adjustable.bodyBounds.width,
        height: adjustable.bodyBounds.height,
        preserveAspectRatio: true as const,
      }),
      grid: Object.freeze({ rows: 1, cols: span + 1 }),
      pins: Object.freeze(
        resolvedPins.map((pin) =>
          Object.freeze({ ...pin, marker: Object.freeze({ ...pin.marker }) }),
        ),
      ),
    });
  }
  if (
    footprint.rows !== artwork.grid.rows ||
    footprint.cols !== artwork.grid.cols ||
    footprint.physicalBounds?.x !== artwork.bounds.x ||
    footprint.physicalBounds?.y !== artwork.bounds.y ||
    footprint.physicalBounds?.width !== artwork.bounds.width ||
    footprint.physicalBounds?.height !== artwork.bounds.height ||
    footprint.pins?.length !== artwork.pins.length
  ) {
    return undefined;
  }
  return pinsMatch(footprint.pins, artwork.pins) ? artwork : undefined;
}

function pinsMatch(
  footprintPins: NonNullable<TrustedFootprintDefinition['pins']>,
  trustedPins: readonly TrustedComponentPin[],
): boolean {
  const pins = new Map(footprintPins.map((pin) => [pin.id, pin]));
  return trustedPins.every((trustedPin) => {
    const pin = pins.get(trustedPin.id);
    return (
      pin?.cell.row === trustedPin.row &&
      pin.cell.col === trustedPin.col &&
      pin.artworkPoint?.x === trustedPin.marker.x &&
      pin.artworkPoint.y === trustedPin.marker.y &&
      (pin.primary === true) === (trustedPin.primary === true)
    );
  });
}
