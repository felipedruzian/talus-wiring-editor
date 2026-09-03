import { normalizeSearchText } from '../shared/utils/search-text';
import { categoryById, type LibraryCategory } from './library-category';
import { type LibraryDevice } from './seed-library';

export function matchesLibrarySearch(
  device: LibraryDevice,
  rawQuery: string,
  categories: readonly LibraryCategory[],
): boolean {
  const query = normalizeSearchText(rawQuery.trim());
  if (!query) return true;
  const category = categoryById(categories, device.template.categoryId);
  const searchableFields = [
    device.template.manufacturer,
    device.template.model,
    category.id,
    category.name,
    category.prefix,
    device.template.notes ?? '',
    ...device.template.ports.map((port) => port.label),
  ];
  return searchableFields.some((field) => normalizeSearchText(field).includes(query));
}
