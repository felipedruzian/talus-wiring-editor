import { type Edge, type Node } from 'ng-diagram';
import { type Orientation } from './path-types';

export const portSideToOrientation = (
  side: 'top' | 'right' | 'bottom' | 'left',
): Orientation => (side === 'left' || side === 'right' ? 'horizontal' : 'vertical');

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
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);

  const sourcePort = sourceNode?.measuredPorts?.find((p) => p.id === edge.sourcePort);
  const targetPort = targetNode?.measuredPorts?.find((p) => p.id === edge.targetPort);

  return {
    source: sourcePort ? portSideToOrientation(sourcePort.side) : 'horizontal',
    target: targetPort ? portSideToOrientation(targetPort.side) : 'horizontal',
  };
};
