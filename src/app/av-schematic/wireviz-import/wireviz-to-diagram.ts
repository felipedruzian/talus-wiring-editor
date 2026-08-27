import { type Edge, type Node } from 'ng-diagram';
import {
  EdgeTemplateType,
  type DeviceNodeData,
  type WireEdgeData,
} from '../diagram/model/interfaces';
import { resolveWireColor } from './wireviz-colors';
import { type WireVizDocument } from './wireviz-model';

/** Maps a WireViz connector name (as declared in the fixture) to the diagram node id representing it. */
export type WireVizPlacement = Readonly<Record<string, string>>;

export class WireVizImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WireVizImportError';
  }
}

/**
 * Turns a parsed WireViz document's `connections` into ng-diagram wire
 * edges, resolving each pin name to the matching port on the placed node
 * (matched by `DevicePort.label`) and each cable's wire color to a CSS
 * color. One edge per connection; `wireId` is the cable name (a multi-wire
 * cable's separate conductors share it, same as WireViz). The edge `id` and
 * `netId` are derived from cable name **and** wire index, so they stay
 * unique and deterministic even when one multicolored cable is referenced by
 * several connections (one per conductor) — using the cable name alone would
 * collide both ng-diagram's edge id and the electrical net id across those
 * conductors.
 */
export function wirevizConnectionsToEdges(
  doc: WireVizDocument,
  placement: WireVizPlacement,
  nodesById: ReadonlyMap<string, Node<DeviceNodeData>>,
): Edge<WireEdgeData>[] {
  const cablesByName = new Map(doc.cables.map((c) => [c.name, c]));

  return doc.connections.map((connection) => {
    const sourceNodeId = resolveNodeId(placement, connection.source.connector);
    const targetNodeId = resolveNodeId(placement, connection.target.connector);
    const sourceNode = resolveNode(nodesById, sourceNodeId, connection.source.connector);
    const targetNode = resolveNode(nodesById, targetNodeId, connection.target.connector);
    const sourcePort = resolvePortByLabel(sourceNode, connection.source.pin);
    const targetPort = resolvePortByLabel(targetNode, connection.target.pin);

    const cable = cablesByName.get(connection.cable.name);
    const colorCode = cable?.colors[connection.cable.wireIndex - 1];
    const { color, colorCode: normalizedColorCode } = resolveWireColor(colorCode);
    const wireKey = `${connection.cable.name}-${connection.cable.wireIndex}`;

    const data: WireEdgeData = {
      type: 'wire',
      wireId: connection.cable.name,
      wireType: 'control',
      netId: `net-${wireKey}`,
      color,
      colorCode: normalizedColorCode,
    };

    return {
      id: `wire-${wireKey}`,
      type: EdgeTemplateType.WireEdge,
      source: sourceNodeId,
      sourcePort: sourcePort.id,
      target: targetNodeId,
      targetPort: targetPort.id,
      data,
    } satisfies Edge<WireEdgeData>;
  });
}

function resolveNodeId(placement: WireVizPlacement, connectorName: string): string {
  const nodeId = placement[connectorName];
  if (!nodeId) {
    throw new WireVizImportError(`no diagram node placed for WireViz connector "${connectorName}"`);
  }
  return nodeId;
}

function resolveNode(
  nodesById: ReadonlyMap<string, Node<DeviceNodeData>>,
  nodeId: string,
  connectorName: string,
): Node<DeviceNodeData> {
  const node = nodesById.get(nodeId);
  if (!node) {
    throw new WireVizImportError(
      `WireViz connector "${connectorName}" is placed on node "${nodeId}", which does not exist`,
    );
  }
  return node;
}

function resolvePortByLabel(node: Node<DeviceNodeData>, pinLabel: string) {
  const port = node.data.ports.find((p) => p.label === pinLabel);
  if (!port) {
    throw new WireVizImportError(
      `pin "${pinLabel}" not found among node "${node.id}" ports (${node.data.ports.map((p) => p.label).join(', ')})`,
    );
  }
  return port;
}
