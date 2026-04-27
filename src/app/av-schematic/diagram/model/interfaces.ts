export enum NodeTemplateType {
  DeviceNode = 'deviceNode',
}

export enum EdgeTemplateType {
  WireEdge = 'wireEdge',
}

export type PortDirection = 'input' | 'output';

export interface DevicePort {
  id: string;
  label: string;
  direction: PortDirection;
  connectorType?: string;
}

export interface DeviceNodeData {
  type: 'device';
  deviceId: string;
  manufacturer: string;
  model: string;
  category?: string;
  location?: string;
  ports: DevicePort[];
}

export interface WireEdgeData {
  type: 'wire';
  wireId: string;
  wireType?: string;
}

export type AvSchematicNodeData = DeviceNodeData;
export type AvSchematicEdgeData = WireEdgeData;
