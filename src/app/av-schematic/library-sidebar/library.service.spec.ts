import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256HexSync } from './artwork-import';
import { LibraryService } from './library.service';
import {
  LEGACY_LIBRARY_STORAGE_KEY,
  LIBRARY_STORAGE_KEY,
  LIBRARY_STORAGE_VERSION,
  MAX_LIBRARY_ASSETS,
  loadLibraryCatalog,
  loadLibraryDevices,
  persistLibraryCatalog,
} from './library-storage';
import { createBlankTemplate, SEED_LIBRARY } from './seed-library';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('LibraryService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('searches manufacturer, model, category and port labels', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const service = createLibraryService();

    service.searchQuery.set('Texas Instruments');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual(['lib-lm2596s']);
    service.searchQuery.set('motor-driver');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual(['lib-tb6612fng']);
    service.searchQuery.set('Drivers de motor');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual(['lib-tb6612fng']);
    service.searchQuery.set('HALL_L');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual([
      'lib-arduino-nano',
    ]);
    service.searchQuery.set('provisorio');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual([
      'lib-hall-a3144-lm393',
    ]);
    service.searchQuery.set('serigrafia');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual([
      'lib-hall-a3144-lm393',
    ]);
  });

  it('treats a query containing only combining marks as empty', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const service = createLibraryService();

    service.searchQuery.set('\u0301');

    expect(service.filteredDevices()).toEqual(SEED_LIBRARY);
  });

  it('persists manual create, edit and remove operations in a versioned schema', async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const service = createLibraryService();
    const custom = {
      ...createBlankTemplate(),
      manufacturer: 'Talus',
      model: 'Componente de teste',
      category: 'sensor',
      ports: [
        { id: 'signal', label: 'SIGNAL', direction: 'output' as const, connectorType: 'GPIO' },
      ],
    };

    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected a generated library id');
    await service.commitDraft(libraryId, custom);

    const serialized = storage.getItem(LIBRARY_STORAGE_KEY);
    if (!serialized) throw new Error('Expected a persisted library payload');
    expect(JSON.parse(serialized)).toMatchObject({ version: LIBRARY_STORAGE_VERSION });
    expect(createLibraryService().devices().at(-1)?.template.model).toBe('Componente de teste');

    service.beginEdit(libraryId);
    await service.commitDraft(libraryId, { ...custom, model: 'Componente editado' });
    expect(createLibraryService().devices().at(-1)?.template.model).toBe('Componente editado');

    await service.removeDevice(libraryId);
    expect(
      createLibraryService()
        .devices()
        .some((device) => device.libraryId === libraryId),
    ).toBe(false);
  });

  it('falls back to the seed catalog for invalid JSON, unknown versions or unsafe shapes', () => {
    const storage = new MemoryStorage();

    storage.setItem(LIBRARY_STORAGE_KEY, '{broken');
    expect(loadLibraryDevices(storage)).toEqual(SEED_LIBRARY);
    expect(loadLibraryDevices(storage)).not.toBe(SEED_LIBRARY);
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ version: 99, devices: [] }));
    expect(loadLibraryDevices(storage)).toEqual(SEED_LIBRARY);
    expect(loadLibraryDevices(storage)).not.toBe(SEED_LIBRARY);
    storage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({
        version: LIBRARY_STORAGE_VERSION,
        devices: [{ libraryId: 'bad' }],
        assets: {},
      }),
    );
    expect(loadLibraryDevices(storage)).toEqual(SEED_LIBRARY);
    expect(loadLibraryDevices(storage)).not.toBe(SEED_LIBRARY);
    expect(JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}')).toEqual({
      version: LIBRARY_STORAGE_VERSION,
      devices: SEED_LIBRARY,
      assets: {},
    });
  });

  it('salvages valid v1 entries individually and repairs the persisted payload', () => {
    const storage = new MemoryStorage();
    const valid = {
      libraryId: 'lib-custom-valid',
      template: {
        ...createBlankTemplate(),
        manufacturer: 'Talus',
        model: 'Sensor válido',
      },
    };
    storage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({
        version: LIBRARY_STORAGE_VERSION,
        devices: [valid, { libraryId: 'broken', template: { type: 'nope' } }, valid],
        assets: {},
      }),
    );

    expect(loadLibraryDevices(storage)).toEqual([valid]);
    expect(JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}')).toEqual({
      version: LIBRARY_STORAGE_VERSION,
      devices: [valid],
      assets: {},
    });
  });

  it('preserves an intentionally empty persisted catalog', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({ version: LIBRARY_STORAGE_VERSION, devices: [], assets: {} }),
    );

    expect(loadLibraryDevices(storage)).toEqual([]);
  });

  it('restores current seeds while preserving custom components', async () => {
    const storage = new MemoryStorage();
    const custom = {
      libraryId: 'lib-custom-kept',
      template: {
        ...createBlankTemplate(),
        manufacturer: 'Talus',
        model: 'Personalizado',
      },
    };
    const overriddenSeed = {
      ...SEED_LIBRARY[0],
      template: { ...SEED_LIBRARY[0].template, model: 'Override local' },
    };
    const legacy = {
      libraryId: 'lib-legacy-camera',
      template: {
        ...createBlankTemplate(),
        manufacturer: 'Legado',
        model: 'Câmera antiga',
      },
    };
    storage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({
        version: LIBRARY_STORAGE_VERSION,
        devices: [overriddenSeed, custom, legacy],
        assets: {},
      }),
    );
    vi.stubGlobal('localStorage', storage);
    const service = createLibraryService();

    await service.restoreDefaults();

    expect(service.devices()).toEqual([...SEED_LIBRARY, custom]);
    expect(service.devices().some((device) => device.libraryId === legacy.libraryId)).toBe(false);
    expect(service.devices()).not.toBe(SEED_LIBRARY);
    expect(createLibraryService().devices()).toEqual([...SEED_LIBRARY, custom]);
  });

  it('migrates a legacy v1 device catalog to v2 without losing custom entries', () => {
    const storage = new MemoryStorage();
    const custom = {
      libraryId: 'lib-custom-legacy',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Legado' },
    };
    storage.setItem(LEGACY_LIBRARY_STORAGE_KEY, JSON.stringify({ version: 1, devices: [custom] }));

    expect(loadLibraryCatalog(storage)).toEqual({ devices: [custom], assets: [] });
    expect(JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}')).toEqual({
      version: LIBRARY_STORAGE_VERSION,
      devices: [custom],
      assets: {},
    });
  });

  it('deduplicates artwork by hash and restores a physical custom component', async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const service = createLibraryService();
    const asset = artworkAsset();
    const hash = asset.hash;
    const footprint = {
      id: 'custom-physical',
      label: 'Sensor físico',
      rows: 1,
      cols: 2,
      pins: [{ id: 'signal', label: 'Sinal', cell: { row: 0, col: 0 } }],
      shapes: [],
      artwork: { assetHash: hash, x: -0.5, y: -0.25, width: 2.5, height: 1.5 },
    };
    const template = {
      ...createBlankTemplate(),
      manufacturer: 'Talus',
      model: 'Sensor físico',
      footprintId: footprint.id,
      footprint,
      footprintRotation: 0 as const,
      footprintPitch: 20,
      ports: [{ id: 'signal', label: 'Sinal', direction: 'output' as const }],
    };

    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected library id');
    expect(await service.commitDraft(libraryId, template, [asset, structuredClone(asset)])).toBe(
      true,
    );

    const restored = createLibraryService();
    expect(restored.devices().at(-1)?.template).toEqual(template);
    expect(restored.artworkAsset(hash)).toEqual(asset);
    const payload = JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}') as {
      assets: Record<string, unknown>;
    };
    expect(Object.keys(payload.assets)).toEqual([hash]);
  });

  it('never hydrates a persisted asset whose bytes do not match its SHA-256 key', () => {
    const storage = new MemoryStorage();
    const asset = artworkAsset();
    const forgedHash = '0'.repeat(64);
    const device = physicalLibraryDevice('forged', forgedHash);
    const persistedAsset = {
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      byteLength: asset.byteLength,
      dataUrl: asset.dataUrl,
    };
    storage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({
        version: LIBRARY_STORAGE_VERSION,
        devices: [device],
        assets: { [forgedHash]: persistedAsset },
      }),
    );
    vi.stubGlobal('localStorage', storage);

    const service = createLibraryService();

    expect(service.artworkAsset(forgedHash)).toBeUndefined();
    expect(service.devices()[0]?.template.footprint?.artwork).toBeUndefined();
    const repaired = JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}') as {
      assets: Record<string, unknown>;
    };
    expect(repaired.assets).toEqual({});
  });

  it('rejects a 129th referenced asset without mutating memory or storage', async () => {
    const storage = new MemoryStorage();
    const assets = Array.from({ length: MAX_LIBRARY_ASSETS }, (_, index) => artworkAsset(index));
    const devices = assets.map((asset, index) =>
      physicalLibraryDevice(`existing-${index}`, asset.hash),
    );
    expect(persistLibraryCatalog(storage, { devices, assets })).toEqual({ ok: true });
    const before = storage.getItem(LIBRARY_STORAGE_KEY);
    vi.stubGlobal('localStorage', storage);
    const service = createLibraryService();
    const nextAsset = artworkAsset(MAX_LIBRARY_ASSETS);
    const next = physicalLibraryDevice('next', nextAsset.hash);
    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected library id');

    expect(await service.commitDraft(libraryId, next.template, [nextAsset])).toBe(false);
    expect(service.devices()).toHaveLength(MAX_LIBRARY_ASSETS);
    expect(service.storageError()).toMatch(/no máximo 128 imagens/);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(before);
  });

  it('does not truncate or rewrite an over-limit persisted asset catalog', () => {
    const storage = new MemoryStorage();
    const assets = Object.fromEntries(
      Array.from({ length: MAX_LIBRARY_ASSETS + 1 }, (_, index) => [
        index.toString(16).padStart(64, '0'),
        {},
      ]),
    );
    const serialized = JSON.stringify({ version: LIBRARY_STORAGE_VERSION, devices: [], assets });
    storage.setItem(LIBRARY_STORAGE_KEY, serialized);

    const loaded = loadLibraryCatalog(storage);

    expect(loaded.loadError).toMatch(/excede o limite de 128 imagens/);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(serialized);
  });

  it('reports localStorage quota failures instead of silently claiming persistence', async () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    vi.stubGlobal('localStorage', storage);
    const service = createLibraryService();
    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected library id');

    expect(
      await service.commitDraft(libraryId, {
        ...createBlankTemplate(),
        manufacturer: 'Talus',
        model: 'Sem espaço',
      }),
    ).toBe(false);
    expect(service.storageError()).toMatch(/sem espaço/);
    expect(service.editingDeviceId()).toBe(libraryId);
  });

  it('hydrates the shared catalog when the central service is available', async () => {
    const storage = new MemoryStorage();
    const remoteDevice = {
      libraryId: 'lib-shared',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Compartilhado' },
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          sharedCatalogResponse({ version: 2, devices: [remoteDevice], assets: {} }, true),
        ),
    );

    const service = createLibraryService();
    await vi.waitFor(() => {
      expect(service.devices()).toEqual([remoteDevice]);
    });

    expect(JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}')).toMatchObject({
      devices: [remoteDevice],
    });
  });

  it('bootstraps an absent central catalog from the local v1 migration', async () => {
    const storage = new MemoryStorage();
    const legacy = {
      libraryId: 'lib-custom-legacy-central',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Legado central' },
    };
    storage.setItem(LEGACY_LIBRARY_STORAGE_KEY, JSON.stringify({ version: 1, devices: [legacy] }));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sharedCatalogResponse({ version: 2, devices: [], assets: {} }, false))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { ETag: `"${'a'.repeat(64)}"` },
        }),
      );
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);

    createLibraryService();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const request = fetchMock.mock.calls[1]?.[1];
    if (typeof request?.body !== 'string') throw new Error('Expected a JSON request body');
    expect(JSON.parse(request.body)).toMatchObject({ devices: [legacy] });
  });

  it('surfaces a central ETag conflict without mutating the visible or local catalog', async () => {
    const storage = new MemoryStorage();
    const remoteDevice = {
      libraryId: 'lib-shared',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Compartilhado' },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        sharedCatalogResponse({ version: 2, devices: [remoteDevice], assets: {} }, true),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 412 }));
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);
    const service = createLibraryService();
    await vi.waitFor(() => {
      expect(service.devices()).toEqual([remoteDevice]);
    });
    const before = storage.getItem(LIBRARY_STORAGE_KEY);

    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected library id');
    const saved = await service.commitDraft(libraryId, {
      ...createBlankTemplate(),
      manufacturer: 'Talus',
      model: 'Concorrente',
    });

    expect(saved).toBe(false);
    expect(service.devices()).toEqual([remoteDevice]);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(before);
    expect(service.storageError()).toMatch(/outro navegador/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function createLibraryService(): LibraryService {
  return TestBed.runInInjectionContext(() => new LibraryService());
}

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function artworkAsset(unique = -1) {
  const base = Uint8Array.from(atob(PNG_1X1_BASE64), (character) => character.charCodeAt(0));
  const bytes = unique < 0 ? base : new Uint8Array([...base, unique >> 8, unique & 0xff]);
  const hash = sha256HexSync(bytes);
  return {
    hash,
    mimeType: 'image/png' as const,
    width: 1,
    height: 1,
    byteLength: bytes.byteLength,
    dataUrl: `data:image/png;base64,${bytesToBase64(bytes)}`,
  };
}

function physicalLibraryDevice(libraryId: string, assetHash: string) {
  const footprint = {
    id: `footprint-${libraryId}`,
    label: libraryId,
    rows: 1,
    cols: 1,
    pins: [{ id: 'signal', label: 'Sinal', cell: { row: 0, col: 0 } }],
    shapes: [],
    artwork: { assetHash, x: 0, y: 0, width: 1, height: 1 },
  };
  return {
    libraryId: `lib-custom-${libraryId}`,
    template: {
      ...createBlankTemplate(),
      model: libraryId,
      footprintId: footprint.id,
      footprint,
      ports: [{ id: 'signal', label: 'Sinal', direction: 'input' as const }],
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function sharedCatalogResponse(value: unknown, initialized: boolean): Response {
  const body = JSON.stringify(value);
  const etag = `"${sha256HexSync(new TextEncoder().encode(body))}"`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      ETag: etag,
      'X-Wiring-Library-Initialized': initialized ? '1' : '0',
    },
  });
}
