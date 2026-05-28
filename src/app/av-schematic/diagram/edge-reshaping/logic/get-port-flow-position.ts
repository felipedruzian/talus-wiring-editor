import { type Node, type Point, type Port } from 'ng-diagram';

/**
 * Picks left vs right by whichever half of the node the port's X sits in.
 * Used in place of `port.side` because that field doesn't refresh when an
 * Angular `<ng-diagram-port>` element with the same id is destroyed in one
 * block and recreated in another with a different `side` attribute (e.g.
 * when a port flips from input to output). `position` updates correctly.
 *
 * AV schematic only uses horizontal ports — restricting inference to
 * left/right avoids the misclassification you'd get from a 4-way "closest
 * side" check, where a left-column port reordered to the top or bottom of
 * its column would be picked as 'top'/'bottom' because vertical distance to
 * the node edge becomes smaller than horizontal distance to the side.
 */
const inferHorizontalPortSide = (port: Port, node: Node): 'left' | 'right' => {
  const portCx = (port.position?.x ?? 0) + (port.size?.width ?? 0) / 2;
  const nodeMidX = (node.size?.width ?? 0) / 2;
  return portCx < nodeMidX ? 'left' : 'right';
};

const portCenter = (port: Port, node: Node): Point => {
  const x = (port.position?.x ?? 0) + node.position.x;
  const y = (port.position?.y ?? 0) + node.position.y;
  const width = port.size?.width ?? 0;
  const height = port.size?.height ?? 0;

  return inferHorizontalPortSide(port, node) === 'left'
    ? { x, y: y + height / 2 }
    : { x: x + width, y: y + height / 2 };
};

/**
 * Local replica of ng-diagram's `getPortFlowPosition` (not yet in the public
 * API). Returns the port's flow-coordinate center, or null if the port can't
 * be resolved on the given node. Does not handle node rotation — AV schematic
 * nodes don't rotate; if that changes, expand to match
 * `core/src/utils/get-port-flow-position.ts` upstream.
 *
 * Uses the position-inferred side instead of `port.side` to dodge the
 * stale-side issue when a port flips direction. See `inferPortSide` above.
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
