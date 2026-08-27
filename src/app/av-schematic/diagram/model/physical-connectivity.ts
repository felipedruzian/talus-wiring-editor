import { type Edge, type Node } from 'ng-diagram';
import { isBoardHoleAvailable } from './board-geometry';
import { parseHolePortId, parseTracePortId } from './board-ports';
import { traceForHole, traceHoles } from './board-trace';
import { devicePortHoles } from './footprint-geometry';
import { isBoardNode, isDeviceNode } from './guards';
import { type BoardHole } from './interfaces';

export interface PhysicalEndpoint {
  boardId: string;
  hole: BoardHole;
  traceId?: string;
  traceLabel?: string;
  netId?: string;
}

export interface PhysicalEdgeNet {
  netId?: string;
  conflict: string[];
}

/**
 * Reconcile stored edge data after a physical endpoint moves. A current copper
 * net wins; leaving copper clears only the value that was previously derived,
 * preserving unrelated authored net data.
 */
export function reconciledPhysicalNetId(
  storedNetId: string | undefined,
  previousPhysicalNetId: string | undefined,
  current: PhysicalEdgeNet,
): string | undefined {
  if (current.conflict.length > 0) return storedNetId;
  if (current.netId !== undefined) return current.netId;
  return previousPhysicalNetId !== undefined && storedNetId === previousPhysicalNetId
    ? undefined
    : storedNetId;
}

/** Resolve a live diagram endpoint through pin -> hole -> trace -> net. */
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
          netId: trace.net,
        }
      : null;
  }

  if (!isDeviceNode(node) || !node.data.placement) return null;
  const board = nodes
    .filter(isBoardNode)
    .find((candidate) => candidate.data.boardId === node.data.placement?.boardId);
  const hole = devicePortHoles(node.data).get(portId);
  if (!board || !hole) return null;
  return endpointAtHole(board.data.boardId, hole, traceForHole(board.data, hole));
}

export function physicalNetForEndpoint(
  nodes: readonly Node[],
  nodeId: string | undefined,
  portId: string | undefined,
): string | undefined {
  return physicalEndpoint(nodes, nodeId, portId)?.netId;
}

/** Infer one physical edge net, reporting an explicit short when endpoints disagree. */
export function physicalEdgeNet(
  nodes: readonly Node[],
  edge: Pick<Edge, 'source' | 'sourcePort' | 'target' | 'targetPort'>,
): PhysicalEdgeNet {
  const values = [
    physicalNetForEndpoint(nodes, edge.source, edge.sourcePort),
    physicalNetForEndpoint(nodes, edge.target, edge.targetPort),
  ].filter((value): value is string => value !== undefined);
  const unique = [...new Set(values)];
  return unique.length > 1 ? { conflict: unique } : { netId: unique[0], conflict: [] };
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
    netId: trace?.net,
  };
}
