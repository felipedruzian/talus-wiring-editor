import {
  type RasterArtworkAsset,
  type RasterArtworkMimeType,
} from '../diagram/artwork/artwork-asset.store';
import { type DeviceNodeData, type DevicePort } from '../diagram/model/interfaces';
import {
  isCoherentAxialFootprint,
  type Footprint,
  type FootprintArtwork,
  type FootprintCell,
} from '../diagram/model/footprint';
import {
  assertValidRasterArtworkAsset,
  MAX_ARTWORK_OUTPUT_BYTES,
  MAX_ARTWORK_OUTPUT_DIMENSION,
  MAX_ARTWORK_OUTPUT_PIXELS,
} from './artwork-import';
import { SEED_LIBRARY, type LibraryDevice } from './seed-library';

export const LIBRARY_STORAGE_KEY = 'talus-wiring-editor.library.v2';
export const LEGACY_LIBRARY_STORAGE_KEY = 'talus-wiring-editor.library.v1';
export const LIBRARY_STORAGE_VERSION = 2;
export const LIBRARY_SEED_REVISION = 2;
export const MAX_LIBRARY_ASSETS = 128;
export const MAX_LIBRARY_DEVICES = 4096;
export const MAX_LIBRARY_STORAGE_BYTES = 16 * 1024 * 1024;

export interface LibraryCatalog {
  devices: LibraryDevice[];
  assets: RasterArtworkAsset[];
  loadError?: string;
}

export interface PersistedLibraryV2 {
  version: typeof LIBRARY_STORAGE_VERSION;
  seedRevision: typeof LIBRARY_SEED_REVISION;
  devices: LibraryDevice[];
  assets: Record<string, Omit<RasterArtworkAsset, 'hash'>>;
}

export type LibraryPersistenceResult = { ok: true } | { ok: false; message: string };
export type PreparedLibraryCatalog =
  | { ok: true; payload: PersistedLibraryV2; serialized: string }
  | { ok: false; message: string };
export interface SharedLibraryCatalogParseResult {
  catalog: LibraryCatalog;
  needsUpgrade: boolean;
}
export interface LibraryCatalogLoadState {
  catalog: LibraryCatalog;
  needsUpgrade: boolean;
  needsRepair: boolean;
}

export function browserLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadLibraryCatalog(storage: Storage | null): LibraryCatalogLoadState {
  if (!storage) return cleanSeedLoadState();
  try {
    const current = storage.getItem(LIBRARY_STORAGE_KEY);
    if (current) {
      let raw: unknown;
      try {
        raw = JSON.parse(current) as unknown;
      } catch {
        return invalidSeedLoadState();
      }
      const recovered = recoverPersistedLibrary(raw);
      if (!recovered) return invalidSeedLoadState();
      return {
        catalog: recovered.catalog,
        needsUpgrade: recovered.wasMigrated,
        needsRepair: recovered.wasRepaired,
      };
    }

    const legacy = storage.getItem(LEGACY_LIBRARY_STORAGE_KEY);
    if (!legacy) return cleanSeedLoadState();
    let raw: unknown;
    try {
      raw = JSON.parse(legacy) as unknown;
    } catch {
      return invalidSeedLoadState();
    }
    const recovered = recoverLegacyLibrary(raw);
    if (!recovered) return invalidSeedLoadState();
    return {
      catalog: recovered.catalog,
      needsUpgrade: true,
      needsRepair: recovered.wasRepaired,
    };
  } catch {
    return invalidSeedLoadState();
  }
}

/** Compatibility helper for callers that only need the device list. */
export function loadLibraryDevices(storage: Storage | null): LibraryDevice[] {
  return loadLibraryCatalog(storage).catalog.devices;
}

export function persistLibraryCatalog(
  storage: Storage | null,
  catalog: LibraryCatalog,
): LibraryPersistenceResult {
  if (!storage) {
    return {
      ok: false,
      message: 'O armazenamento local não está disponível; as alterações durarão apenas nesta aba.',
    };
  }
  const prepared = prepareLibraryCatalog(catalog);
  if (!prepared.ok) return prepared;
  try {
    storage.setItem(LIBRARY_STORAGE_KEY, prepared.serialized);
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return {
      ok: false,
      message: quota
        ? 'O navegador ficou sem espaço para salvar o catálogo. Remova imagens ou libere armazenamento e tente novamente.'
        : 'Não foi possível salvar o catálogo neste navegador. As alterações durarão apenas nesta aba.',
    };
  }
}

