/**
 * Pure helpers for merging accumulated patches before they're handed to
 * ng-diagram. Extracted from `ModelApplyService` so the merge/resolve logic
 * can be reasoned about (and unit-tested) without dragging in the diagram
 * services.
 */

/**
 * Inside `data`: later keys win; `undefined` is preserved.
 * Top-level: later non-`undefined` values win; `undefined` is dropped.
 */
const mergePatch = <TPatch extends { id: string; data?: object }>(a: TPatch, b: TPatch): TPatch => {
  const merged: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    if (key === 'id') continue;
    if (key === 'data' && value) {
      merged['data'] = { ...((merged['data'] as object) ?? {}), ...(value as object) };
    } else if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as TPatch;
};

/**
 * Dedupes patches by id (merging them) and resolves each merged `data` against
 * the entity's current `data`, so ng-diagram receives a full object — its
 * update API expects complete `data`, not partial patches.
 */
export const resolveUpdates = <
  TData extends object,
  TPatch extends { id: string; data?: Partial<TData> },
>(
  updates: readonly TPatch[],
  getById: (id: string) => { data?: TData } | null,
): TPatch[] => {
  const byId = new Map<string, TPatch>();

  for (const update of updates) {
    const existing = byId.get(update.id);
    byId.set(update.id, existing ? mergePatch(existing, update) : { ...update });
  }

  for (const [id, entry] of byId) {
    if (entry.data) {
      const current = getById(id);
      if (current?.data) {
        entry.data = { ...current.data, ...entry.data };
      }
    }
  }

  return [...byId.values()];
};
