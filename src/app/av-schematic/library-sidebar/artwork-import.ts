import {
  type RasterArtworkAsset,
  type RasterArtworkMimeType,
} from '../diagram/artwork/artwork-asset.store';

export const MAX_ARTWORK_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_ARTWORK_INPUT_DIMENSION = 8192;
export const MAX_ARTWORK_INPUT_PIXELS = 16 * 1024 * 1024;
export const MAX_ARTWORK_OUTPUT_DIMENSION = 1024;
export const MAX_ARTWORK_OUTPUT_PIXELS = 1024 * 1024;
export const MAX_ARTWORK_OUTPUT_BYTES = 256 * 1024;

type ArtworkInputMimeType = RasterArtworkMimeType | 'image/jpeg' | 'image/svg+xml';

interface InspectedArtwork {
  blob: Blob;
  bytes: Uint8Array;
  mimeType: ArtworkInputMimeType;
  width: number;
  height: number;
}

export interface RasterizedArtwork {
  blob: Blob;
  mimeType: RasterArtworkMimeType;
  width: number;
  height: number;
}

export type ArtworkRasterizer = (
  source: Blob,
  sourceSize: { width: number; height: number },
  targetSize: { width: number; height: number },
) => Promise<RasterizedArtwork>;

export type ArtworkDecoder = (source: Blob) => Promise<{ width: number; height: number }>;

export class ArtworkImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtworkImportError';
  }
}

/** Validate, sanitize when needed, normalize and address an uploaded image. */
export async function importArtwork(
  file: Blob,
  rasterizer: ArtworkRasterizer = rasterizeInBrowser,
  decoder: ArtworkDecoder = decodeInBrowser,
): Promise<RasterArtworkAsset> {
  const inspected = await inspectArtwork(file);
  const targetSize = normalizedTargetSize(inspected.width, inspected.height);
  const mayKeepOriginal =
    (inspected.mimeType === 'image/png' || inspected.mimeType === 'image/webp') &&
    inspected.width <= MAX_ARTWORK_OUTPUT_DIMENSION &&
    inspected.height <= MAX_ARTWORK_OUTPUT_DIMENSION &&
    inspected.width * inspected.height <= MAX_ARTWORK_OUTPUT_PIXELS &&
    inspected.bytes.byteLength <= MAX_ARTWORK_OUTPUT_BYTES;

  let normalized: RasterizedArtwork;
  if (
    mayKeepOriginal &&
    (inspected.mimeType === 'image/png' || inspected.mimeType === 'image/webp')
  ) {
    const decoded = await decoder(inspected.blob);
    if (decoded.width !== inspected.width || decoded.height !== inspected.height) {
      throw new ArtworkImportError(
        'As dimensões decodificadas da imagem não correspondem ao arquivo.',
      );
    }
    normalized = {
      blob: new Blob([inspected.bytes.slice().buffer], { type: inspected.mimeType }),
      mimeType: inspected.mimeType,
      width: inspected.width,
      height: inspected.height,
    };
  } else {
    normalized = await rasterizer(
      inspected.blob,
      { width: inspected.width, height: inspected.height },
      targetSize,
    );
  }
  const bytes = new Uint8Array(await normalized.blob.arrayBuffer());

  assertNormalizedArtwork(normalized, bytes);
  const hash = await sha256Hex(bytes);
  return {
    hash,
    mimeType: normalized.mimeType,
    width: normalized.width,
    height: normalized.height,
    byteLength: bytes.byteLength,
    dataUrl: bytesToDataUrl(bytes, normalized.mimeType),
  };
}

