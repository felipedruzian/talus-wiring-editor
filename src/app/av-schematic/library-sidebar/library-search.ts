import { type LibraryDevice } from './seed-library';

export function matchesLibrarySearch(device: LibraryDevice, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const searchableFields = [
    device.template.manufacturer,
    device.template.model,
    device.template.category ?? '',
    ...device.template.ports.map((port) => port.label),
  ];
  return searchableFields.some((field) => field.toLowerCase().includes(query));
}