/** Validate and serialize without mutating storage; used by the central API client. */
export function prepareLibraryCatalog(catalog: LibraryCatalog): PreparedLibraryCatalog {
  if (catalog.devices.length > MAX_LIBRARY_DEVICES) {
    return {
      ok: false,
      message: `O catálogo aceita no máximo ${MAX_LIBRARY_DEVICES} componentes.`,
    };
  }
  const deviceIds = new Set<string>();
  if (
    catalog.devices.some((device) => {
      if (!isLibraryDevice(device) || deviceIds.has(device.libraryId)) return true;
      deviceIds.add(device.libraryId);
      return false;
    })
  ) {
    return { ok: false, message: 'O catálogo contém componentes inválidos ou duplicados.' };
  }
  const assetsByHash = new Map<string, RasterArtworkAsset>();
  for (const asset of catalog.assets) {
    const existing = assetsByHash.get(asset.hash);
    if (existing && JSON.stringify(existing) !== JSON.stringify(asset)) {
      return { ok: false, message: 'Há duas imagens diferentes declaradas com o mesmo hash.' };
    }
    assetsByHash.set(asset.hash, asset);
  }
  if (assetsByHash.size > MAX_LIBRARY_ASSETS) {
    return {
      ok: false,
      message: `O catálogo aceita no máximo ${MAX_LIBRARY_ASSETS} imagens. Remova uma imagem antes de continuar.`,
    };
  }
  try {
    for (const asset of assetsByHash.values()) assertValidRasterArtworkAsset(asset);
  } catch {
    return { ok: false, message: 'O catálogo contém uma imagem inválida ou corrompida.' };
  }
  const referencedHashes = referencedArtworkHashes(catalog.devices);
  if ([...referencedHashes].some((hash) => !assetsByHash.has(hash))) {
    return { ok: false, message: 'O catálogo referencia uma imagem que não está disponível.' };
  }
  const assets = Object.fromEntries(
    [...assetsByHash].map(([hash, { hash: _hash, ...asset }]) => [hash, asset]),
  ) as PersistedLibraryV2['assets'];
  const payload: PersistedLibraryV2 = {
    version: LIBRARY_STORAGE_VERSION,
    seedRevision: LIBRARY_SEED_REVISION,
    devices: structuredClone(catalog.devices),
    assets,
  };
  const serialized = JSON.stringify(payload);
  if (new TextEncoder().encode(serialized).byteLength > MAX_LIBRARY_STORAGE_BYTES) {
    return {
      ok: false,
      message:
        'O catálogo excede o limite local de 16 MiB. Remova imagens sem uso e tente novamente.',
    };
  }
  return { ok: true, payload, serialized };
}

/** Reject invalid-data repairs while surfacing deterministic seed migrations explicitly. */
export function parseSharedLibraryCatalog(value: unknown): SharedLibraryCatalogParseResult | null {
  const recovered = recoverPersistedLibrary(value);
  if (!recovered || recovered.wasRepaired || recovered.catalog.loadError) return null;
  return { catalog: recovered.catalog, needsUpgrade: recovered.wasMigrated };
}

/** Compatibility helper that preserves any already stored artwork. */
export function persistLibraryDevices(
  storage: Storage | null,
  devices: LibraryDevice[],
): LibraryPersistenceResult {
  const existing = loadLibraryCatalog(storage).catalog;
  return persistLibraryCatalog(storage, { devices, assets: existing.assets });
}

