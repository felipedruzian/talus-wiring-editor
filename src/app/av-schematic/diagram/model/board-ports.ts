import { type BoardHole } from './interfaces';

/**
 * Port ids on a board node.
 *
 * A board is an ordinary ng-diagram node, so "a wire lands on hole L2-C5" is
 * expressed the only way the engine understands: an edge whose `target` is the
 * board node and whose `targetPort` is a port id. Encoding the hole address
 * into the id (rather than keeping a side table) means the association is
 * carried by the edge itself — so it round-trips through save/reload for free,
 * with no extra field to keep in sync.
 *
 * Two shapes exist:
 *   `hole:<row>:<col>`  a single hole
 *   `trace:<traceId>`   the whole trilha, anchored on its first hole
 */

export const HOLE_PORT_PREFIX = 'hole:';
export const TRACE_PORT_PREFIX = 'trace:';

export function holePortId(hole: BoardHole): string {
  return `${HOLE_PORT_PREFIX}${hole.row}:${hole.col}`;
}

export function tracePortId(traceId: string): string {
  return `${TRACE_PORT_PREFIX}${traceId}`;
}

export function isHolePortId(portId: string): boolean {
  return portId.startsWith(HOLE_PORT_PREFIX);
}

export function isTracePortId(portId: string): boolean {
  return portId.startsWith(TRACE_PORT_PREFIX);
}

export function isBoardPortId(portId: string): boolean {
  return isHolePortId(portId) || isTracePortId(portId);
}

/** Parses `hole:<row>:<col>` back into an address. Returns null for anything else. */
export function parseHolePortId(portId: string): BoardHole | null {
  if (!isHolePortId(portId)) return null;
  const match = /^(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(portId.slice(HOLE_PORT_PREFIX.length));
  if (!match) return null;
  const row = Number(match[1]);
  const col = Number(match[2]);
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col)) return null;
  return { row, col };
}

/** Parses `trace:<traceId>` back into the trace id. Returns null for anything else. */
export function parseTracePortId(portId: string): string | null {
  if (!isTracePortId(portId)) return null;
  const traceId = portId.slice(TRACE_PORT_PREFIX.length);
  return traceId.length > 0 ? traceId : null;
}
