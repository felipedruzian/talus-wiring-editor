import { type Edge, type Node } from 'ng-diagram';
import {
  EdgeTemplateType,
  NodeTemplateType,
  type AvSchematicEdgeData,
  type AvSchematicNodeData,
} from './model/interfaces';

export const diagramModel: {
  nodes: Node<AvSchematicNodeData>[];
  edges: Edge<AvSchematicEdgeData>[];
} = {
  nodes: [
    {
      id: 'device-1',
      type: NodeTemplateType.DeviceNode,
      position: { x: 120, y: 200 },
      data: { type: 'device', label: 'Source' },
    },
    {
      id: 'device-2',
      type: NodeTemplateType.DeviceNode,
      position: { x: 480, y: 200 },
      data: { type: 'device', label: 'Display' },
    },
  ],
  edges: [
    {
      id: 'wire-1',
      type: EdgeTemplateType.WireEdge,
      source: 'device-1',
      sourcePort: 'port-out',
      target: 'device-2',
      targetPort: 'port-in',
      data: { type: 'wire' },
    },
  ],
};
