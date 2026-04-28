import { computed, Injectable, signal } from '@angular/core';
import { type DeviceNodeData } from '../diagram/model/interfaces';
import { SEED_LIBRARY, type LibraryDevice } from './seed-library';

const generateLibraryId = (): string =>
  'lib-custom-' + Math.random().toString(36).slice(2, 8);

const createBlankTemplate = (): DeviceNodeData => ({
  type: 'device',
  deviceId: '',
  manufacturer: '',
  model: '',
  category: '',
  location: '',
  ports: [],
});

@Injectable()
export class LibraryService {
  readonly devices = signal<LibraryDevice[]>(SEED_LIBRARY);
  readonly isExpanded = signal(false);
  readonly editingDeviceId = signal<string | null>(null);

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

  openDetail(libraryId: string): void {
    this.editingDeviceId.set(libraryId);
  }

  closeDetail(): void {
    this.editingDeviceId.set(null);
  }

  addDevice(): string {
    const newDevice: LibraryDevice = {
      libraryId: generateLibraryId(),
      template: createBlankTemplate(),
    };
    this.devices.update((list) => [...list, newDevice]);
    this.editingDeviceId.set(newDevice.libraryId);
    return newDevice.libraryId;
  }

  updateDevice(libraryId: string, template: DeviceNodeData): void {
    this.devices.update((list) =>
      list.map((d) => (d.libraryId === libraryId ? { ...d, template } : d)),
    );
  }

  removeDevice(libraryId: string): void {
    this.devices.update((list) => list.filter((d) => d.libraryId !== libraryId));
    if (this.editingDeviceId() === libraryId) {
      this.editingDeviceId.set(null);
    }
  }
}
