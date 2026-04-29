import { type Node, type Point, type Port } from 'ng-diagram';

const portCenter = (port: Port, node: Node): Point => {
  const x = (port.position?.x ?? 0) + node.position.x;
  const y = (port.position?.y ?? 0) + node.position.y;
  const w = port.size?.width ?? 0;
  const h = port.size?.height ?? 0;

  switch (port.side) {
    case 'left':
      return { x, y: y + h / 2 };
    case 'top':
      return { x: x + w / 2, y };
    case 'bottom':
      return { x: x + w / 2, y: y + h };
    case 'right':
      return { x: x + w, y: y + h / 2 };
  }
};

/**
 * Local replica of ng-diagram's `getPortFlowPosition` (not yet in the public
 * API). Returns the port's flow-coordinate center, or null if the port can't
 * be resolved on the given node. Does not handle node rotation — AV schematic
 * nodes don't rotate; if that changes, expand to match
 * `core/src/utils/get-port-flow-position.ts` upstream.
 */
export const getPortFlowPosition = (
  node: Node,
  portId: string | undefined,
): Point | null => {
  if (!portId) return null;
  const port = node.measuredPorts?.find((p) => p.id === portId);
  if (!port) return null;
  return portCenter(port, node);
};
