import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryService } from './library.service';
import {
  LEGACY_LIBRARY_STORAGE_KEY,
  LIBRARY_STORAGE_KEY,
  LIBRARY_STORAGE_VERSION,
  loadLibraryCatalog,
  loadLibraryDevices,
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

  it('persists manual create, edit and remove operations in a versioned schema', () => {
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
    service.commitDraft(libraryId, custom);

    const serialized = storage.getItem(LIBRARY_STORAGE_KEY);
    if (!serialized) throw new Error('Expected a persisted library payload');
    expect(JSON.parse(serialized)).toMatchObject({ version: LIBRARY_STORAGE_VERSION });
    expect(createLibraryService().devices().at(-1)?.template.model).toBe('Componente de teste');

    service.beginEdit(libraryId);
    service.commitDraft(libraryId, { ...custom, model: 'Componente editado' });
    expect(createLibraryService().devices().at(-1)?.template.model).toBe('Componente editado');

    service.removeDevice(libraryId);
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

  it('restores current seeds while preserving custom components', () => {
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

    service.restoreDefaults();

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

  it('deduplicates artwork by hash and restores a physical custom component', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const service = createLibraryService();
    const hash = 'a'.repeat(64);
    const asset = {
      hash,
      mimeType: 'image/png' as const,
      width: 1,
      height: 1,
      byteLength: 1,
      dataUrl: 'data:image/png;base64,AA==',
    };
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
    expect(service.commitDraft(libraryId, template, [asset, structuredClone(asset)])).toBe(true);

    const restored = createLibraryService();
    expect(restored.devices().at(-1)?.template).toEqual(template);
    expect(restored.artworkAsset(hash)).toEqual(asset);
    const payload = JSON.parse(storage.getItem(LIBRARY_STORAGE_KEY) ?? '{}') as {
      assets: Record<string, unknown>;
    };
    expect(Object.keys(payload.assets)).toEqual([hash]);
  });

  it('reports localStorage quota failures instead of silently claiming persistence', () => {
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
      service.commitDraft(libraryId, {
        ...createBlankTemplate(),
        manufacturer: 'Talus',
        model: 'Sem espaço',
      }),
    ).toBe(false);
    expect(service.storageError()).toMatch(/sem espaço/);
    expect(service.editingDeviceId()).toBe(libraryId);
  });
});

function createLibraryService(): LibraryService {
  return TestBed.runInInjectionContext(() => new LibraryService());
}
