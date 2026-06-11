import { type Node } from 'ng-diagram';
import { DEVICE_CATEGORY_PREFIXES, FALLBACK_DEVICE_PREFIX } from './device-categories';
import { isDeviceNode } from './guards';

const prefixForCategory = (category: string | undefined): string => {
  const key = category?.trim().toLowerCase();
  if (!key) return FALLBACK_DEVICE_PREFIX;
  return DEVICE_CATEGORY_PREFIXES[key] ?? FALLBACK_DEVICE_PREFIX;
};

/**
 * Generates a deviceId of the form `<PREFIX>-<N>` where N is the smallest
 * positive integer not yet used by another device of the same prefix in the
 * supplied node list.
 */
export const generateDeviceId = (
  category: string | undefined,
  existingNodes: readonly Node[],
): string => {
  const prefix = prefixForCategory(category);
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
