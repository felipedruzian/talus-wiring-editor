import { type Node, type Point, type Port } from 'ng-diagram';

// `port.side` is frozen at registration time and doesn't update when an
// ng-diagram-port with the same id is destroyed in one @for and recreated in
// another with a different `side` attribute (e.g. on a direction flip). We
// pick the side from the measured X instead — AV schematic ports are only
// ever left/right so a midpoint test is unambiguous regardless of Y.
const inferHorizontalPortSide = (port: Port, node: Node): 'left' | 'right' => {
  const portCenterX = (port.position?.x ?? 0) + (port.size?.width ?? 0) / 2;
  const nodeMidX = (node.size?.width ?? 0) / 2;
  return portCenterX < nodeMidX ? 'left' : 'right';
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

export const getPortFlowPosition = (node: Node, portId: string | undefined): Point | null => {
  if (!portId) return null;
  const port = node.measuredPorts?.find((p) => p.id === portId);
  if (!port) return null;
  return portCenter(port, node);
};
