// Strict validation for the shared component library. This module deliberately
// uses only Node core APIs so the production server can load it without an
// Angular build or an additional runtime dependency.

import { createHash } from 'node:crypto';

export const LIBRARY_CATALOG_VERSION = 2;
export const MAX_LIBRARY_DEVICES = 4096;
export const MAX_LIBRARY_ASSETS = 128;
export const MAX_LIBRARY_ASSET_BYTES = 256 * 1024;
export const MAX_LIBRARY_DECODED_BYTES = 16 * 1024 * 1024;
export const MAX_LIBRARY_ASSET_DIMENSION = 1024;
export const MAX_LIBRARY_ASSET_PIXELS = 1024 * 1024;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PORT_DIRECTIONS = new Set(['input', 'output']);
const ROTATIONS = new Set([0, 90, 180, 270]);
const SHAPE_KINDS = new Set(['rect', 'circle', 'line', 'text']);
const FOOTPRINT_PAINTS = new Set([
  'none',
  'body',
  'body-alt',
  'accent',
  'lead',
  'silk',
  'polarity',
]);

export class LibraryCatalogValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LibraryCatalogValidationError';
  }
}

/** Validate untrusted JSON and return a detached, JSON-safe catalog. */
export function parseLibraryCatalog(raw) {
  rejectDangerousKeys(raw, 'library');
  const root = expectRecord(raw, 'library');
  if (root.version !== LIBRARY_CATALOG_VERSION) {
    fail(`library.version: expected ${LIBRARY_CATALOG_VERSION}`);
  }
  const seedRevision = root.seedRevision;
  if (seedRevision !== undefined && expectSafeInteger(seedRevision, 'library.seedRevision') < 0) {
    fail('library.seedRevision: expected a non-negative integer');
  }

  const devices = expectArray(root.devices, 'library.devices');
  if (devices.length > MAX_LIBRARY_DEVICES) {
    fail(`library.devices: accepts at most ${MAX_LIBRARY_DEVICES} entries`);
  }
  const assets = expectRecord(root.assets, 'library.assets');
  const assetEntries = Object.entries(assets);
  if (assetEntries.length > MAX_LIBRARY_ASSETS) {
    fail(`library.assets: accepts at most ${MAX_LIBRARY_ASSETS} entries`);
  }

  const seenDeviceIds = new Set();
  const referencedAssets = new Set();
  devices.forEach((device, index) => {
    validateLibraryDevice(device, `library.devices[${index}]`, seenDeviceIds, referencedAssets);
  });

  let decodedBytes = 0;
  const validatedAssets = {};
  for (const [hash, value] of assetEntries) {
    const asset = validateRasterAsset(hash, value, `library.assets.${hash}`);
    decodedBytes += asset.byteLength;
    if (decodedBytes > MAX_LIBRARY_DECODED_BYTES) {
      fail('library.assets: decoded bytes exceed 16 MiB');
    }
    validatedAssets[hash] = asset;
  }

  for (const hash of referencedAssets) {
    if (!Object.hasOwn(validatedAssets, hash)) {
      fail(`library.devices: referenced artwork ${JSON.stringify(hash)} is missing`);
    }
  }

  return {
    version: LIBRARY_CATALOG_VERSION,
    ...(seedRevision === undefined ? {} : { seedRevision }),
    devices: structuredClone(devices),
    assets: validatedAssets,
  };
}