async function inspectArtwork(file: Blob): Promise<InspectedArtwork> {
  if (file.size <= 0) {
    throw new ArtworkImportError('Selecione uma imagem que não esteja vazia.');
  }
  if (file.size > MAX_ARTWORK_INPUT_BYTES) {
    throw new ArtworkImportError('A imagem excede o limite de entrada de 5 MiB.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const rasterMime = sniffRasterMime(bytes);
  if (rasterMime) {
    const size = readRasterSize(bytes, rasterMime);
    assertInputSize(size);
    return {
      blob: new Blob([bytes], { type: rasterMime }),
      bytes,
      mimeType: rasterMime,
      ...size,
    };
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ArtworkImportError('Use uma imagem PNG, JPEG, WebP ou SVG seguro.');
  }
  if (file.type === 'image/svg+xml' || /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text)) {
    const svg = sanitizeSvg(text);
    assertInputSize(svg);
    return {
      blob: new Blob([svg.text], { type: 'image/svg+xml' }),
      bytes,
      mimeType: 'image/svg+xml',
      width: svg.width,
      height: svg.height,
    };
  }

  throw new ArtworkImportError('Use uma imagem PNG, JPEG, WebP ou SVG seguro.');
}

function sniffRasterMime(bytes: Uint8Array): Exclude<ArtworkInputMimeType, 'image/svg+xml'> | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function readRasterSize(
  bytes: Uint8Array,
  mimeType: Exclude<ArtworkInputMimeType, 'image/svg+xml'>,
): { width: number; height: number } {
  switch (mimeType) {
    case 'image/png':
      if (ascii(bytes, 12, 4) !== 'IHDR') {
        throw new ArtworkImportError('O arquivo PNG não possui um cabeçalho válido.');
      }
      return { width: readUint32Be(bytes, 16), height: readUint32Be(bytes, 20) };
    case 'image/jpeg':
      return readJpegSize(bytes);
    case 'image/webp':
      return readWebpSize(bytes);
  }
}

function readJpegSize(bytes: Uint8Array): { width: number; height: number } {
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const length = readUint16Be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrame.has(marker)) {
      if (length < 7) break;
      return {
        height: readUint16Be(bytes, offset + 3),
        width: readUint16Be(bytes, offset + 5),
      };
    }
    offset += length;
  }
  throw new ArtworkImportError('Não foi possível ler as dimensões do JPEG.');
}

function readWebpSize(bytes: Uint8Array): { width: number; height: number } {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunk = ascii(bytes, offset, 4);
    const length = readUint32Le(bytes, offset + 4);
    const data = offset + 8;
    if (data + length > bytes.length) break;
    if (chunk === 'VP8X' && length >= 10) {
      return {
        width: 1 + readUint24Le(bytes, data + 4),
        height: 1 + readUint24Le(bytes, data + 7),
      };
    }
    if (chunk === 'VP8 ' && length >= 10 && ascii(bytes, data + 3, 3) === '\u009d\u0001\u002a') {
      return {
        width: readUint16Le(bytes, data + 6) & 0x3fff,
        height: readUint16Le(bytes, data + 8) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
      const bits = readUint32Le(bytes, data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset = data + length + (length % 2);
  }
  throw new ArtworkImportError('Não foi possível ler as dimensões do WebP.');
}

function sanitizeSvg(source: string): { text: string; width: number; height: number } {
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new ArtworkImportError('O SVG contém declarações externas não permitidas.');
  }
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    throw new ArtworkImportError('Este navegador não consegue validar SVG com segurança.');
  }

  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') {
    throw new ArtworkImportError('O arquivo SVG é inválido.');
  }
  const allowedElements = new Set([
    'svg',
    'g',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polyline',
    'polygon',
    'text',
    'tspan',
    'defs',
    'lineargradient',
    'radialgradient',
    'stop',
    'clippath',
    'mask',
    'title',
    'desc',
  ]);
  const allowedAttributes = new Set([
    'aria-label',
    'class',
    'clip-path',
    'clip-rule',
    'cx',
    'cy',
    'd',
    'dominant-baseline',
    'fill',
    'fill-opacity',
    'fill-rule',
    'font-family',
    'font-size',
    'font-weight',
    'fx',
    'fy',
    'gradienttransform',
    'gradientunits',
    'height',
    'id',
    'mask',
    'offset',
    'opacity',
    'points',
    'preserveaspectratio',
    'r',
    'role',
    'rx',
    'ry',
    'spreadmethod',
    'stop-color',
    'stop-opacity',
    'stroke',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-opacity',
    'stroke-width',
    'text-anchor',
    'transform',
    'vector-effect',
    'version',
    'viewbox',
    'width',
    'x',
    'x1',
    'x2',
    'xmlns',
    'y',
    'y1',
    'y2',
  ]);
  for (const element of [document.documentElement, ...document.querySelectorAll('*')]) {
    if (!allowedElements.has(element.localName.toLowerCase())) {
      throw new ArtworkImportError(`O elemento <${element.localName}> não é permitido em SVG.`);
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        !allowedAttributes.has(name) ||
        name.startsWith('on') ||
        name === 'href' ||
        name.endsWith(':href') ||
        !isSafeSvgAttributeValue(name, value)
      ) {
        throw new ArtworkImportError(
          'O SVG contém scripts ou referências externas não permitidas.',
        );
      }
    }
  }

  const root = document.documentElement;
  const viewBox = root
    .getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const width =
    svgDimension(root.getAttribute('width')) ?? (viewBox?.length === 4 ? viewBox[2] : undefined);
  const height =
    svgDimension(root.getAttribute('height')) ?? (viewBox?.length === 4 ? viewBox[3] : undefined);
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new ArtworkImportError('Defina width/height ou viewBox válidos no SVG.');
  }
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  return { text: new XMLSerializer().serializeToString(root), width, height };
}

