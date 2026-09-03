import { type Node } from 'ng-diagram';
import { DEVICE_CATEGORY_PREFIXES, FALLBACK_DEVICE_PREFIX } from './device-categories';
import { isDeviceNode } from './guards';

export interface DeviceIdCategory {
  id: string;
  prefix: string;
}

const prefixForCategory = (
  categoryId: string | undefined,
  categories: readonly DeviceIdCategory[],
): string => {
  const configured = categories.find(({ id }) => id === categoryId)?.prefix;
  if (configured) return configured;
  const key = categoryId?.trim().toLowerCase();
  if (!key) return FALLBACK_DEVICE_PREFIX;
  return DEVICE_CATEGORY_PREFIXES[key] ?? FALLBACK_DEVICE_PREFIX;
};

/**
 * Generates a deviceId of the form `<PREFIX>-<N>` where N is the smallest
 * positive integer not yet used by another device of the same prefix in the
 * supplied node list.
 */
export const generateDeviceId = (
  categoryId: string | undefined,
  existingNodes: readonly Node[],
  categories: readonly DeviceIdCategory[] = [],
): string => {
  const prefix = prefixForCategory(categoryId, categories);
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const used = new Set<number>();

  for (const node of existingNodes) {
    if (!isDeviceNode(node)) continue;
    const match = node.data.deviceId.match(pattern);
    if (match) used.add(Number.parseInt(match[1], 10));
  }

  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}-${n}`;
};
