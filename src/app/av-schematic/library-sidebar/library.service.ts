import { computed, Injectable, signal } from '@angular/core';
import { type DeviceNodeData } from '../diagram/model/interfaces';
import { SEED_LIBRARY, type LibraryDevice } from './seed-library';

type LibraryEditMode = 'create' | 'edit';

/** Page-scoped state for the device-library palette: list, expand/collapse, edit-mode lifecycle, and debounced search. */
@Injectable()
export class LibraryService {
  readonly devices = signal<LibraryDevice[]>(SEED_LIBRARY);
  readonly isExpanded = signal(false);
  readonly editingDeviceId = signal<string | null>(null);
  readonly editingMode = signal<LibraryEditMode | null>(null);
  readonly searchQuery = signal('');

  readonly editingDevice = computed<LibraryDevice | null>(() => {
    const id = this.editingDeviceId();
    if (!id) return null;
    return this.devices().find((d) => d.libraryId === id) ?? null;
  });

  readonly filteredDevices = computed<LibraryDevice[]>(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.devices();
    return this.devices().filter((d) => {
      const manufacturer = d.template.manufacturer?.toLowerCase() ?? '';
      const model = d.template.model?.toLowerCase() ?? '';
      return manufacturer.includes(query) || model.includes(query);
    });
  });

  expand(): void {
    this.isExpanded.set(true);
  }

  toggleVisibility(): void {
    this.isExpanded.update((v) => !v);
  }

  beginCreate(): void {
    this.editingDeviceId.set(`lib-custom-${crypto.randomUUID()}`);
    this.editingMode.set('create');
  }

  beginEdit(libraryId: string): void {
    this.editingDeviceId.set(libraryId);
    this.editingMode.set('edit');
  }

  commitDraft(libraryId: string, template: DeviceNodeData): void {
    const mode = this.editingMode();
    if (mode === 'create') {
      this.devices.update((list) => [...list, { libraryId, template }]);
    } else if (mode === 'edit') {
      this.devices.update((list) =>
        list.map((d) => (d.libraryId === libraryId ? { ...d, template } : d)),
      );
    }
    this.closeDetail();
  }

  closeDetail(): void {
    this.editingDeviceId.set(null);
    this.editingMode.set(null);
  }

  removeDevice(libraryId: string): void {
    this.devices.update((list) => list.filter((d) => d.libraryId !== libraryId));
    if (this.editingDeviceId() === libraryId) {
      this.closeDetail();
    }
  }
}
