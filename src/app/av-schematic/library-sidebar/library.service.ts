import { computed, Injectable, signal } from '@angular/core';
import { type DeviceNodeData } from '../diagram/model/interfaces';
import { SEED_LIBRARY, type LibraryDevice } from './seed-library';

const generateLibraryId = (): string =>
  'lib-custom-' + Math.random().toString(36).slice(2, 8);

export const createBlankTemplate = (): DeviceNodeData => ({
  type: 'device',
  deviceId: '',
  manufacturer: '',
  model: '',
  category: '',
  location: '',
  ports: [],
});

export type LibraryEditMode = 'create' | 'edit';

@Injectable()
export class LibraryService {
  readonly devices = signal<LibraryDevice[]>(SEED_LIBRARY);
  readonly isExpanded = signal(false);
  readonly editingDeviceId = signal<string | null>(null);
  readonly editingMode = signal<LibraryEditMode | null>(null);

  readonly editingDevice = computed<LibraryDevice | null>(() => {
    const id = this.editingDeviceId();
    if (!id) return null;
    return this.devices().find((d) => d.libraryId === id) ?? null;
  });

  expand(): void {
    this.isExpanded.set(true);
  }

  toggleVisibility(): void {
    this.isExpanded.update((v) => !v);
  }

  beginCreate(): string {
    const libraryId = generateLibraryId();
    this.editingDeviceId.set(libraryId);
    this.editingMode.set('create');
    return libraryId;
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