function recoverPersistedLibrary(
  value: unknown,
): { catalog: LibraryCatalog; wasRepaired: boolean; wasMigrated: boolean } | null {
  if (!isRecord(value) || value['version'] !== LIBRARY_STORAGE_VERSION) return null;
  if (!Array.isArray(value['devices']) || !isRecord(value['assets'])) return null;

  const assets: RasterArtworkAsset[] = [];
  let wasRepaired = false;
  const rawAssets = Object.entries(value['assets']);
  if (rawAssets.length > MAX_LIBRARY_ASSETS) {
    return {
      catalog: {
        ...seedCatalog(),
        loadError: `O catálogo armazenado excede o limite de ${MAX_LIBRARY_ASSETS} imagens e não foi alterado.`,
      },
      wasRepaired: false,
      wasMigrated: false,
    };
  }
  for (const [hash, rawAsset] of rawAssets) {
    const asset = recoverAsset(hash, rawAsset);
    if (asset) assets.push(asset);
    else wasRepaired = true;
  }
  const availableHashes = new Set(assets.map((asset) => asset.hash));
  const recoveredDevices = recoverDevices(value['devices'], availableHashes);
  wasRepaired ||= recoveredDevices.wasRepaired;
  const seedRevision = recoverSeedRevision(value['seedRevision'], recoveredDevices.devices);
  wasRepaired ||= seedRevision.wasRepaired;
  const devices =
    seedRevision.revision < LIBRARY_SEED_REVISION
      ? appendMissingPassiveSeeds(recoveredDevices.devices)
      : recoveredDevices.devices;
  const wasMigrated = recoveredDevices.wasMigrated || seedRevision.revision < LIBRARY_SEED_REVISION;
  return {
    catalog: {
      devices,
      // Loading must not garbage-collect valid assets. An unreferenced upload may
      // still be a user's pending library resource, and deterministic seed
      // migrations must preserve the complete validated catalog verbatim.
      assets: assets.map((asset) => structuredClone(asset)),
    },
    wasRepaired,
    wasMigrated,
  };
}

const PASSIVE_LIBRARY_IDS = new Set([
  'lib-buzzer-active-12mm',
  'lib-resistor-1k',
  'lib-resistor-1k8',
  'lib-capacitor-electrolytic-470uf',
  'lib-capacitor-ceramic-100nf',
]);

const PRE_PASSIVE_LIBRARY_IDS = new Set([
  'lib-arduino-nano',
  'lib-raspberry-pi-4',
  'lib-mpu6050-gy521',
  'lib-tb6612fng',
  'lib-lm2596s',
  'lib-hall-a3144-lm393',
]);

function recoverSeedRevision(
  raw: unknown,
  devices: readonly LibraryDevice[],
): { revision: number; wasRepaired: boolean } {
  if (raw !== undefined) {
    return typeof raw === 'number' &&
      Number.isSafeInteger(raw) &&
      raw >= 0 &&
      raw <= LIBRARY_SEED_REVISION
      ? { revision: raw, wasRepaired: false }
      : { revision: LIBRARY_SEED_REVISION, wasRepaired: true };
  }
  const ids = new Set(devices.map((device) => device.libraryId));
  const hasOldSeed = [...ids].some((id) => PRE_PASSIVE_LIBRARY_IDS.has(id));
  const hasPassiveSeed = [...ids].some((id) => PASSIVE_LIBRARY_IDS.has(id));
  return {
    revision: hasOldSeed && !hasPassiveSeed ? 1 : LIBRARY_SEED_REVISION,
    wasRepaired: false,
  };
}

function appendMissingPassiveSeeds(devices: readonly LibraryDevice[]): LibraryDevice[] {
  const ids = new Set(devices.map((device) => device.libraryId));
  const additions = SEED_LIBRARY.filter(
    (device) => PASSIVE_LIBRARY_IDS.has(device.libraryId) && !ids.has(device.libraryId),
  );
  return [...devices, ...structuredClone(additions)];
}

function recoverLegacyLibrary(
  value: unknown,
): { catalog: LibraryCatalog; wasRepaired: boolean } | null {
  if (!isRecord(value) || value['version'] !== 1 || !Array.isArray(value['devices'])) return null;
  const recovered = recoverDevices(value['devices'], new Set());
  return {
    catalog: { devices: recovered.devices, assets: [] },
    wasRepaired: recovered.wasRepaired,
  };
}

function cleanSeedLoadState(): LibraryCatalogLoadState {
  return {
    catalog: seedCatalog(),
    needsUpgrade: false,
    needsRepair: false,
  };
}

