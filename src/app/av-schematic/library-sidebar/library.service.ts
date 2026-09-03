import { computed, inject, Injectable, signal } from '@angular/core';
import { ArtworkAssetStore, type RasterArtworkAsset } from '../diagram/artwork/artwork-asset.store';
import { type DeviceNodeData } from '../diagram/model/interfaces';
import {
  browserLocalStorage,
  loadLibraryCatalog,
  persistLibraryCatalog,
  referencedArtworkHashes,
} from './library-storage';
import { matchesLibrarySearch } from './library-search';
import { SEED_LIBRARY, type LibraryDevice } from './seed-library';

type LibraryEditMode = 'create' | 'edit';

/** Page-scoped state for the device-library palette: list, expand/collapse, edit-mode lifecycle, and debounced search. */
@Injectable()
export class LibraryService {
  private readonly artworkStore = inject(ArtworkAssetStore);
  private readonly storage = browserLocalStorage();
  private readonly initialCatalog = loadLibraryCatalog(this.storage);

  readonly devices = signal<LibraryDevice[]>(this.initialCatalog.devices);
  readonly isExpanded = signal(false);
  readonly editingDeviceId = signal<string | null>(null);
  readonly editingMode = signal<LibraryEditMode | null>(null);
  readonly searchQuery = signal('');
  readonly storageError = signal<string | null>(null);
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.artworkStore.replace(this.initialCatalog.assets);
  }

  readonly editingDevice = computed<LibraryDevice | null>(() => {
    const id = this.editingDeviceId();
    if (!id) return null;
    return this.devices().find((d) => d.libraryId === id) ?? null;
  });

  readonly filteredDevices = computed<LibraryDevice[]>(() => {
    const query = this.searchQuery().trim();
    if (!query) return this.devices();
    return this.devices().filter((device) => matchesLibrarySearch(device, query));
  });

  expand(): void {
    this.isExpanded.set(true);
  }

  toggleVisibility(): void {
    this.isExpanded.update((v) => !v);
  }

  beginCreate(): void {
    this.captureReturnFocus();
    this.editingDeviceId.set(`lib-custom-${createLibraryId()}`);
    this.editingMode.set('create');
  }

  beginEdit(libraryId: string): void {
    this.captureReturnFocus();
    this.editingDeviceId.set(libraryId);
    this.editingMode.set('edit');
  }

  commitDraft(
    libraryId: string,
    template: DeviceNodeData,
    pendingAssets: readonly RasterArtworkAsset[] = [],
  ): boolean {
    const mode = this.editingMode();
    if (mode === 'create') {
      this.devices.update((list) => {
        const cloned = structuredClone(template);
        const existing = list.findIndex((device) => device.libraryId === libraryId);
        if (existing < 0) return [...list, { libraryId, template: cloned }];
        return list.map((device, index) =>
          index === existing ? { ...device, template: cloned } : device,
        );
      });
    } else if (mode === 'edit') {
      this.devices.update((list) =>
        list.map((d) =>
          d.libraryId === libraryId ? { ...d, template: structuredClone(template) } : d,
        ),
      );
    }
    this.artworkStore.registerMany(pendingAssets);
    const saved = this.persist();
    if (saved) this.closeDetail();
    return saved;
  }

  closeDetail(): void {
    const returnFocus = this.returnFocus;
    this.editingDeviceId.set(null);
    this.editingMode.set(null);
    this.returnFocus = null;
    if (returnFocus?.isConnected) {
      setTimeout(() => {
        returnFocus.focus();
      }, 0);
    }
  }

  removeDevice(libraryId: string): void {
    this.devices.update((list) => list.filter((d) => d.libraryId !== libraryId));
    this.persist();
    if (this.editingDeviceId() === libraryId) {
      this.closeDetail();
    }
  }

  restoreDefaults(): void {
    const restored = [
      ...structuredClone(SEED_LIBRARY),
      ...this.devices().filter((device) => device.libraryId.startsWith('lib-custom-')),
    ];
    this.devices.set(restored);
    if (this.persist()) this.closeDetail();
  }

  artworkAsset(hash: string | undefined): RasterArtworkAsset | undefined {
    return this.artworkStore.asset(hash);
  }

  dismissStorageError(): void {
    this.storageError.set(null);
  }

  private persist(): boolean {
    const hashes = referencedArtworkHashes(this.devices());
    const result = persistLibraryCatalog(this.storage, {
      devices: this.devices(),
      assets: this.artworkStore.referenced(hashes),
    });
    this.storageError.set(result.ok ? null : result.message);
    return result.ok;
  }

  private captureReturnFocus(): void {
    this.returnFocus =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  }
}

const createLibraryId = (): string => {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
};
