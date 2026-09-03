import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resizeAxialFootprintSpan } from '../diagram/model/footprint';
import { sha256HexSync } from './artwork-import';
import { LibraryService } from './library.service';
import {
  LEGACY_LIBRARY_STORAGE_KEY,
  LIBRARY_STORAGE_KEY,
  LIBRARY_SEED_REVISION,
  LIBRARY_STORAGE_VERSION,
  MAX_LIBRARY_ASSETS,
  loadLibraryCatalog,
  loadLibraryDevices,
  persistLibraryCatalog,
  type PersistedLibraryV2,
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

    await service.beginEdit(libraryId);
    await service.commitDraft(libraryId, { ...custom, model: 'Componente editado' });
    expect(createLibraryService().devices().at(-1)?.template.model).toBe('Componente editado');

    await service.removeDevice(libraryId);
    expect(
      createLibraryService()
        .devices()
        .some((device) => device.libraryId === libraryId),
    ).toBe(false);
  });

  it('preserves an edited axial resistor span when the library is reopened', async () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const service = createLibraryService();
    const resistor = service.devices().find((device) => device.libraryId === 'lib-resistor-1k');
    if (!resistor?.template.footprint) throw new Error('Expected the physical resistor seed');
    const resized = resizeAxialFootprintSpan(resistor.template.footprint, 10);
    if (!resized.ok) throw new Error(resized.message);

    await service.beginEdit(resistor.libraryId);
    expect(
      await service.commitDraft(resistor.libraryId, {
        ...resistor.template,
        footprint: resized.footprint,
      }),
    ).toBe(true);

    const reopened = createLibraryService()
      .devices()
      .find((device) => device.libraryId === resistor.libraryId);
    expect(reopened?.template.footprint).toMatchObject({
      id: 'resistor-1k',
      axialSpan: 10,
      rows: 1,
      cols: 11,
      pins: [
        { id: 'a', cell: { row: 0, col: 0 } },
        { id: 'b', cell: { row: 0, col: 10 } },
      ],
    });
  });

  it('falls back to seeds without rewriting invalid JSON, unknown versions or unsafe shapes', () => {
    const storage = new MemoryStorage();

    storage.setItem(LIBRARY_STORAGE_KEY, '{broken');
    expect(loadLibraryDevices(storage)).toEqual(SEED_LIBRARY);
    expect(loadLibraryDevices(storage)).not.toBe(SEED_LIBRARY);
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ version: 99, devices: [] }));
    expect(loadLibraryDevices(storage)).toEqual(SEED_LIBRARY);
    expect(loadLibraryDevices(storage)).not.toBe(SEED_LIBRARY);
    const unsafe = JSON.stringify({
      version: LIBRARY_STORAGE_VERSION,
      seedRevision: LIBRARY_SEED_REVISION,
      devices: [{ libraryId: 'bad' }],
      assets: {},
    });
    storage.setItem(LIBRARY_STORAGE_KEY, unsafe);
    expect(loadLibraryDevices(storage)).toEqual(SEED_LIBRARY);
    expect(loadLibraryDevices(storage)).not.toBe(SEED_LIBRARY);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(unsafe);
  });

  it('reports repaired entries without rewriting the persisted payload during load', () => {
    const storage = new MemoryStorage();
    const valid = {
      libraryId: 'lib-custom-valid',
      template: {
        ...createBlankTemplate(),
        manufacturer: 'Talus',
        model: 'Sensor válido',
      },
    };
    const serialized = JSON.stringify({
      version: LIBRARY_STORAGE_VERSION,
      seedRevision: LIBRARY_SEED_REVISION,
      devices: [valid, { libraryId: 'broken', template: { type: 'nope' } }, valid],
      assets: {},
    });
    storage.setItem(LIBRARY_STORAGE_KEY, serialized);

    const loaded = loadLibraryCatalog(storage);

    expect(loaded.catalog.devices).toEqual([valid]);
    expect(loaded.needsRepair).toBe(true);
    expect(loaded.needsUpgrade).toBe(false);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(serialized);
  });

  it('repairs a catalog entry whose rigid pins share one physical marker', () => {
    const storage = new MemoryStorage();
    const invalid = {
      libraryId: 'lib-duplicate-marker',
      template: {
        ...createBlankTemplate(),
        manufacturer: 'Talus',
        model: 'Marcadores duplicados',
        ports: [
          { id: 'a', label: 'A', direction: 'input' as const },
          { id: 'b', label: 'B', direction: 'output' as const },
        ],
        footprintId: 'duplicate-marker',
        footprint: {
          id: 'duplicate-marker',
          label: 'Duplicate marker',
          rows: 1,
          cols: 2,
          pins: [
            {
              id: 'a',
              label: 'A',
              cell: { row: 0, col: 0 },
              artworkPoint: { x: 0, y: 0 },
            },
            {
              id: 'b',
              label: 'B',
              cell: { row: 0, col: 1 },
              artworkPoint: { x: 0, y: 0 },
            },
          ],
          shapes: [],
          physicalBounds: { x: -0.5, y: -0.5, width: 2, height: 1 },
        },
      },
    };
    const serialized = JSON.stringify({
      version: LIBRARY_STORAGE_VERSION,
      devices: [invalid],
      assets: {},
    });
    storage.setItem(LIBRARY_STORAGE_KEY, serialized);

    const loaded = loadLibraryCatalog(storage);

    expect(loaded.catalog.devices).toEqual(SEED_LIBRARY);
    expect(loaded.needsRepair).toBe(true);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(serialized);
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

    expect(loadLibraryCatalog(storage)).toEqual({
      catalog: { devices: [custom], assets: [] },
      needsUpgrade: true,
      needsRepair: false,
    });
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBeNull();
  });

  it('upgrades former generic module seeds without erasing matching local port edits', () => {
    const storage = new MemoryStorage();
    const oldNano = {
      libraryId: 'lib-arduino-nano',
      template: {
        ...createBlankTemplate(),
        manufacturer: 'Arduino',
        model: 'Nano local',
        ports: [
          { id: 'd9', label: 'D9 personalizado', direction: 'output' as const },
          { id: 'gnd', label: 'GND', direction: 'input' as const },
        ],
      },
    };
    const serialized = JSON.stringify({
      version: LIBRARY_STORAGE_VERSION,
      devices: [oldNano],
      assets: {},
    });
    storage.setItem(LIBRARY_STORAGE_KEY, serialized);

    const inspected = loadLibraryCatalog(storage);
    const nano = inspected.catalog.devices[0]?.template;

    expect(inspected.needsUpgrade).toBe(true);
    expect(inspected.needsRepair).toBe(false);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(serialized);
    expect(nano).toMatchObject({
      model: 'Nano local',
      footprintId: 'arduino-nano',
      footprint: { rows: 7, cols: 15 },
    });
    expect(nano?.ports).toHaveLength(30);
    expect(nano?.ports.find((port) => port.id === 'd9')?.label).toBe('D9 personalizado');
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(serialized);
  });

  it('adds the passive seed revision once to a catalog saved before issue 33', () => {
    const storage = new MemoryStorage();
    const passiveIds = new Set([
      'lib-buzzer-active-12mm',
      'lib-resistor-1k',
      'lib-resistor-1k8',
      'lib-capacitor-electrolytic-470uf',
      'lib-capacitor-ceramic-100nf',
    ]);
    const oldSeeds = SEED_LIBRARY.filter((device) => !passiveIds.has(device.libraryId));
    storage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({ version: LIBRARY_STORAGE_VERSION, devices: oldSeeds, assets: {} }),
    );

    const serialized = storage.getItem(LIBRARY_STORAGE_KEY);
    const loaded = loadLibraryCatalog(storage);
    expect(
      loaded.catalog.devices.filter((device) => passiveIds.has(device.libraryId)),
    ).toHaveLength(5);
    expect(
      loaded.catalog.devices
        .filter((device) => passiveIds.has(device.libraryId))
        .every((device) => device.template.footprint !== undefined),
    ).toBe(true);
    expect(loaded.needsUpgrade).toBe(true);
    expect(loaded.needsRepair).toBe(false);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(serialized);
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

  it('never hydrates a persisted asset whose bytes do not match its SHA-256 key', async () => {
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
    const serialized = JSON.stringify({
      version: LIBRARY_STORAGE_VERSION,
      devices: [device],
      assets: { [forgedHash]: persistedAsset },
    });
    storage.setItem(LIBRARY_STORAGE_KEY, serialized);
    vi.stubGlobal('localStorage', storage);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const service = createLibraryService();

    expect(service.artworkAsset(forgedHash)).toBeUndefined();
    expect(service.devices()[0]?.template.footprint?.artwork).toBeUndefined();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(serialized);
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

    expect(loaded.catalog.loadError).toMatch(/excede o limite de 128 imagens/);
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
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        sharedCatalogResponse({ version: 2, devices: [remoteDevice], assets: {} }, true),
      );
    vi.stubGlobal('fetch', fetchMock);

    const service = createLibraryService();
    await vi.waitFor(() => {
      expect(service.devices()).toEqual([remoteDevice]);
    });

    expect(JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}')).toMatchObject({
      devices: [remoteDevice],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('conditionally persists a deterministic seed migration before publishing it', async () => {
    const storage = new MemoryStorage();
    const local = {
      libraryId: 'lib-custom-local',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Cache local' },
    };
    expect(persistLibraryCatalog(storage, { devices: [local], assets: [] })).toEqual({ ok: true });
    const oldNano = oldGenericNano();
    const asset = artworkAsset();
    const unreferencedAsset = artworkAsset(3);
    const custom = physicalLibraryDevice('remote-custom', asset.hash);
    const { hash, ...persistedAsset } = asset;
    const { hash: unreferencedHash, ...persistedUnreferencedAsset } = unreferencedAsset;
    const remoteCatalog = {
      version: LIBRARY_STORAGE_VERSION,
      devices: [oldNano, custom],
      assets: {
        [hash]: persistedAsset,
        [unreferencedHash]: persistedUnreferencedAsset,
      },
    };
    const getResponse = sharedCatalogResponse(remoteCatalog, true);
    const getEtag = getResponse.headers.get('etag');
    const upgradedEtag = `"${'a'.repeat(64)}"`;
    const upgraded = deferred<Response>();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(getResponse)
      .mockReturnValueOnce(upgraded.promise);
    const before = storage.getItem(LIBRARY_STORAGE_KEY);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);

    const service = createLibraryService();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(service.devices()).toEqual([local]);
    expect(service.artworkAsset(hash)).toBeUndefined();
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(before);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'PUT',
      headers: { 'If-Match': getEtag },
    });
    const requestBody = fetchMock.mock.calls[1]?.[1]?.body;
    if (typeof requestBody !== 'string') throw new Error('Expected a migration request body');
    const upgradedCatalog = JSON.parse(requestBody) as PersistedLibraryV2;
    expect(upgradedCatalog.devices[0]?.template).toMatchObject({
      model: 'Nano local',
      footprintId: 'arduino-nano',
      footprint: { rows: 7, cols: 15 },
    });
    expect(upgradedCatalog.devices[0]?.template.ports.find((port) => port.id === 'd9')?.label).toBe(
      'D9 personalizado',
    );
    expect(
      upgradedCatalog.devices[0]?.template.ports.find((port) => port.id === 'sense-local'),
    ).toEqual({ id: 'sense-local', label: 'SENSE local', direction: 'input' });
    expect(upgradedCatalog.devices[1]).toEqual(custom);
    expect(upgradedCatalog.assets).toEqual({
      [hash]: persistedAsset,
      [unreferencedHash]: persistedUnreferencedAsset,
    });

    upgraded.resolve(new Response(null, { status: 200, headers: { ETag: upgradedEtag } }));
    await vi.waitFor(() => {
      expect(service.devices().map((device) => device.libraryId)).toEqual([
        oldNano.libraryId,
        custom.libraryId,
      ]);
    });

    expect(service.artworkAsset(hash)).toEqual(asset);
    expect(service.artworkAsset(unreferencedHash)).toEqual(unreferencedAsset);
    expect(JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}')).toEqual(upgradedCatalog);

    const currentFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(sharedCatalogResponse(upgradedCatalog, true));
    vi.stubGlobal('fetch', currentFetch);
    const reopened = createLibraryService();
    await reopened.beginEdit(oldNano.libraryId);

    expect(currentFetch).toHaveBeenCalledOnce();
    expect(reopened.devices()).toEqual(service.devices());
    expect(reopened.artworkAsset(hash)).toEqual(asset);
    expect(reopened.artworkAsset(unreferencedHash)).toEqual(unreferencedAsset);
  });

  it.each([
    ['ETag conflict', new Response('{}', { status: 412 }), /outro navegador/],
    [
      'server error',
      new Response(JSON.stringify({ message: 'Falha central' }), { status: 500 }),
      /Falha central/,
    ],
  ])(
    'does not publish or cache a migrated catalog after %s',
    async (_name, failedSave, expectedMessage) => {
      const storage = new MemoryStorage();
      const localAsset = artworkAsset(1);
      const local = physicalLibraryDevice('local', localAsset.hash);
      expect(
        persistLibraryCatalog(storage, {
          devices: [oldGenericNano(), local],
          assets: [localAsset],
        }),
      ).toEqual({ ok: true });
      const before = storage.getItem(LIBRARY_STORAGE_KEY);
      const remoteAsset = artworkAsset(2);
      const { hash: remoteHash, ...persistedRemoteAsset } = remoteAsset;
      const remoteCatalog = {
        version: LIBRARY_STORAGE_VERSION,
        devices: [oldGenericNano(), physicalLibraryDevice('remote', remoteHash)],
        assets: { [remoteHash]: persistedRemoteAsset },
      };
      const getResponse = sharedCatalogResponse(remoteCatalog, true);
      const getEtag = getResponse.headers.get('etag');
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(getResponse)
        .mockResolvedValueOnce(failedSave);
      vi.stubGlobal('localStorage', storage);
      vi.stubGlobal('fetch', fetchMock);

      const service = createLibraryService();
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });

      expect(service.devices().map((device) => device.libraryId)).toEqual([
        'lib-arduino-nano',
        local.libraryId,
      ]);
      expect(service.devices()[0]?.template.footprintId).toBe('arduino-nano');
      expect(service.artworkAsset(localAsset.hash)).toEqual(localAsset);
      expect(service.artworkAsset(remoteHash)).toBeUndefined();
      expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(before);
      expect(service.storageError()).toMatch(expectedMessage);
      expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
        method: 'PUT',
        headers: { 'If-Match': getEtag },
      });
    },
  );

  it('does not attempt to upgrade or publish a corrupt central catalog', async () => {
    const storage = new MemoryStorage();
    const local = {
      libraryId: 'lib-custom-local',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Cache local' },
    };
    expect(persistLibraryCatalog(storage, { devices: [local], assets: [] })).toEqual({ ok: true });
    const before = storage.getItem(LIBRARY_STORAGE_KEY);
    const corrupt = {
      version: LIBRARY_STORAGE_VERSION,
      devices: [oldGenericNano(), oldGenericNano()],
      assets: {},
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(sharedCatalogResponse(corrupt, true));
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);

    const service = createLibraryService();
    await vi.waitFor(() => {
      expect(service.storageError()).toMatch(/dados inválidos/);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(service.devices()).toEqual([local]);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(before);
  });

  it('does not initialize an empty central catalog from repaired local data', async () => {
    const storage = new MemoryStorage();
    const local = {
      libraryId: 'lib-custom-local',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Cache local' },
    };
    const serialized = JSON.stringify({
      version: LIBRARY_STORAGE_VERSION,
      devices: [local, local],
      assets: {},
    });
    storage.setItem(LIBRARY_STORAGE_KEY, serialized);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(sharedCatalogResponse({ version: 2, devices: [], assets: {} }, false));
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);

    const service = createLibraryService();
    await vi.waitFor(() => {
      expect(service.storageError()).toMatch(/precisou de reparos/);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(service.devices()).toEqual([local]);
    expect(storage.getItem(LIBRARY_STORAGE_KEY)).toBe(serialized);
  });

  it('waits for central hydration before opening an edit with the remote template', async () => {
    const storage = new MemoryStorage();
    const localDevice = {
      libraryId: 'lib-shared',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Cache antigo' },
    };
    const remoteDevice = {
      libraryId: 'lib-shared',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Versão remota' },
    };
    expect(persistLibraryCatalog(storage, { devices: [localDevice], assets: [] }).ok).toBe(true);
    const remote = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(remote.promise);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);
    const service = createLibraryService();

    const opening = service.beginEdit(localDevice.libraryId);
    expect(service.editingDeviceId()).toBeNull();

    remote.resolve(
      sharedCatalogResponse({ version: 2, devices: [remoteDevice], assets: {} }, true),
    );
    await opening;

    expect(service.editingDeviceId()).toBe(remoteDevice.libraryId);
    expect(service.editingDevice()?.template.model).toBe('Versão remota');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not open or save a local item deleted from the hydrated central catalog', async () => {
    const storage = new MemoryStorage();
    const deleted = {
      libraryId: 'lib-custom-deleted',
      template: { ...createBlankTemplate(), manufacturer: 'Talus', model: 'Excluído' },
    };
    expect(persistLibraryCatalog(storage, { devices: [deleted], assets: [] }).ok).toBe(true);
    const remote = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(remote.promise);
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('fetch', fetchMock);
    const service = createLibraryService();

    const opening = service.beginEdit(deleted.libraryId);
    remote.resolve(sharedCatalogResponse({ version: 2, devices: [], assets: {} }, true));
    await opening;

    expect(service.editingDeviceId()).toBeNull();
    expect(service.storageError()).toMatch(/não existe mais/);
    expect(await service.commitDraft(deleted.libraryId, deleted.template)).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
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

function oldGenericNano() {
  return {
    libraryId: 'lib-arduino-nano',
    template: {
      ...createBlankTemplate(),
      manufacturer: 'Arduino',
      model: 'Nano local',
      ports: [
        { id: 'd9', label: 'D9 personalizado', direction: 'output' as const },
        { id: 'gnd', label: 'GND', direction: 'input' as const },
        { id: 'sense-local', label: 'SENSE local', direction: 'input' as const },
      ],
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

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
