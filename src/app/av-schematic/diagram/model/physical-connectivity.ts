import { type Edge, type Node } from 'ng-diagram';
import { isBoardHoleAvailable } from './board-geometry';
import { parseHolePortId, parseTracePortId } from './board-ports';
import { traceForHole, traceHoles } from './board-trace';
import { devicePortHoles } from './footprint-geometry';
import { isBoardNode, isDeviceNode } from './guards';
import { type BoardHole } from './interfaces';

/**
 * Where a diagram endpoint physically lands, resolved through
 * pin -> hole -> trace.
 *
 * `netLabel` is deliberately *not* called `netId`: copper carries a **name**
 * the person wrote on the board ("GND_SYS"), never the identity of a net. In
 * format v2 a net's identity is derived from the conductor graph
 * (`net-grouping.ts`) and nowhere else, so this label is only ever used as a
 * naming hint for a brand-new net and as evidence in
 * `physical-diagnostics.ts`. Nothing here rewrites an imported net.
 */
export interface PhysicalEndpoint {
  boardId: string;
  hole: BoardHole;
  traceId?: string;
  traceLabel?: string;
  /** Net *name* written on the copper, when its trace declares one. */
  netLabel?: string;
}

export interface PhysicalEdgeNet {
  /** The single copper net name both ends agree on, when there is one. */
  netLabel?: string;
  /** Two or more distinct copper net names met by one conductor: a short. */
  conflict: string[];
}

/** Resolve a live diagram endpoint through pin -> hole -> trace -> copper label. */
export function physicalEndpoint(
  nodes: readonly Node[],
  nodeId: string | undefined,
  portId: string | undefined,
): PhysicalEndpoint | null {
  if (!nodeId || !portId) return null;
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return null;

  if (isBoardNode(node)) {
    const hole = parseHolePortId(portId);
    if (hole) {
      if (!isBoardHoleAvailable(node.data, hole)) return null;
      return endpointAtHole(node.data.boardId, hole, traceForHole(node.data, hole));
    }
    const traceId = parseTracePortId(portId);
    const trace = node.data.traces?.find((candidate) => candidate.id === traceId);
    const traceHole = trace ? traceHoles(trace)[0] : undefined;
    return trace && traceHole
      ? {
          boardId: node.data.boardId,
          hole: traceHole,
          traceId: trace.id,
          traceLabel: trace.label,
          netLabel: trace.net,
        }
      : null;
  }

  if (!isDeviceNode(node)) return null;
  const boardId = node.data.placement?.boardId ?? node.data.boardId;
  if (!boardId) return null;
  const board = nodes
    .filter(isBoardNode)
    .find((candidate) => candidate.data.boardId === boardId);
  const hole = devicePortHoles(node.data).get(portId);
  if (!board || !hole) return null;
  return endpointAtHole(board.data.boardId, hole, traceForHole(board.data, hole));
}

export function physicalNetLabelForEndpoint(
  nodes: readonly Node[],
  nodeId: string | undefined,
  portId: string | undefined,
): string | undefined {
  return physicalEndpoint(nodes, nodeId, portId)?.netLabel;
}

/**
 * The copper net name a conductor would carry, or an explicit short when its
 * two ends sit on copper that already carries two different names.
 *
 * Refusing that connection is the only place physical copper is allowed to
 * *veto* an edit; it never rewrites a net that already exists.
 */
export function physicalEdgeNet(
  nodes: readonly Node[],
  edge: Pick<Edge, 'source' | 'sourcePort' | 'target' | 'targetPort'>,
): PhysicalEdgeNet {
  const values = [
    physicalNetLabelForEndpoint(nodes, edge.source, edge.sourcePort),
    physicalNetLabelForEndpoint(nodes, edge.target, edge.targetPort),
  ].filter((value): value is string => value !== undefined);
  const unique = [...new Set(values)];
  return unique.length > 1 ? { conflict: unique } : { netLabel: unique[0], conflict: [] };
}

/**
 * The net name a *new* conductor should be born with.
 *
 * Only ever fills a blank: an edge that already carries a name (typically one
 * an import wrote) keeps it, and the divergence is reported by
 * `physical-diagnostics.ts` instead of being silently overwritten.
 */
export function initialNetNameFromCopper(
  storedNetName: string | undefined,
  physical: PhysicalEdgeNet,
): string | undefined {
  if (storedNetName) return storedNetName;
  return physical.conflict.length > 0 ? undefined : physical.netLabel;
}

function endpointAtHole(
  boardId: string,
  hole: BoardHole,
  trace: ReturnType<typeof traceForHole>,
): PhysicalEndpoint {
  return {
    boardId,
    hole,
    traceId: trace?.id,
    traceLabel: trace?.label,
    netLabel: trace?.net,
  };
}
