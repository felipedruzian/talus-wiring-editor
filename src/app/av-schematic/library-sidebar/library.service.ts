import { computed, inject, Injectable, signal } from '@angular/core';
import { ArtworkAssetStore, type RasterArtworkAsset } from '../diagram/artwork/artwork-asset.store';
import { type DeviceNodeData } from '../diagram/model/interfaces';
import {
  browserLocalStorage,
  loadLibraryCatalog,
  MAX_LIBRARY_ASSETS,
  prepareLibraryCatalog,
  persistLibraryCatalog,
  referencedArtworkHashes,
} from './library-storage';
import { loadSharedLibrary, saveSharedLibrary } from './library-api';
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
  readonly storageError = signal<string | null>(this.initialCatalog.loadError ?? null);
  readonly isPersisting = signal(false);
  private returnFocus: HTMLElement | null = null;
  private centralState: 'pending' | 'ready' | 'unavailable' | 'error' = 'pending';
  private centralEtag: string | null = null;
  private readonly centralHydration: Promise<void>;
  private editIntent = 0;
  private editingBaseEtag: string | null | undefined;

  constructor() {
    this.artworkStore.replace(this.initialCatalog.assets);
    this.centralHydration = this.hydrateFromCentralService();
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
    this.editIntent += 1;
    this.captureReturnFocus();
    this.editingDeviceId.set(`lib-custom-${createLibraryId()}`);
    this.editingMode.set('create');
    this.editingBaseEtag = undefined;
  }

  async beginEdit(libraryId: string): Promise<void> {
    const intent = ++this.editIntent;
    this.captureReturnFocus();
    await this.centralHydration;
    if (intent !== this.editIntent) return;
    if (!this.devices().some((device) => device.libraryId === libraryId)) {
      this.storageError.set(
        'Este componente não existe mais na biblioteca compartilhada. Reabra a biblioteca e escolha outro item.',
      );
      return;
    }
    this.editingDeviceId.set(libraryId);
    this.editingMode.set('edit');
    this.editingBaseEtag = this.centralEtag;
  }

  async commitDraft(
    libraryId: string,
    template: DeviceNodeData,
    pendingAssets: readonly RasterArtworkAsset[] = [],
  ): Promise<boolean> {
    await this.centralHydration;
    if (this.isPersisting()) return false;
    const mode = this.editingMode();
    let nextDevices: LibraryDevice[];
    if (mode === 'create') {
      nextDevices = (() => {
        const list = this.devices();
        const cloned = structuredClone(template);
        const existing = list.findIndex((device) => device.libraryId === libraryId);
        if (existing < 0) return [...list, { libraryId, template: cloned }];
        return list.map((device, index) =>
          index === existing ? { ...device, template: cloned } : device,
        );
      })();
    } else if (mode === 'edit') {
      if (this.centralState === 'ready' && this.editingBaseEtag !== this.centralEtag) {
        this.storageError.set(
          'A biblioteca mudou desde que esta edição começou. Reabra o componente antes de salvar.',
        );
        return false;
      }
      if (!this.devices().some((device) => device.libraryId === libraryId)) {
        this.storageError.set(
          'Este componente não existe mais na biblioteca compartilhada. Nada foi salvo.',
        );
        return false;
      }
      nextDevices = this.devices().map((d) =>
        d.libraryId === libraryId ? { ...d, template: structuredClone(template) } : d,
      );
    } else {
      return false;
    }
    const pendingByHash = new Map(pendingAssets.map((asset) => [asset.hash, asset]));
    const hashes = referencedArtworkHashes(nextDevices);
    if (hashes.size > MAX_LIBRARY_ASSETS) {
      this.storageError.set(
        `O catálogo aceita no máximo ${MAX_LIBRARY_ASSETS} imagens. Remova uma imagem antes de continuar.`,
      );
      return false;
    }
    const assets = [...hashes].flatMap((hash) => {
      const asset = pendingByHash.get(hash) ?? this.artworkStore.asset(hash);
      return asset ? [asset] : [];
    });
    if (assets.length !== hashes.size) {
      this.storageError.set('O componente referencia uma imagem que não está disponível.');
      return false;
    }
    return this.commitCatalog({ devices: nextDevices, assets }, true);
  }

  closeDetail(): void {
    this.editIntent += 1;
    const returnFocus = this.returnFocus;
    this.editingDeviceId.set(null);
    this.editingMode.set(null);
    this.editingBaseEtag = undefined;
    this.returnFocus = null;
    if (returnFocus?.isConnected) {
      setTimeout(() => {
        returnFocus.focus();
      }, 0);
    }
  }

  async removeDevice(libraryId: string): Promise<boolean> {
    await this.centralHydration;
    const nextDevices = this.devices().filter((device) => device.libraryId !== libraryId);
    const hashes = referencedArtworkHashes(nextDevices);
    return this.commitCatalog(
      { devices: nextDevices, assets: this.artworkStore.referenced(hashes) },
      this.editingDeviceId() === libraryId,
    );
  }

  async restoreDefaults(): Promise<boolean> {
    await this.centralHydration;
    const restored = [
      ...structuredClone(SEED_LIBRARY),
      ...this.devices().filter((device) => device.libraryId.startsWith('lib-custom-')),
    ];
    const hashes = referencedArtworkHashes(restored);
    return this.commitCatalog(
      { devices: restored, assets: this.artworkStore.referenced(hashes) },
      true,
    );
  }

  artworkAsset(hash: string | undefined): RasterArtworkAsset | undefined {
    return this.artworkStore.asset(hash);
  }

  dismissStorageError(): void {
    this.storageError.set(null);
  }

  private async commitCatalog(
    catalog: { devices: LibraryDevice[]; assets: RasterArtworkAsset[] },
    closeDetail: boolean,
  ): Promise<boolean> {
    const prepared = prepareLibraryCatalog(catalog);
    if (!prepared.ok) {
      this.storageError.set(prepared.message);
      return false;
    }
    if (this.centralState === 'error') {
      this.storageError.set(
        'A biblioteca central está disponível, mas não pôde ser validada. Nada foi salvo.',
      );
      return false;
    }

    this.isPersisting.set(true);
    try {
      if (this.centralState === 'ready' && this.centralEtag) {
        const remote = await saveSharedLibrary(prepared.payload, this.centralEtag);
        if (remote.kind === 'conflict' || remote.kind === 'error') {
          this.storageError.set(remote.message);
          return false;
        }
        if (remote.kind === 'unavailable') {
          this.storageError.set(
            'O serviço central ficou indisponível. Nada foi salvo para evitar versões divergentes.',
          );
          return false;
        }
        this.centralEtag = remote.etag;
      }

      this.devices.set(structuredClone(catalog.devices));
      this.artworkStore.registerMany(catalog.assets);
      const local = persistLibraryCatalog(this.storage, catalog);
      this.storageError.set(
        local.ok
          ? null
          : this.centralState === 'ready'
            ? `Salvo no Talus, mas o cache deste navegador falhou: ${local.message}`
            : local.message,
      );
      if (!local.ok && this.centralState !== 'ready') return false;
      if (closeDetail) this.closeDetail();
      return true;
    } finally {
      this.isPersisting.set(false);
    }
  }

  private async hydrateFromCentralService(): Promise<void> {
    const remote = await loadSharedLibrary();
    if (remote.kind === 'unavailable') {
      this.centralState = 'unavailable';
      return;
    }
    if (remote.kind === 'error') {
      this.centralState = 'error';
      this.storageError.set(remote.message);
      return;
    }

    this.centralState = 'ready';
    this.centralEtag = remote.etag;
    if (!remote.initialized) {
      const prepared = prepareLibraryCatalog(this.initialCatalog);
      if (!prepared.ok) {
        this.centralState = 'error';
        this.storageError.set(prepared.message);
        return;
      }
      const initialized = await saveSharedLibrary(prepared.payload, remote.etag);
      if (initialized.kind === 'saved') {
        this.centralEtag = initialized.etag;
        return;
      }
      this.centralState = initialized.kind === 'unavailable' ? 'unavailable' : 'error';
      if (initialized.kind !== 'unavailable') this.storageError.set(initialized.message);
      return;
    }

    this.devices.set(structuredClone(remote.catalog.devices));
    this.artworkStore.registerMany(remote.catalog.assets);
    const local = persistLibraryCatalog(this.storage, remote.catalog);
    if (!local.ok) {
      this.storageError.set(
        `Biblioteca central carregada, mas o cache local falhou: ${local.message}`,
      );
    } else {
      this.storageError.set(null);
    }
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
