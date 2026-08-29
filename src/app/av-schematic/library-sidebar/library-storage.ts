import { type DeviceNodeData, type DevicePort } from '../diagram/model/interfaces';
import { SEED_LIBRARY, type LibraryDevice } from './seed-library';

export const LIBRARY_STORAGE_KEY = 'talus-wiring-editor.library.v1';
export const LIBRARY_STORAGE_VERSION = 1;

interface PersistedLibrary {
  version: typeof LIBRARY_STORAGE_VERSION;
  devices: LibraryDevice[];
}

export function browserLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadLibraryDevices(storage: Storage | null): LibraryDevice[] {
  if (!storage) return SEED_LIBRARY;
  try {
    const serialized = storage.getItem(LIBRARY_STORAGE_KEY);
    if (!serialized) return SEED_LIBRARY;
    const parsed: unknown = JSON.parse(serialized);
    if (!isPersistedLibrary(parsed)) return SEED_LIBRARY;
    return parsed.devices;
  } catch {
    return SEED_LIBRARY;
  }
}

export function persistLibraryDevices(storage: Storage | null, devices: LibraryDevice[]): void {
  if (!storage) return;
  const payload: PersistedLibrary = { version: LIBRARY_STORAGE_VERSION, devices };
  try {
    storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // The in-memory library remains usable when storage is unavailable or full.
  }
}

function isPersistedLibrary(value: unknown): value is PersistedLibrary {
  if (!isRecord(value) || value['version'] !== LIBRARY_STORAGE_VERSION) return false;
  if (!Array.isArray(value['devices']) || !value['devices'].every(isLibraryDevice)) return false;
  const ids = value['devices'].map((device) => device.libraryId);
  return new Set(ids).size === ids.length;
}

function isLibraryDevice(value: unknown): value is LibraryDevice {
  return (
    isRecord(value) &&
    typeof value['libraryId'] === 'string' &&
    value['libraryId'].length > 0 &&
    isDeviceTemplate(value['template'])
  );
}

function isDeviceTemplate(value: unknown): value is DeviceNodeData {
  if (!isRecord(value) || value['type'] !== 'device') return false;
  if (
    typeof value['deviceId'] !== 'string' ||
    typeof value['manufacturer'] !== 'string' ||
    typeof value['model'] !== 'string' ||
    !Array.isArray(value['ports']) ||
    !value['ports'].every(isDevicePort)
  ) {
    return false;
  }
  return (
    optionalString(value['category']) &&
    optionalString(value['location']) &&
    optionalString(value['notes'])
  );
}

function isDevicePort(value: unknown): value is DevicePort {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    value['id'].length > 0 &&
    typeof value['label'] === 'string' &&
    (value['direction'] === 'input' || value['direction'] === 'output') &&
    optionalString(value['connectorType'])
  );
}

const optionalString = (value: unknown): boolean =>
  value === undefined || typeof value === 'string';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