function invalidSeedLoadState(): LibraryCatalogLoadState {
  return {
    catalog: seedCatalog(),
    needsUpgrade: false,
    needsRepair: true,
  };
}

function recoverDevices(
  candidates: readonly unknown[],
  availableHashes: ReadonlySet<string>,
): { devices: LibraryDevice[]; wasRepaired: boolean; wasMigrated: boolean } {
  if (candidates.length === 0) {
    return { devices: [], wasRepaired: false, wasMigrated: false };
  }
  const devices: LibraryDevice[] = [];
  const seenIds = new Set<string>();
  let wasRepaired = false;
  let wasMigrated = false;
  for (const candidate of candidates) {
    if (!isLibraryDevice(candidate) || seenIds.has(candidate.libraryId)) {
      wasRepaired = true;
      continue;
    }
    const device = structuredClone(candidate);
    const upgradedTemplate = upgradeBundledPhysicalTemplate(device);
    if (upgradedTemplate) {
      device.template = upgradedTemplate;
      wasMigrated = true;
    }
    const footprint = device.template.footprint;
    const artwork = footprint?.artwork;
    if (footprint && artwork && !availableHashes.has(artwork.assetHash)) {
      device.template = {
        ...device.template,
        footprint: { ...footprint, artwork: undefined },
      };
      wasRepaired = true;
    }
    devices.push(device);
    seenIds.add(device.libraryId);
  }
  if (devices.length === 0) {
    return { devices: cloneSeedLibrary(), wasRepaired: true, wasMigrated };
  }
  return { devices, wasRepaired, wasMigrated };
}

/** Upgrade only the former generic built-ins; already-physical user edits remain owned by the user. */
function upgradeBundledPhysicalTemplate(device: LibraryDevice): DeviceNodeData | null {
  if (device.template.footprint) return null;
  const current = SEED_LIBRARY.find(
    (candidate) =>
      candidate.libraryId === device.libraryId && candidate.template.footprint !== undefined,
  );
  const currentFootprint = current?.template.footprint;
  if (!current || !currentFootprint) return null;
  const oldPorts = new Map(device.template.ports.map((port) => [port.id, port]));
  const currentPortIds = new Set(current.template.ports.map((port) => port.id));
  const ports = [
    ...current.template.ports.map((seedPort) => ({
      ...structuredClone(seedPort),
      ...structuredClone(oldPorts.get(seedPort.id)),
      id: seedPort.id,
      hole: undefined,
    })),
    ...device.template.ports
      .filter((port) => !currentPortIds.has(port.id))
      .map((port) => ({ ...structuredClone(port), hole: undefined })),
  ];
  return {
    ...structuredClone(current.template),
    ...structuredClone(device.template),
    notes: device.template.notes ?? current.template.notes,
    boardId: undefined,
    placement: undefined,
    footprintId: currentFootprint.id,
    footprint: structuredClone(currentFootprint),
    footprintRotation: device.template.footprintRotation ?? current.template.footprintRotation ?? 0,
    footprintPitch: device.template.footprintPitch ?? current.template.footprintPitch ?? 20,
    ports,
  };
}

function recoverAsset(hash: string, value: unknown): RasterArtworkAsset | null {
  if (!/^[a-f0-9]{64}$/.test(hash) || !isRecord(value)) return null;
  const mimeType = value['mimeType'];
  const width = value['width'];
  const height = value['height'];
  const byteLength = value['byteLength'];
  const dataUrl = value['dataUrl'];
  if (
    !isRasterMimeType(mimeType) ||
    !isPositiveInteger(width) ||
    !isPositiveInteger(height) ||
    width > MAX_ARTWORK_OUTPUT_DIMENSION ||
    height > MAX_ARTWORK_OUTPUT_DIMENSION ||
    width * height > MAX_ARTWORK_OUTPUT_PIXELS ||
    !isPositiveInteger(byteLength) ||
    byteLength > MAX_ARTWORK_OUTPUT_BYTES ||
    typeof dataUrl !== 'string'
  ) {
    return null;
  }
  const asset = { hash, mimeType, width, height, byteLength, dataUrl };
  try {
    assertValidRasterArtworkAsset(asset);
    return asset;
  } catch {
    return null;
  }
}

