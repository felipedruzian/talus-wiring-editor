import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryService } from './library.service';
import {
  LIBRARY_STORAGE_KEY,
  LIBRARY_STORAGE_VERSION,
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
  });

  it('searches manufacturer, model, category and port labels', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const service = new LibraryService();

    service.searchQuery.set('Texas Instruments');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual(['lib-lm2596s']);
    service.searchQuery.set('motor-driver');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual(['lib-tb6612fng']);
    service.searchQuery.set('HALL_L');
    expect(service.filteredDevices().map((device) => device.libraryId)).toEqual([
      'lib-arduino-nano',
    ]);
  });

  it('persists manual create, edit and remove operations in a versioned schema', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const service = new LibraryService();
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
    expect(new LibraryService().devices().at(-1)?.template.model).toBe('Componente de teste');

    service.beginEdit(libraryId);
    service.commitDraft(libraryId, { ...custom, model: 'Componente editado' });
    expect(new LibraryService().devices().at(-1)?.template.model).toBe('Componente editado');

    service.removeDevice(libraryId);
    expect(new LibraryService().devices().some((device) => device.libraryId === libraryId)).toBe(
      false,
    );
  });

  it('falls back to the seed catalog for invalid JSON, unknown versions or unsafe shapes', () => {
    const storage = new MemoryStorage();

    storage.setItem(LIBRARY_STORAGE_KEY, '{broken');
    expect(loadLibraryDevices(storage)).toBe(SEED_LIBRARY);
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({ version: 99, devices: [] }));
    expect(loadLibraryDevices(storage)).toBe(SEED_LIBRARY);
    storage.setItem(
      LIBRARY_STORAGE_KEY,
      JSON.stringify({ version: LIBRARY_STORAGE_VERSION, devices: [{ libraryId: 'bad' }] }),
    );
    expect(loadLibraryDevices(storage)).toBe(SEED_LIBRARY);
  });
});
