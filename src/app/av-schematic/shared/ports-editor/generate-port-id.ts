export const generatePortId = (): string =>
  'P-' + Math.random().toString(36).slice(2, 8).toUpperCase();
