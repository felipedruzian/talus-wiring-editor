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
import {
  canonicalCategory,
  categoryById,
  categoryValidationError,
  collapseCategoryWhitespace,
  normalizeCategoryPrefix,
  SEED_LIBRARY_CATEGORIES,
  UNCATEGORIZED_CATEGORY_ID,
  type LibraryCategory,
} from './library-category';
import { SEED_LIBRARY, type LibraryDevice, type LibraryDeviceTemplate } from './seed-library';

type LibraryEditMode = 'create' | 'edit';

/** Page-scoped state for the device-library palette: list, expand/collapse, edit-mode lifecycle, and debounced search. */
@Injectable()
export class LibraryService {
  private readonly artworkStore = inject(ArtworkAssetStore);
  private readonly storage = browserLocalStorage();
  private readonly initialLoad = loadLibraryCatalog(this.storage);
  private readonly initialCatalog = this.initialLoad.catalog;

  /** The catalog changes atomically; consumers derive every collection from this one signal. */
  readonly catalog = signal(structuredClone(this.initialCatalog));
  readonly categories = computed(() => this.catalog().categories);
  // Project resources are deliberately separate from the shared catalog. They
  // resolve labels for an opened project, but are never candidates for library
  // CRUD or a central PUT.
  private readonly projectCategories = signal<readonly LibraryCategory[]>([]);
  readonly resolvedCategories = computed(() => {
    const project = this.projectCategories();
    const projectIds = new Set(project.map((category) => category.id));
    return [...project, ...this.catalog().categories.filter((category) => !projectIds.has(category.id))];
  });
  readonly devices = computed(() => this.catalog().devices);
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
    return this.devices().filter((device) =>
      matchesLibrarySearch(device, query, this.categories()),
    );
  });

  /** Supplies project serialization without exposing private resources to catalog CRUD. */
  projectCategoryInventory(): readonly LibraryCategory[] {
    return this.resolvedCategories();
  }

  /** Hydrates category resources carried by a project without mutating the central catalog. */
  hydrateProjectCategories(categories: readonly LibraryCategory[]): void {
    this.projectCategories.set(structuredClone(categories));
  }

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
    const requestedCategoryId = template.categoryId;
    const categoryId =
      requestedCategoryId && this.catalog().categories.some(({ id }) => id === requestedCategoryId)
        ? requestedCategoryId
        : UNCATEGORIZED_CATEGORY_ID;
    const { category: _legacyCategory, ...canonicalTemplate } = template;
    const normalizedTemplate: LibraryDeviceTemplate = {
      ...canonicalTemplate,
      categoryId,
    };
    let nextDevices: LibraryDevice[];
    if (mode === 'create') {
      nextDevices = (() => {
        const list = this.devices();
        const cloned = structuredClone(normalizedTemplate);
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
        d.libraryId === libraryId ? { ...d, template: structuredClone(normalizedTemplate) } : d,
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
    return this.commitCatalog(
      { categories: this.catalog().categories, devices: nextDevices, assets },
      true,
    );
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
    if (this.isPersisting()) return false;
    const nextDevices = this.devices().filter((device) => device.libraryId !== libraryId);
    const hashes = referencedArtworkHashes(nextDevices);
    return this.commitCatalog(
      {
        categories: this.catalog().categories,
        devices: nextDevices,
        assets: this.artworkStore.referenced(hashes),
      },
      this.editingDeviceId() === libraryId,
    );
  }

  async restoreDefaults(): Promise<boolean> {
    await this.centralHydration;
    if (this.isPersisting()) return false;
    const restored = [
      ...structuredClone(SEED_LIBRARY),
      ...this.devices().filter((device) => device.libraryId.startsWith('lib-custom-')),
    ];
    const hashes = referencedArtworkHashes(restored);
    return this.commitCatalog(
      {
        categories: [
          ...structuredClone([...SEED_LIBRARY_CATEGORIES]),
          ...this.catalog().categories.filter(
            (category) => !SEED_LIBRARY_CATEGORIES.some(({ id }) => id === category.id),
          ),
        ],
        devices: restored,
        assets: this.artworkStore.referenced(hashes),
      },
      true,
    );
  }

  category(categoryId: string | undefined): LibraryCategory {
    return categoryById(this.resolvedCategories(), categoryId);
  }

  async createCategory(name: string, prefix: string): Promise<boolean> {
    await this.centralHydration;
    if (this.isPersisting()) return false;
    const category = canonicalCategory(
      `category-${createLibraryId().toLocaleLowerCase('pt-BR')}`,
      name,
      prefix,
    );
    const error = categoryValidationError(category, this.catalog().categories);
    if (error) {
      this.storageError.set(error);
      return false;
    }
    return this.commitCatalog(
      {
        ...this.catalog(),
        categories: [...this.catalog().categories, category],
      },
      false,
    );
  }

  async renameCategory(categoryId: string, name: string, prefix: string): Promise<boolean> {
    await this.centralHydration;
    if (this.isPersisting()) return false;
    if (categoryId === UNCATEGORIZED_CATEGORY_ID) {
      this.storageError.set('A categoria “Não categorizado” é fixa e não pode ser alterada.');
      return false;
    }
    const current = this.catalog().categories.find(({ id }) => id === categoryId);
    if (!current) {
      this.storageError.set('A categoria não existe mais. Recarregue a página.');
      return false;
    }
    const updated = canonicalCategory(
      current.id,
      collapseCategoryWhitespace(name),
      normalizeCategoryPrefix(prefix),
    );
    const error = categoryValidationError(updated, this.catalog().categories, categoryId);
    if (error) {
      this.storageError.set(error);
      return false;
    }
    return this.commitCatalog(
      {
        ...this.catalog(),
        categories: this.catalog().categories.map((category) =>
          category.id === categoryId ? updated : category,
        ),
      },
      false,
    );
  }

  async deleteCategory(categoryId: string): Promise<boolean> {
    await this.centralHydration;
    if (this.isPersisting()) return false;
    if (categoryId === UNCATEGORIZED_CATEGORY_ID) {
      this.storageError.set('A categoria “Não categorizado” é fixa e não pode ser excluída.');
      return false;
    }
    if (!this.catalog().categories.some(({ id }) => id === categoryId)) {
      this.storageError.set('A categoria não existe mais. Recarregue a página.');
      return false;
    }
    // Reassignment and removal form one immutable catalog transaction and one write.
    const devices = this.devices().map((device) =>
      device.template.categoryId === categoryId
        ? {
            ...device,
            template: { ...device.template, categoryId: UNCATEGORIZED_CATEGORY_ID },
          }
        : device,
    );
    return this.commitCatalog(
      {
        ...this.catalog(),
        categories: this.catalog().categories.filter(({ id }) => id !== categoryId),
        devices,
      },
      false,
    );
  }

  artworkAsset(hash: string | undefined): RasterArtworkAsset | undefined {
    return this.artworkStore.asset(hash);
  }

  dismissStorageError(): void {
    this.storageError.set(null);
  }

  private async commitCatalog(
    catalog: {
      categories: LibraryCategory[];
      devices: LibraryDevice[];
      assets: RasterArtworkAsset[];
    },
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

      const local = persistLibraryCatalog(this.storage, catalog);
      this.storageError.set(
        local.ok
          ? null
          : this.centralState === 'ready'
            ? `Salvo no Talus, mas o cache deste navegador falhou: ${local.message}`
            : local.message,
      );
      if (!local.ok && this.centralState !== 'ready') return false;
      this.catalog.set(structuredClone(catalog));
      this.artworkStore.registerMany(catalog.assets);
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
      if (this.initialLoad.needsRepair || this.initialCatalog.loadError) {
        this.centralState = 'error';
        this.storageError.set(
          'O cache local precisou de reparos; a biblioteca central vazia não foi inicializada automaticamente.',
        );
        return;
      }
      const prepared = prepareLibraryCatalog(this.initialCatalog);
      if (!prepared.ok) {
        this.centralState = 'error';
        this.storageError.set(prepared.message);
        return;
      }
      const initialized = await saveSharedLibrary(prepared.payload, remote.etag);
      if (initialized.kind === 'saved') {
        this.centralEtag = initialized.etag;
        const local = persistLibraryCatalog(this.storage, this.initialCatalog);
        if (!local.ok) {
          this.storageError.set(
            `Salvo no Talus, mas o cache deste navegador falhou: ${local.message}`,
          );
        }
        return;
      }
      this.centralState = initialized.kind === 'unavailable' ? 'unavailable' : 'error';
      if (initialized.kind !== 'unavailable') this.storageError.set(initialized.message);
      return;
    }

    if (remote.needsUpgrade) {
      const prepared = prepareLibraryCatalog(remote.catalog);
      if (!prepared.ok) {
        this.centralState = 'error';
        this.storageError.set(prepared.message);
        return;
      }
      const upgraded = await saveSharedLibrary(prepared.payload, remote.etag);
      if (upgraded.kind !== 'saved') {
        this.centralState = upgraded.kind === 'unavailable' ? 'unavailable' : 'error';
        this.storageError.set(
          upgraded.kind === 'unavailable'
            ? 'O serviço central ficou indisponível durante a atualização da biblioteca. O cache local foi preservado.'
            : upgraded.message,
        );
        return;
      }
      this.centralEtag = upgraded.etag;
    }

    this.catalog.set(structuredClone(remote.catalog));
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