function isSafeSvgAttributeValue(name: string, value: string): boolean {
  if (name === 'xmlns') return value === 'http://www.w3.org/2000/svg';
  if (
    value.includes('\\') ||
    hasUnsafeControlCharacter(value) ||
    /\/\*|\*\//.test(value) ||
    /javascript\s*:|data\s*:|https?\s*:|@import|expression\s*\(|behavior\s*:/i.test(value)
  ) {
    return false;
  }
  if (name === 'clip-path' || name === 'mask') {
    return value === 'none' || /^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/i.test(value);
  }
  if (/url\s*\(/i.test(value)) {
    return /^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/i.test(value);
  }
  return true;
}

function hasUnsafeControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function svgDimension(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = /^([+]?(?:\d+\.?\d*|\.\d+))(?:px)?$/i.exec(value.trim());
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return parsed > 0 && Number.isFinite(parsed) ? parsed : undefined;
}

function assertInputSize(size: { width: number; height: number }): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new ArtworkImportError('A imagem não possui dimensões válidas.');
  }
  if (size.width > MAX_ARTWORK_INPUT_DIMENSION || size.height > MAX_ARTWORK_INPUT_DIMENSION) {
    throw new ArtworkImportError('A imagem excede o limite de 8192 px por dimensão.');
  }
  if (size.width * size.height > MAX_ARTWORK_INPUT_PIXELS) {
    throw new ArtworkImportError('A imagem excede o limite de 16.777.216 pixels.');
  }
}

function normalizedTargetSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(
    1,
    MAX_ARTWORK_OUTPUT_DIMENSION / width,
    MAX_ARTWORK_OUTPUT_DIMENSION / height,
    Math.sqrt(MAX_ARTWORK_OUTPUT_PIXELS / (width * height)),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

function assertNormalizedArtwork(normalized: RasterizedArtwork, bytes: Uint8Array): void {
  if (normalized.mimeType !== 'image/png' && normalized.mimeType !== 'image/webp') {
    throw new ArtworkImportError('A imagem normalizada precisa ser PNG ou WebP.');
  }
  if (sniffRasterMime(bytes) !== normalized.mimeType) {
    throw new ArtworkImportError('A assinatura da imagem normalizada não corresponde ao formato.');
  }
  const encodedSize = readRasterSize(bytes, normalized.mimeType);
  if (encodedSize.width !== normalized.width || encodedSize.height !== normalized.height) {
    throw new ArtworkImportError('As dimensões codificadas da imagem normalizada são inválidas.');
  }
  if (
    normalized.width <= 0 ||
    normalized.height <= 0 ||
    normalized.width > MAX_ARTWORK_OUTPUT_DIMENSION ||
    normalized.height > MAX_ARTWORK_OUTPUT_DIMENSION ||
    normalized.width * normalized.height > MAX_ARTWORK_OUTPUT_PIXELS
  ) {
    throw new ArtworkImportError('A imagem normalizada excede o limite de 1024 px ou 1 megapixel.');
  }
  if (bytes.byteLength > MAX_ARTWORK_OUTPUT_BYTES) {
    throw new ArtworkImportError('A imagem normalizada excede o limite de 256 KiB.');
  }
}

async function rasterizeInBrowser(
  source: Blob,
  _sourceSize: { width: number; height: number },
  targetSize: { width: number; height: number },
): Promise<RasterizedArtwork> {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new ArtworkImportError('Este navegador não oferece rasterização de imagens.');
  }
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    let width = targetSize.width;
    let height = targetSize.height;
    while (width >= 1 && height >= 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new ArtworkImportError('Não foi possível preparar a imagem para salvar.');
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of [0.9, 0.76, 0.62, 0.48]) {
        const blob = await canvasToBlob(canvas, 'image/webp', quality);
        if (blob.type === 'image/webp' && blob.size <= MAX_ARTWORK_OUTPUT_BYTES) {
          return { blob, mimeType: 'image/webp', width, height };
        }
      }
      const png = await canvasToBlob(canvas, 'image/png');
      if (png.type === 'image/png' && png.size <= MAX_ARTWORK_OUTPUT_BYTES) {
        return { blob: png, mimeType: 'image/png', width, height };
      }
      if (width === 1 || height === 1) break;
      width = Math.max(1, Math.floor(width * 0.8));
      height = Math.max(1, Math.floor(height * 0.8));
    }
    throw new ArtworkImportError('Não foi possível reduzir a imagem ao limite de 256 KiB.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeInBrowser(source: Blob): Promise<{ width: number; height: number }> {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(source);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      throw new ArtworkImportError('Não foi possível decodificar a imagem.');
    }
  }
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    throw new ArtworkImportError('Este navegador não oferece decodificação de imagens.');
  }
  const url = URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new ArtworkImportError('Não foi possível decodificar a imagem.'));
    };
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: RasterArtworkMimeType,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ArtworkImportError('Não foi possível codificar a imagem.'));
      },
      type,
      quality,
    );
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ArtworkImportError('Este navegador não oferece hash SHA-256 para salvar a imagem.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function assertValidRasterArtworkAsset(asset: RasterArtworkAsset): void {
  if (
    !/^[a-f0-9]{64}$/.test(asset.hash) ||
    (asset.mimeType !== 'image/png' && asset.mimeType !== 'image/webp') ||
    !Number.isInteger(asset.width) ||
    !Number.isInteger(asset.height) ||
    asset.width <= 0 ||
    asset.height <= 0 ||
    asset.width > MAX_ARTWORK_OUTPUT_DIMENSION ||
    asset.height > MAX_ARTWORK_OUTPUT_DIMENSION ||
    asset.width * asset.height > MAX_ARTWORK_OUTPUT_PIXELS ||
    !Number.isInteger(asset.byteLength) ||
    asset.byteLength <= 0 ||
    asset.byteLength > MAX_ARTWORK_OUTPUT_BYTES
  ) {
    throw new ArtworkImportError('Os metadados da imagem persistida são inválidos.');
  }
  const prefixLength = `data:${asset.mimeType};base64,`.length;
  const expectedDataUrlLength = prefixLength + Math.ceil(asset.byteLength / 3) * 4;
  if (asset.dataUrl.length !== expectedDataUrlLength) {
    throw new ArtworkImportError('O tamanho da imagem persistida não corresponde aos dados.');
  }
  const bytes = dataUrlToBytes(asset.dataUrl, asset.mimeType);
  if (bytes.byteLength !== asset.byteLength) {
    throw new ArtworkImportError('O tamanho da imagem persistida não corresponde aos dados.');
  }
  if (sniffRasterMime(bytes) !== asset.mimeType) {
    throw new ArtworkImportError('A assinatura da imagem persistida não corresponde ao formato.');
  }
  const size = readRasterSize(bytes, asset.mimeType);
  if (size.width !== asset.width || size.height !== asset.height) {
    throw new ArtworkImportError('As dimensões da imagem persistida não correspondem aos dados.');
  }
  if (sha256HexSync(bytes) !== asset.hash) {
    throw new ArtworkImportError('O hash SHA-256 da imagem persistida não corresponde aos dados.');
  }
}

export function dataUrlToBytes(
  dataUrl: string,
  mimeType: RasterArtworkMimeType,
): Uint8Array<ArrayBuffer> {
  const prefix = `data:${mimeType};base64,`;
  if (!dataUrl.startsWith(prefix)) {
    throw new ArtworkImportError('A data URL da imagem persistida não corresponde ao formato.');
  }
  const payload = dataUrl.slice(prefix.length);
  if (
    payload.length === 0 ||
    payload.length > Math.ceil(MAX_ARTWORK_OUTPUT_BYTES / 3) * 4 ||
    payload.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)
  ) {
    throw new ArtworkImportError('A data URL da imagem persistida não contém Base64 válido.');
  }
  let binary: string;
  try {
    binary = atob(payload);
  } catch {
    throw new ArtworkImportError('A data URL da imagem persistida não contém Base64 válido.');
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytesToBase64(bytes) !== payload) {
    throw new ArtworkImportError('A data URL da imagem persistida não usa Base64 canônico.');
  }
  return bytes;
}

export function sha256HexSync(bytes: Uint8Array): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const paddedLength = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(new ArrayBuffer(paddedLength));
  padded.set(bytes);
  padded[bytes.byteLength] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.byteLength * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15];
      const previous2 = words[index - 2];
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  return [...state].map((word) => word.toString(16).padStart(8, '0')).join('');
}

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: RasterArtworkMimeType): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length && offset + index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return value;
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}
