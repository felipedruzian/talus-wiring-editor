/**
 * Subset of the WireViz/DIN 47100 wire color abbreviations used by the
 * tracer-bullet fixture. Extend as new fixtures need more codes — this is
 * deliberately not the full WireViz color table.
 */
export const WIREVIZ_COLOR_CODES: Readonly<Record<string, string>> = {
  BK: '#1a1a1a',
  WH: '#f5f5f5',
  GY: '#8c8c8c',
  PK: '#f4a6c6',
  RD: '#e2231a',
  OR: '#f2820d',
  YE: '#f7d417',
  OL: '#7d7f00',
  GN: '#2fa93c',
  TQ: '#2fb5a0',
  BU: '#1e6fd9',
  VT: '#8e3fc9',
  BN: '#7a4a1e',
};

export interface ResolvedWireColor {
  color?: string;
  colorCode?: string;
}

/** Resolves a WireViz color code to a CSS color, preserving the original code. */
export function resolveWireColor(code: string | undefined): ResolvedWireColor {
  if (!code) return {};
  const upper = code.toUpperCase();
  return { color: WIREVIZ_COLOR_CODES[upper], colorCode: upper };
}