function validateLibraryDevice(value, label, seenIds, referencedAssets) {
  const device = expectRecord(value, label);
  const libraryId = expectString(device.libraryId, `${label}.libraryId`, 256, false);
  if (seenIds.has(libraryId)) fail(`${label}.libraryId: duplicate ${JSON.stringify(libraryId)}`);
  seenIds.add(libraryId);

  const template = expectRecord(device.template, `${label}.template`);
  if (template.type !== 'device') fail(`${label}.template.type: expected "device"`);
  for (const key of ['deviceId', 'manufacturer', 'model']) {
    expectString(template[key], `${label}.template.${key}`, 16_384, true);
  }
  for (const key of ['category', 'location', 'notes', 'boardId']) {
    optionalString(template[key], `${label}.template.${key}`, 65_536);
  }
  if (template.visualPlane !== undefined) {
    expectSafeInteger(template.visualPlane, `${label}.template.visualPlane`);
  }

  const ports = expectArray(template.ports, `${label}.template.ports`);
  if (ports.length > 4096) fail(`${label}.template.ports: accepts at most 4096 entries`);
  const seenPorts = new Set();
  ports.forEach((port, index) => {
    const portLabel = `${label}.template.ports[${index}]`;
    const record = expectRecord(port, portLabel);
    const id = expectString(record.id, `${portLabel}.id`, 256, false);
    if (seenPorts.has(id)) fail(`${portLabel}.id: duplicate ${JSON.stringify(id)}`);
    seenPorts.add(id);
    expectString(record.label, `${portLabel}.label`, 16_384, true);
    if (!PORT_DIRECTIONS.has(record.direction)) {
      fail(`${portLabel}.direction: expected "input" or "output"`);
    }
    optionalString(record.connectorType, `${portLabel}.connectorType`, 16_384);
    optionalString(record.wirevizDesignator, `${portLabel}.wirevizDesignator`, 16_384);
    optionalString(record.wirevizLabel, `${portLabel}.wirevizLabel`, 16_384);
    if (record.hole !== undefined) validateCell(record.hole, `${portLabel}.hole`);
  });

  const footprintId = template.footprintId;
  const footprint = template.footprint;
  if ((footprintId === undefined) !== (footprint === undefined)) {
    fail(`${label}.template: footprintId and footprint must be declared together`);
  }
  if (footprint !== undefined) {
    const id = expectString(footprintId, `${label}.template.footprintId`, 256, false);
    validateFootprint(footprint, `${label}.template.footprint`, id, referencedAssets);
  }
  if (template.footprintRotation !== undefined && !ROTATIONS.has(template.footprintRotation)) {
    fail(`${label}.template.footprintRotation: expected 0, 90, 180 or 270`);
  }
  if (template.footprintPitch !== undefined) {
    expectPositiveFinite(template.footprintPitch, `${label}.template.footprintPitch`);
  }
}

function validateFootprint(value, label, footprintId, referencedAssets) {
  const footprint = expectRecord(value, label);
  if (expectString(footprint.id, `${label}.id`, 256, false) !== footprintId) {
    fail(`${label}.id: must match footprintId`);
  }
  expectString(footprint.label, `${label}.label`, 16_384, true);
  const rows = expectBoundedInteger(footprint.rows, `${label}.rows`, 1, 64);
  const cols = expectBoundedInteger(footprint.cols, `${label}.cols`, 1, 64);
  const pins = expectArray(footprint.pins, `${label}.pins`);
  const shapes = expectArray(footprint.shapes, `${label}.shapes`);
  if (pins.length > 4096 || shapes.length > 512) fail(`${label}: too many pins or shapes`);

  const pinIds = new Set();
  const pinCells = new Set();
  const pinPoints = new Set();
  const rigid =
    footprint.physicalBounds !== undefined ||
    pins.some(
      (pin) =>
        pin !== null &&
        typeof pin === 'object' &&
        !Array.isArray(pin) &&
        pin.artworkPoint !== undefined,
    );
  pins.forEach((pin, index) => {
    const pinLabel = `${label}.pins[${index}]`;
    const record = expectRecord(pin, pinLabel);
    const id = expectString(record.id, `${pinLabel}.id`, 256, false);
    if (pinIds.has(id)) fail(`${pinLabel}.id: duplicate ${JSON.stringify(id)}`);
    pinIds.add(id);
    expectString(record.label, `${pinLabel}.label`, 16_384, true);
    const cell = validateCell(record.cell, `${pinLabel}.cell`, rows, cols);
    let artworkPoint;
    if (record.artworkPoint !== undefined) {
      const point = expectRecord(record.artworkPoint, `${pinLabel}.artworkPoint`);
      expectFinite(point.x, `${pinLabel}.artworkPoint.x`);
      expectFinite(point.y, `${pinLabel}.artworkPoint.y`);
      artworkPoint = point;
    }
    const key = `${cell.row}:${cell.col}`;
    if (pinCells.has(key)) fail(`${pinLabel}.cell: another pin already occupies ${key}`);
    pinCells.add(key);
    if (rigid) {
      const point = artworkPoint ?? { x: cell.col, y: cell.row };
      const pointKey = `${point.x}:${point.y}`;
      if (pinPoints.has(pointKey)) {
        fail(`${pinLabel}.artworkPoint: another pin already occupies ${pointKey}`);
      }
      pinPoints.add(pointKey);
    }
    if (record.primary !== undefined && typeof record.primary !== 'boolean') {
      fail(`${pinLabel}.primary: expected boolean`);
    }
  });
  if (footprint.axialSpan !== undefined) {
    const span = expectBoundedInteger(footprint.axialSpan, `${label}.axialSpan`, 4, 10);
    if (
      rows !== 1 ||
      cols !== span + 1 ||
      pins.length !== 2 ||
      !pinCells.has('0:0') ||
      !pinCells.has(`0:${span}`)
    ) {
      fail(`${label}.axialSpan: expected one row and pins at both span endpoints`);
    }
  }
  shapes.forEach((shape, index) => validateShape(shape, `${label}.shapes[${index}]`));
  if (footprint.bodyCells !== undefined) {
    expectArray(footprint.bodyCells, `${label}.bodyCells`).forEach((cell, index) =>
      validateCell(cell, `${label}.bodyCells[${index}]`, rows, cols),
    );
  }
  if (footprint.artwork !== undefined) {
    const artwork = expectRecord(footprint.artwork, `${label}.artwork`);
    const hash = expectString(artwork.assetHash, `${label}.artwork.assetHash`, 64, false);
    if (!HASH_PATTERN.test(hash)) fail(`${label}.artwork.assetHash: invalid SHA-256`);
    for (const key of ['x', 'y']) expectFinite(artwork[key], `${label}.artwork.${key}`);
    for (const key of ['width', 'height']) {
      expectPositiveFinite(artwork[key], `${label}.artwork.${key}`);
    }
    if (
      artwork.preserveAspectRatio !== undefined &&
      typeof artwork.preserveAspectRatio !== 'boolean'
    ) {
      fail(`${label}.artwork.preserveAspectRatio: expected boolean`);
    }
    referencedAssets.add(hash);
  }
  if (footprint.physicalBounds !== undefined) {
    const bounds = expectRecord(footprint.physicalBounds, `${label}.physicalBounds`);
    for (const key of ['x', 'y']) expectFinite(bounds[key], `${label}.physicalBounds.${key}`);
    for (const key of ['width', 'height']) {
      expectPositiveFinite(bounds[key], `${label}.physicalBounds.${key}`);
    }
  }
}

