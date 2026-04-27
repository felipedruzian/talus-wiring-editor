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
      id: 'amp-1',
      type: NodeTemplateType.DeviceNode,
      position: { x: 80, y: 160 },
      data: {
        type: 'device',
        deviceId: 'AMP-01',
        manufacturer: 'Crown',
        model: 'XLi 1500',
        category: 'amplifier',
        location: 'Rack 1U-3',
        ports: [
          { id: 'in-a', label: 'IN A', direction: 'input', connectorType: 'XLR' },
          { id: 'in-b', label: 'IN B', direction: 'input', connectorType: 'XLR' },
          { id: 'out-a', label: 'OUT A', direction: 'output', connectorType: 'Speakon' },
          { id: 'out-b', label: 'OUT B', direction: 'output', connectorType: 'Speakon' },
        ],
      },
    },
    {
      id: 'spk-1',
      type: NodeTemplateType.DeviceNode,
      position: { x: 520, y: 160 },
      data: {
        type: 'device',
        deviceId: 'SPK-01',
        manufacturer: 'JBL',
        model: 'EON615',
        category: 'loudspeaker',
        location: 'Stage Left',
        ports: [
          { id: 'in', label: 'IN', direction: 'input', connectorType: 'Speakon' },
        ],
      },
    },
  ],
  edges: [
    {
      id: 'wire-1',
      type: EdgeTemplateType.WireEdge,
      source: 'amp-1',
      sourcePort: 'out-a',
      target: 'spk-1',
      targetPort: 'in',
      data: { type: 'wire', wireId: 'W-001', wireType: 'speaker' },
    },
  ],
};
