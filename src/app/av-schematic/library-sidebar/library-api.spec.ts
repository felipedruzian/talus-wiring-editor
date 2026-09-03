import { describe, expect, it, vi } from 'vitest';
import { sha256HexSync } from './artwork-import';
import { loadSharedLibrary, saveSharedLibrary } from './library-api';
import { type PersistedLibraryV2 } from './library-storage';

const catalog: PersistedLibraryV2 = { version: 2, devices: [], assets: {} };

function responseFor(value: unknown, headers: Record<string, string> = {}): Response {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  const etag = `"${sha256HexSync(new TextEncoder().encode(body))}"`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', ETag: etag, ...headers },
  });
}

describe('shared library API client', () => {
  it('loads a validated catalog and verifies the exact response ETag', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responseFor(catalog, { 'X-Wiring-Library-Initialized': '1' }));

    const result = await loadSharedLibrary(fetcher);

    expect(result).toMatchObject({ kind: 'loaded', initialized: true, catalog: { devices: [] } });
    expect(fetcher).toHaveBeenCalledWith('/api/library', { method: 'GET' });
  });

  it('treats the old SPA fallback and a missing route as unavailable', async () => {
    const html = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
      );
    expect(await loadSharedLibrary(html)).toEqual({ kind: 'unavailable' });

    const missing = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    expect(await loadSharedLibrary(missing)).toEqual({ kind: 'unavailable' });
  });

  it('rejects a mismatched ETag, invalid catalog and network failure', async () => {
    const mismatch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(responseFor(catalog, { ETag: `"${'0'.repeat(64)}"` }));
    expect(await loadSharedLibrary(mismatch)).toMatchObject({ kind: 'error' });

    const invalid = vi.fn<typeof fetch>().mockResolvedValue(responseFor({ version: 99 }));
    expect(await loadSharedLibrary(invalid)).toMatchObject({ kind: 'error' });

    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    expect(await loadSharedLibrary(offline)).toEqual({ kind: 'unavailable' });
  });

  it('uses If-Match once, exposes conflicts and does not retry', async () => {
    const conflict = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 412 }));

    const result = await saveSharedLibrary(catalog, `"${'1'.repeat(64)}"`, conflict);

    expect(result).toMatchObject({ kind: 'conflict' });
    expect(conflict).toHaveBeenCalledTimes(1);
    expect(conflict.mock.calls[0]?.[0]).toBe('/api/library');
    expect(conflict.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      headers: { 'If-Match': `"${'1'.repeat(64)}"` },
    });
  });

  it('requires a strong confirmation ETag after save', async () => {
    const accepted = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 200, headers: { ETag: `"${'a'.repeat(64)}"` } }),
      );
    expect(await saveSharedLibrary(catalog, `"${'1'.repeat(64)}"`, accepted)).toEqual({
      kind: 'saved',
      etag: `"${'a'.repeat(64)}"`,
    });

    const missing = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    expect(await saveSharedLibrary(catalog, `"${'1'.repeat(64)}"`, missing)).toMatchObject({
      kind: 'error',
    });
  });
});