function isLibraryDevice(value: unknown): value is LibraryDevice {
  return (
    isRecord(value) &&
    typeof value['libraryId'] === 'string' &&
    value['libraryId'].length > 0 &&
    isDeviceTemplate(value['template'])
  );
}

function isDeviceTemplate(value: unknown): value is DeviceNodeData {
  if (!isRecord(value) || value['type'] !== 'device') return false;
  if (
    typeof value['deviceId'] !== 'string' ||
    typeof value['manufacturer'] !== 'string' ||
    typeof value['model'] !== 'string' ||
    !Array.isArray(value['ports']) ||
    !value['ports'].every(isDevicePort)
  ) {
    return false;
  }
  const footprintId = value['footprintId'];
  const footprint = value['footprint'];
  if ((footprintId === undefined) !== (footprint === undefined)) return false;
  if (footprint !== undefined && (!isFootprint(footprint) || footprint.id !== footprintId)) {
    return false;
  }
  return (
    optionalString(value['category']) &&
    optionalString(value['location']) &&
    optionalString(value['notes']) &&
    (value['footprintRotation'] === undefined ||
      value['footprintRotation'] === 0 ||
      value['footprintRotation'] === 90 ||
      value['footprintRotation'] === 180 ||
      value['footprintRotation'] === 270) &&
    (value['footprintPitch'] === undefined || isPositiveFinite(value['footprintPitch']))
  );
}

function isFootprint(value: unknown): value is Footprint {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    value['id'].length === 0 ||
    typeof value['label'] !== 'string' ||
    !isBoundedInteger(value['rows'], 1, 64) ||
    !isBoundedInteger(value['cols'], 1, 64) ||
    !Array.isArray(value['pins']) ||
    !Array.isArray(value['shapes']) ||
    value['shapes'].length > 512
  ) {
    return false;
  }
  const rows = value['rows'];
  const cols = value['cols'];
  const pinIds = new Set<string>();
  const pinCells = new Set<string>();
  const pinPoints = new Set<string>();
  const rigid =
    value['physicalBounds'] !== undefined ||
    value['pins'].some((pin) => isRecord(pin) && pin['artworkPoint'] !== undefined);
  if (
    !value['pins'].every((pin) => {
      if (
        !isRecord(pin) ||
        typeof pin['id'] !== 'string' ||
        pin['id'].length === 0 ||
        pinIds.has(pin['id']) ||
        typeof pin['label'] !== 'string' ||
        !isFootprintCell(pin['cell'], rows, cols) ||
        (pin['artworkPoint'] !== undefined && !isFinitePoint(pin['artworkPoint'])) ||
        (pin['primary'] !== undefined && typeof pin['primary'] !== 'boolean') ||
        pinCells.has(cellKey(pin['cell']))
      ) {
        return false;
      }
      pinIds.add(pin['id']);
      pinCells.add(cellKey(pin['cell']));
      if (rigid) {
        const point = pin['artworkPoint'] ?? { x: pin['cell'].col, y: pin['cell'].row };
        const pointKey = `${point.x}:${point.y}`;
        if (pinPoints.has(pointKey)) return false;
        pinPoints.add(pointKey);
      }
      return true;
    }) ||
    !value['shapes'].every(isFootprintShape)
  ) {
    return false;
  }
  if (
    value['bodyCells'] !== undefined &&
    (!Array.isArray(value['bodyCells']) ||
      !value['bodyCells'].every((cell) => isFootprintCell(cell, rows, cols)))
  ) {
    return false;
  }
  if (
    value['axialSpan'] !== undefined &&
    (!isPositiveInteger(value['axialSpan']) ||
      !isCoherentAxialFootprint({
        rows,
        cols,
        pins: value['pins'] as Footprint['pins'],
        axialSpan: value['axialSpan'],
      }))
  ) {
    return false;
  }
  return (
    (value['artwork'] === undefined || isFootprintArtwork(value['artwork'])) &&
    (value['physicalBounds'] === undefined || isFootprintPhysicalBounds(value['physicalBounds']))
  );
}

