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
        /javascript:|data:text\/html|@import|expression\s*\(|behavior\s*:/i.test(value) ||
        (/url\s*\(/i.test(value) && !/^url\(\s*#[A-Za-z_][\w:.-]*\s*\)$/i.test(value))
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

function bytesToDataUrl(bytes: Uint8Array, mimeType: RasterArtworkMimeType): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
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
