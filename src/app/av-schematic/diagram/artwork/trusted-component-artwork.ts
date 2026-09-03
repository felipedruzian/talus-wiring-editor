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
  });
}

export const ARDUINO_NANO_ARTWORK = trustedArtwork({
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

export const TRUSTED_COMPONENT_ARTWORK = Object.freeze([
  ARDUINO_NANO_ARTWORK,
  GY_521_MPU6050_ARTWORK,
  TB6612FNG_ARTWORK,
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
  if (
    footprint.rows !== artwork.grid.rows ||
    footprint.cols !== artwork.grid.cols ||
    footprint.pins?.length !== artwork.pins.length
  ) {
    return undefined;
  }
  const pins = new Map(footprint.pins.map((pin) => [pin.id, pin]));
  return artwork.pins.every((trustedPin) => {
    const pin = pins.get(trustedPin.id);
    return (
      pin?.cell.row === trustedPin.row &&
      pin.cell.col === trustedPin.col &&
      pin.artworkPoint?.x === trustedPin.marker.x &&
      pin.artworkPoint.y === trustedPin.marker.y &&
      (pin.primary === true) === (trustedPin.primary === true)
    );
  })
    ? artwork
    : undefined;
}
