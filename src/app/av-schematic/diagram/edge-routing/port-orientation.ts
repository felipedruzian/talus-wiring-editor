import { type Edge, type Node } from 'ng-diagram';
import { type Orientation } from './path-types';

export const portSideToOrientation = (side: 'top' | 'right' | 'bottom' | 'left'): Orientation =>
  side === 'left' || side === 'right' ? 'horizontal' : 'vertical';

/**
 * Reads the orientation of a single port on a resolved node. Falls back to
 * 'horizontal' when the port cannot be resolved — see `getEdgePortOrientations`
 * for why the fallback is safe for AV schematics. Use this when you already
 * have the node resolved; otherwise call `getEdgePortOrientations` with the
 * full nodes array.
 */
export const getNodePortOrientation = (
  node: Node | undefined,
  portId: string | undefined,
): Orientation => {
  const port = node?.measuredPorts?.find((measuredPort) => measuredPort.id === portId);
  return port ? portSideToOrientation(port.side) : 'horizontal';
};

/**
 * Looks up the source/target port orientations for an edge by reading
 * `Node.measuredPorts` on the connected nodes. Falls back to 'horizontal'
 * when the port (or its node) cannot be resolved — that matches the
 * left/right invariant of AV schematics, which is the safe default until
 * the caller can prove otherwise.
 */
export const getEdgePortOrientations = (
  nodes: readonly Node[],
  edge: Pick<Edge, 'source' | 'target' | 'sourcePort' | 'targetPort'>,
): { source: Orientation; target: Orientation } => {
  const sourceNode = nodes.find((node) => node.id === edge.source);
  const targetNode = nodes.find((node) => node.id === edge.target);

  return {
    source: getNodePortOrientation(sourceNode, edge.sourcePort),
    target: getNodePortOrientation(targetNode, edge.targetPort),
  };
};