function isFootprintPhysicalBounds(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isPositiveFinite(value['width']) &&
    isPositiveFinite(value['height'])
  );
}

function isFinitePoint(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isFiniteNumber(value['x']) && isFiniteNumber(value['y']);
}

function isFootprintArtwork(value: unknown): value is FootprintArtwork {
  return (
    isRecord(value) &&
    typeof value['assetHash'] === 'string' &&
    /^[a-f0-9]{64}$/.test(value['assetHash']) &&
    isFiniteNumber(value['x']) &&
    isFiniteNumber(value['y']) &&
    isPositiveFinite(value['width']) &&
    isPositiveFinite(value['height']) &&
    (value['preserveAspectRatio'] === undefined ||
      typeof value['preserveAspectRatio'] === 'boolean')
  );
}

function isFootprintCell(value: unknown, rows: number, cols: number): value is FootprintCell {
  return (
    isRecord(value) &&
    isBoundedInteger(value['row'], 0, rows - 1) &&
    isBoundedInteger(value['col'], 0, cols - 1)
  );
}

function isFootprintShape(value: unknown): boolean {
  if (!isRecord(value) || typeof value['kind'] !== 'string') return false;
  switch (value['kind']) {
    case 'rect':
      return (
        numericFields(value, ['x', 'y', 'width', 'height']) &&
        (value['width'] as number) > 0 &&
        (value['height'] as number) > 0 &&
        optionalNonNegativeFinite(value['rx']) &&
        optionalFootprintPaint(value['fill']) &&
        optionalFootprintPaint(value['stroke'])
      );
    case 'circle':
      return (
        numericFields(value, ['cx', 'cy', 'r']) &&
        (value['r'] as number) > 0 &&
        optionalFootprintPaint(value['fill']) &&
        optionalFootprintPaint(value['stroke'])
      );
    case 'line':
      return (
        numericFields(value, ['x1', 'y1', 'x2', 'y2']) &&
        optionalPositiveFinite(value['width']) &&
        optionalFootprintPaint(value['stroke'])
      );
    case 'text':
      return (
        numericFields(value, ['x', 'y']) &&
        typeof value['text'] === 'string' &&
        optionalPositiveFinite(value['size']) &&
        (value['anchor'] === undefined ||
          value['anchor'] === 'start' ||
          value['anchor'] === 'middle' ||
          value['anchor'] === 'end') &&
        optionalFootprintPaint(value['fill'])
      );
    default:
      return false;
  }
}

function isDevicePort(value: unknown): value is DevicePort {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].length > 0 &&
    typeof value['label'] === 'string' &&
    (value['direction'] === 'input' || value['direction'] === 'output') &&
    optionalString(value['connectorType'])
  );
}

export function referencedArtworkHashes(devices: readonly LibraryDevice[]): Set<string> {
  return new Set(
    devices.flatMap((device) => {
      const hash = device.template.footprint?.artwork?.assetHash;
      return hash ? [hash] : [];
    }),
  );
}

function numericFields(value: Record<string, unknown>, names: readonly string[]): boolean {
  return names.every((name) => isFiniteNumber(value[name]));
}

function isRasterMimeType(value: unknown): value is RasterArtworkMimeType {
  return value === 'image/png' || value === 'image/webp';
}

const FOOTPRINT_PAINTS = new Set([
  'none',
  'body',
  'body-alt',
  'accent',
  'lead',
  'silk',
  'polarity',
]);

function optionalFootprintPaint(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && FOOTPRINT_PAINTS.has(value));
}

function optionalPositiveFinite(value: unknown): boolean {
  return value === undefined || isPositiveFinite(value);
}

function optionalNonNegativeFinite(value: unknown): boolean {
  return value === undefined || (isFiniteNumber(value) && value >= 0);
}

const optionalString = (value: unknown): boolean =>
  value === undefined || typeof value === 'string';

function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFinite(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cellKey(cell: FootprintCell): string {
  return `${cell.row}:${cell.col}`;
}

const cloneSeedLibrary = (): LibraryDevice[] => structuredClone(SEED_LIBRARY);
const seedCatalog = (): LibraryCatalog => ({ devices: cloneSeedLibrary(), assets: [] });
