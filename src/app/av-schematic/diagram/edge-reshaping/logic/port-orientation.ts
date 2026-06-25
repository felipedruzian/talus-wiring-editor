import { type Edge, type Node } from 'ng-diagram';
import { type Orientation } from './types';

export const portSideToOrientation = (side: 'top' | 'right' | 'bottom' | 'left'): Orientation =>
  side === 'left' || side === 'right' ? 'horizontal' : 'vertical';

/**
 * Reads the orientation of a single port on a resolved node. Falls back to
 * 'horizontal' when the port cannot be resolved — that matches the left/right
 * invariant of AV schematics, the safe default until the caller can prove
 * otherwise.
 */
export const getNodePortOrientation = (
  node: Node | undefined,
  portId: string | undefined,
): Orientation => {
  const port = node?.measuredPorts?.find((measuredPort) => measuredPort.id === portId);
  return port ? portSideToOrientation(port.side) : 'horizontal';
};

/** Source/target port orientations for an edge, read from the connected nodes. */
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
