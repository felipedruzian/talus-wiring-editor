import { describe, expect, it, vi } from 'vitest';
import {
  ArtworkImportError,
  MAX_ARTWORK_INPUT_BYTES,
  importArtwork,
  type ArtworkRasterizer,
} from './artwork-import';

describe('artwork import', () => {
  it('keeps a small PNG inert and addresses identical bytes with the same SHA-256', async () => {
    const file = new Blob([pngBytes(32, 20)], { type: 'image/png' });

    const first = await importArtwork(file);
    const second = await importArtwork(file);

    expect(first).toMatchObject({ mimeType: 'image/png', width: 32, height: 20, byteLength: 24 });
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(first.dataUrl).toMatch(/^data:image\/png;base64,/);
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
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64.5 40.25"><rect width="64.5" height="40.25" fill="#09f"/></svg>',
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