function validateShape(value, label) {
  const shape = expectRecord(value, label);
  if (!SHAPE_KINDS.has(shape.kind)) fail(`${label}.kind: unknown footprint shape`);
  switch (shape.kind) {
    case 'rect':
      expectFinite(shape.x, `${label}.x`);
      expectFinite(shape.y, `${label}.y`);
      expectPositiveFinite(shape.width, `${label}.width`);
      expectPositiveFinite(shape.height, `${label}.height`);
      optionalNonNegativeFinite(shape.rx, `${label}.rx`);
      optionalPaint(shape.fill, `${label}.fill`);
      optionalPaint(shape.stroke, `${label}.stroke`);
      break;
    case 'circle':
      expectFinite(shape.cx, `${label}.cx`);
      expectFinite(shape.cy, `${label}.cy`);
      expectPositiveFinite(shape.r, `${label}.r`);
      optionalPaint(shape.fill, `${label}.fill`);
      optionalPaint(shape.stroke, `${label}.stroke`);
      break;
    case 'line':
      for (const key of ['x1', 'y1', 'x2', 'y2']) expectFinite(shape[key], `${label}.${key}`);
      if (shape.width !== undefined) expectPositiveFinite(shape.width, `${label}.width`);
      optionalPaint(shape.stroke, `${label}.stroke`);
      break;
    case 'text':
      expectFinite(shape.x, `${label}.x`);
      expectFinite(shape.y, `${label}.y`);
      expectString(shape.text, `${label}.text`, 16_384, true);
      if (shape.size !== undefined) expectPositiveFinite(shape.size, `${label}.size`);
      if (
        shape.anchor !== undefined &&
        shape.anchor !== 'start' &&
        shape.anchor !== 'middle' &&
        shape.anchor !== 'end'
      ) {
        fail(`${label}.anchor: invalid text anchor`);
      }
      optionalPaint(shape.fill, `${label}.fill`);
      break;
  }
}

