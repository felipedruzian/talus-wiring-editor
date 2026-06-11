import { type Edge, type Node } from 'ng-diagram';
import { type DeviceNodeData, type WireEdgeData } from './interfaces';

export function isDeviceNodeData(data: unknown): data is DeviceNodeData {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === 'device';
}

export function isDeviceNode(node: Node | null | undefined): node is Node<DeviceNodeData> {
  return !!node && isDeviceNodeData(node.data);
}

export function isWireEdgeData(data: unknown): data is WireEdgeData {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === 'wire';
}

export function isWireEdge(edge: Edge | null | undefined): edge is Edge<WireEdgeData> {
  return !!edge && isWireEdgeData(edge.data);
}
