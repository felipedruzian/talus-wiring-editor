import {
  DEVICE_CATEGORIES,
  DEVICE_CATEGORY_LABELS,
  DEVICE_CATEGORY_PREFIXES,
  FALLBACK_DEVICE_PREFIX,
} from '../diagram/model/device-categories';
import { type DeviceNodeData } from '../diagram/model/interfaces';

export interface LibraryCategory {
  /** Stable catalog identity. Renaming a category never changes this value. */
  id: string;
  name: string;
  prefix: string;
}

export const UNCATEGORIZED_CATEGORY_ID = 'uncategorized';
export const UNCATEGORIZED_CATEGORY: LibraryCategory = Object.freeze({
  id: UNCATEGORIZED_CATEGORY_ID,
  name: 'Não categorizado',
  prefix: FALLBACK_DEVICE_PREFIX,
});

export const SEED_LIBRARY_CATEGORIES: readonly LibraryCategory[] = Object.freeze([
  UNCATEGORIZED_CATEGORY,
  { id: 'buzzer', name: 'Buzinas', prefix: 'BUZ' },
  { id: 'resistor', name: 'Resistores', prefix: 'RES' },
  { id: 'capacitor', name: 'Capacitores', prefix: 'CAP' },
  ...DEVICE_CATEGORIES.map((id) => ({
    id,
    name: DEVICE_CATEGORY_LABELS[id] ?? id,
    prefix: DEVICE_CATEGORY_PREFIXES[id] ?? FALLBACK_DEVICE_PREFIX,
  })),
]);

export const MAX_LIBRARY_CATEGORIES = 512;
const CATEGORY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const CATEGORY_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{0,11}$/;

/** Canonical comparison key required by the category catalog contract. */
export function normalizeCategoryName(value: string): string {
  return collapseCategoryWhitespace(value)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('pt-BR');
}

export function collapseCategoryWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function normalizeCategoryPrefix(value: string): string {
  return value.trim().toLocaleUpperCase('pt-BR');
}

export function categoryValidationError(
  category: LibraryCategory,
  existing: readonly LibraryCategory[],
  ignoreId?: string,
): string | null {
  const name = collapseCategoryWhitespace(category.name);
  const normalizedName = normalizeCategoryName(category.name);
  if (!normalizedName) return 'Informe um nome para a categoria.';
  if (name.length > 65_536) {
    return 'O nome da categoria deve ter no máximo 65.536 caracteres.';
  }
  if (!CATEGORY_ID_PATTERN.test(category.id)) return 'O identificador da categoria é inválido.';
  if (!CATEGORY_PREFIX_PATTERN.test(normalizeCategoryPrefix(category.prefix))) {
    return 'O prefixo deve ter de 1 a 12 letras ou números e começar com uma letra.';
  }
  if (
    existing.some(
      (candidate) =>
        candidate.id !== ignoreId && normalizeCategoryName(candidate.name) === normalizedName,
    )
  ) {
    return `Já existe uma categoria chamada “${name}”.`;
  }
  if (existing.some((candidate) => candidate.id !== ignoreId && candidate.id === category.id)) {
    return 'Já existe uma categoria com esse identificador.';
  }
  return null;
}

export function isCanonicalLibraryCategory(value: unknown): value is LibraryCategory {
  if (!isRecord(value)) return false;
  const category = value as Partial<LibraryCategory>;
  return (
    typeof category.id === 'string' &&
    CATEGORY_ID_PATTERN.test(category.id) &&
    typeof category.name === 'string' &&
    category.name.length <= 65_536 &&
    category.name === collapseCategoryWhitespace(category.name) &&
    normalizeCategoryName(category.name) !== '' &&
    typeof category.prefix === 'string' &&
    category.prefix === normalizeCategoryPrefix(category.prefix) &&
    CATEGORY_PREFIX_PATTERN.test(category.prefix)
  );
}

export function categoriesValidationError(categories: readonly LibraryCategory[]): string | null {
  if (categories.length > MAX_LIBRARY_CATEGORIES) {
    return `O catálogo aceita no máximo ${MAX_LIBRARY_CATEGORIES} categorias.`;
  }
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const category of categories) {
    if (!isCanonicalLibraryCategory(category)) return 'O catálogo contém uma categoria inválida.';
    const normalizedName = normalizeCategoryName(category.name);
    if (seenIds.has(category.id) || seenNames.has(normalizedName)) {
      return 'O catálogo contém categorias duplicadas.';
    }
    seenIds.add(category.id);
    seenNames.add(normalizedName);
  }
  const fallback = categories.find(({ id }) => id === UNCATEGORIZED_CATEGORY_ID);
  if (
    fallback?.name !== UNCATEGORIZED_CATEGORY.name ||
    fallback?.prefix !== UNCATEGORIZED_CATEGORY.prefix
  ) {
    return 'A categoria padrão do catálogo está ausente ou foi alterada.';
  }
  return null;
}

export function categoryById(
  categories: readonly LibraryCategory[],
  categoryId: string | undefined,
): LibraryCategory {
  return categories.find((category) => category.id === categoryId) ?? UNCATEGORIZED_CATEGORY;
}

export function canonicalCategory(id: string, name: string, prefix: string): LibraryCategory {
  return {
    id,
    name: collapseCategoryWhitespace(name),
    prefix: normalizeCategoryPrefix(prefix),
  };
}

/**
 * Convert the free-form `category` strings used by local v1/v2 catalogs into
 * stable IDs. Unknown names receive a content-derived ID, so the same legacy
 * payload migrates identically on every host and in every iteration order.
 */
export function migrateLegacyDeviceCategories<T extends { template: DeviceNodeData }>(
  devices: readonly T[],
): {
  categories: LibraryCategory[];
  devices: (T & { template: DeviceNodeData & { categoryId: string } })[];
} {
  const categories = structuredClone([...SEED_LIBRARY_CATEGORIES]);
  const byNormalizedName = new Map(
    categories.map((category) => [normalizeCategoryName(category.name), category]),
  );
  const byLegacyId = new Map(
    categories.map((category) => [normalizeCategoryName(category.id), category]),
  );

  const migrated = devices.map((candidate) => {
    const device = structuredClone(candidate);
    const legacyName = collapseCategoryWhitespace(device.template.category ?? '');
    const normalized = normalizeCategoryName(legacyName);
    let category = normalized
      ? (byLegacyId.get(normalized) ?? byNormalizedName.get(normalized))
      : UNCATEGORIZED_CATEGORY;
    if (!category) {
      category = {
        id: deterministicLegacyCategoryId(normalized),
        name: legacyName,
        prefix: FALLBACK_DEVICE_PREFIX,
      };
      categories.push(category);
      byNormalizedName.set(normalized, category);
    }
    const { category: _legacyCategory, ...template } = device.template;
    return {
      ...device,
      template: { ...template, categoryId: category.id },
    };
  });
  return { categories, devices: migrated };
}

export function deterministicLegacyCategoryId(normalizedName: string): string {
  const slug = normalizedName
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `legacy-${slug || 'category'}-${fnv1a(normalizedName)}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
