/**
 * Generates `<prefix>-<random>` ids (~30 bits of entropy). Good enough for
 * client-side per-session uniqueness inside a single diagram; not for
 * cross-session or cross-user identity.
 */
export const randomShortId = (prefix: string): string =>
  prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