function validateRasterAsset(hash, value, label) {
  if (!HASH_PATTERN.test(hash)) fail(`${label}: key must be a lowercase SHA-256`);
  const asset = expectRecord(value, label);
  const mimeType = asset.mimeType;
  if (mimeType !== 'image/png' && mimeType !== 'image/webp') {
    fail(`${label}.mimeType: only inert PNG or WebP assets are accepted`);
  }
  const width = expectBoundedInteger(asset.width, `${label}.width`, 1, MAX_LIBRARY_ASSET_DIMENSION);
  const height = expectBoundedInteger(
    asset.height,
    `${label}.height`,
    1,
    MAX_LIBRARY_ASSET_DIMENSION,
  );
  if (width * height > MAX_LIBRARY_ASSET_PIXELS) fail(`${label}: exceeds one megapixel`);
  const byteLength = expectBoundedInteger(
    asset.byteLength,
    `${label}.byteLength`,
    1,
    MAX_LIBRARY_ASSET_BYTES,
  );
  const dataUrl = expectString(
    asset.dataUrl,
    `${label}.dataUrl`,
    Math.ceil(MAX_LIBRARY_ASSET_BYTES / 3) * 4 + 64,
    false,
  );
  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix)) fail(`${label}.dataUrl: MIME prefix does not match`);
  const encoded = dataUrl.slice(prefix.length);
  if (encoded.length === 0 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    fail(`${label}.dataUrl: invalid Base64`);
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== byteLength || bytes.toString('base64') !== encoded) {
    fail(`${label}.dataUrl: byteLength or canonical Base64 mismatch`);
  }
  const detected = sniffRaster(bytes);
  if (!detected || detected.mimeType !== mimeType) fail(`${label}: binary signature mismatch`);
  if (detected.width !== width || detected.height !== height) {
    fail(`${label}: encoded dimensions mismatch`);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== hash) {
    fail(`${label}: SHA-256 mismatch`);
  }
  return { mimeType, width, height, byteLength, dataUrl };
}

/** Shared strict raster validator used by project resources as well as the catalog. */
export function parseRasterArtworkResource(hash, value, label = 'artwork') {
  return validateRasterAsset(hash, value, label);
}

function sniffRaster(bytes) {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    bytes.subarray(12, 16).toString('ascii') === 'IHDR'
  ) {
    return { mimeType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (
    bytes.length >= 30 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const dimensions = readWebpDimensions(bytes);
    return dimensions ? { mimeType: 'image/webp', ...dimensions } : null;
  }
  return null;
}

function readWebpDimensions(bytes) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = bytes.subarray(offset, offset + 4).toString('ascii');
    const length = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + length > bytes.length) return null;
    if (kind === 'VP8X' && length >= 10) {
      return {
        width: 1 + bytes.readUIntLE(data + 4, 3),
        height: 1 + bytes.readUIntLE(data + 7, 3),
      };
    }
    if (
      kind === 'VP8 ' &&
      length >= 10 &&
      bytes[data + 3] === 0x9d &&
      bytes[data + 4] === 0x01 &&
      bytes[data + 5] === 0x2a
    ) {
      return {
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    if (kind === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
      const bits = bytes.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset = data + length + (length % 2);
  }
  return null;
}

function validateCell(value, label, rows, cols) {
  const cell = expectRecord(value, label);
  const row = expectSafeInteger(cell.row, `${label}.row`);
  const col = expectSafeInteger(cell.col, `${label}.col`);
  if (rows !== undefined && (row < 0 || row >= rows || col < 0 || col >= cols)) {
    fail(`${label}: outside footprint bounds`);
  }
  return { row, col };
}

function rejectDangerousKeys(value, label, depth = 0) {
  if (depth > 64) fail(`${label}: nesting is too deep`);
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectDangerousKeys(entry, `${label}[${index}]`, depth + 1));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) fail(`${label}: dangerous key ${JSON.stringify(key)}`);
    rejectDangerousKeys(entry, `${label}.${key}`, depth + 1);
  }
}

function expectRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${label}: expected object`);
  }
  return value;
}

function expectArray(value, label) {
  if (!Array.isArray(value)) fail(`${label}: expected array`);
  return value;
}

function expectString(value, label, maxLength, allowEmpty) {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maxLength
  ) {
    fail(`${label}: invalid string`);
  }
  return value;
}

function optionalString(value, label, maxLength) {
  if (value !== undefined) expectString(value, label, maxLength, true);
}

function optionalPaint(value, label) {
  if (value !== undefined && !FOOTPRINT_PAINTS.has(value)) fail(`${label}: invalid paint role`);
}

function optionalNonNegativeFinite(value, label) {
  if (value !== undefined && expectFinite(value, label) < 0) {
    fail(`${label}: expected non-negative number`);
  }
}

function expectSafeInteger(value, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(`${label}: expected integer`);
  return value;
}

function expectBoundedInteger(value, label, min, max) {
  const parsed = expectSafeInteger(value, label);
  if (parsed < min || parsed > max) fail(`${label}: expected ${min}..${max}`);
  return parsed;
}

function expectFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`${label}: expected finite number`);
  return value;
}

function expectPositiveFinite(value, label) {
  const parsed = expectFinite(value, label);
  if (parsed <= 0) fail(`${label}: expected positive number`);
  return parsed;
}

function fail(message) {
  throw new LibraryCatalogValidationError(message);
}
