import { type LibraryDevice } from './seed-library';

export function matchesLibrarySearch(device: LibraryDevice, rawQuery: string): boolean {
  const query = normalizeSearchText(rawQuery.trim());
  if (!query) return true;
  const searchableFields = [
    device.template.manufacturer,
    device.template.model,
    device.template.category ?? '',
    device.template.notes ?? '',
    ...device.template.ports.map((port) => port.label),
  ];
  return searchableFields.some((field) => normalizeSearchText(field).includes(query));
}

const normalizeSearchText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
