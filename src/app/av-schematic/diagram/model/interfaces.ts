export enum NodeTemplateType {
  DeviceNode = 'deviceNode',
}

export enum EdgeTemplateType {
  WireEdge = 'wireEdge',
}

export interface DeviceNodeData {
  type: 'device';
  label?: string;
}

export interface WireEdgeData {
  type: 'wire';
}

export type AvSchematicNodeData = DeviceNodeData;
export type AvSchematicEdgeData = WireEdgeData;
