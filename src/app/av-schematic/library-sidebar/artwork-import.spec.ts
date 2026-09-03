import { describe, expect, it, vi } from 'vitest';
import {
  ArtworkImportError,
  MAX_ARTWORK_INPUT_BYTES,
  assertValidRasterArtworkAsset,
  importArtwork,
  sha256HexSync,
  type ArtworkDecoder,
  type ArtworkRasterizer,
} from './artwork-import';

describe('artwork import', () => {
  it('computes the standard SHA-256 digest used to validate persisted assets', () => {
    expect(sha256HexSync(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sha256HexSync(
        new TextEncoder().encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
      ),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('validates persisted Base64, signature, dimensions, byte length and SHA-256', () => {
    const asset = validStoredAsset();
    expect(() => {
      assertValidRasterArtworkAsset(asset);
    }).not.toThrow();
    expect(() => {
      assertValidRasterArtworkAsset({ ...asset, hash: '0'.repeat(64) });
    }).toThrow(/SHA-256/);
    expect(() => {
      assertValidRasterArtworkAsset({ ...asset, byteLength: asset.byteLength - 1 });
    }).toThrow(/tamanho/);
    expect(() => {
      assertValidRasterArtworkAsset({ ...asset, width: 2 });
    }).toThrow(/dimensões/);
    expect(() => {
      assertValidRasterArtworkAsset({
        ...asset,
        mimeType: 'image/webp',
        dataUrl: asset.dataUrl.replace('image/png', 'image/webp'),
      });
    }).toThrow(/assinatura/);
    expect(() => {
      assertValidRasterArtworkAsset({ ...asset, dataUrl: asset.dataUrl.replace('iVB', '%VB') });
    }).toThrow(/Base64/);
  });

  it('keeps a small PNG inert and addresses identical bytes with the same SHA-256', async () => {
    const file = new Blob([pngBytes(32, 20)], { type: 'image/png' });
    const decoder = vi.fn<ArtworkDecoder>(() => Promise.resolve({ width: 32, height: 20 }));

    const first = await importArtwork(file, undefined, decoder);
    const second = await importArtwork(file, undefined, decoder);

    expect(first).toMatchObject({ mimeType: 'image/png', width: 32, height: 20, byteLength: 24 });
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(first.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(decoder).toHaveBeenCalledTimes(2);
  });

  it('rejects a small raster that cannot actually be decoded', async () => {
    const decoder = vi.fn<ArtworkDecoder>(() =>
      Promise.reject(new ArtworkImportError('Não foi possível decodificar a imagem.')),
    );

    await expect(
      importArtwork(new Blob([pngBytes(32, 20)], { type: 'image/png' }), undefined, decoder),
    ).rejects.toThrow(/decodificar/);
  });

  it('accepts a safe SVG only after rasterizing it to inert output', async () => {
    const rasterizer = vi.fn<ArtworkRasterizer>(async (source, sourceSize, targetSize) => {
      expect(source.type).toBe('image/svg+xml');
      expect(await source.text()).toContain('<rect');
      expect(sourceSize).toEqual({ width: 64.5, height: 40.25 });
      expect(targetSize).toEqual({ width: 64, height: 40 });
      return {
        blob: new Blob([pngBytes(64, 40)], { type: 'image/png' }),
        mimeType: 'image/png',
        width: 64,
        height: 40,
      };
    });
    const svg = new Blob(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64.5 40.25"><defs><clipPath id="safe"><rect width="64.5" height="40.25"/></clipPath></defs><rect width="64.5" height="40.25" fill="#09f" clip-path="url(#safe)"/></svg>',
      ],
      { type: 'image/svg+xml' },
    );

    const asset = await importArtwork(svg, rasterizer);

    expect(rasterizer).toHaveBeenCalledOnce();
    expect(asset.mimeType).toBe('image/png');
    expect(asset.dataUrl).not.toContain('svg');
  });

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" onload="alert(1)"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.test/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" style="fill:url(https://example.test/a.svg)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="u\\72l(https://example.test/a.svg)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="url/**/(https://example.test/a.svg)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="javas&#x0a;cript:alert(1)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
  ])('rejects active or externally referenced SVG before rasterization', async (source) => {
    const rasterizer = vi.fn<ArtworkRasterizer>();

    await expect(
      importArtwork(new Blob([source], { type: 'image/svg+xml' }), rasterizer),
    ).rejects.toBeInstanceOf(ArtworkImportError);
    expect(rasterizer).not.toHaveBeenCalled();
  });

  it('rejects oversized bytes and excessive decoded dimensions before allocation', async () => {
    await expect(
      importArtwork(new Blob([new Uint8Array(MAX_ARTWORK_INPUT_BYTES + 1)], { type: 'image/png' })),
    ).rejects.toThrow(/5 MiB/);
    await expect(
      importArtwork(new Blob([pngBytes(8193, 1)], { type: 'image/png' })),
    ).rejects.toThrow(/8192 px/);
    await expect(
      importArtwork(new Blob([pngBytes(4097, 4097)], { type: 'image/png' })),
    ).rejects.toThrow(/16\.777\.216 pixels/);
  });

  it('trusts the binary signature instead of a spoofed MIME declaration', async () => {
    await expect(importArtwork(new Blob(['not a jpeg'], { type: 'image/jpeg' }))).rejects.toThrow(
      /PNG, JPEG, WebP ou SVG seguro/,
    );
    await expect(
      importArtwork(new Blob([new Uint8Array([0xff, 0xfe])], { type: 'image/svg+xml' })),
    ).rejects.toThrow(/PNG, JPEG, WebP ou SVG seguro/);
  });
});

function pngBytes(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(24));
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width, false);
  new DataView(bytes.buffer).setUint32(20, height, false);
  return bytes;
}

function validStoredAsset() {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return {
    hash: sha256HexSync(bytes),
    mimeType: 'image/png' as const,
    width: 1,
    height: 1,
    byteLength: bytes.byteLength,
    dataUrl: `data:image/png;base64,${base64}`,
  };
}
