import { type Edge, type Node } from 'ng-diagram';
import { isDeviceNode, isJunctionNode } from './guards';
import { junctionTapIndex } from './canonical-project';

/** A wire end, described the way both the sidebar and the canvas chip show it. */
export interface WireEndpointInfo {
  deviceId: string;
  portLabel: string;
}

export interface WireEndpoints {
  source: WireEndpointInfo | null;
  target: WireEndpointInfo | null;
}

/**
 * Resolve one wire end to the device + port labels a human reads.
 *
 * Null for a dangling end (no node), for an endpoint kind not represented by
 * this slice, or for a node that is not in `nodes`. The device/junction split
 * deliberately leaves room for board holes and traces without changing the
 * wire-inspection callers when those endpoint kinds arrive.
 */
export const describeWireEndpoint = (
  nodes: readonly Node[],
  nodeId: string | undefined,
  portId: string | undefined,
): WireEndpointInfo | null => {
  if (!nodeId) return null;
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return null;
  if (isJunctionNode(node)) {
    const tap = junctionTapIndex(portId);
    return {
      deviceId: node.data.label,
      portLabel: tap === undefined ? (portId ?? '') : `tap ${tap + 1}`,
    };
  }
  if (!isDeviceNode(node)) return null;
  const port = portId ? node.data.ports.find((p) => p.id === portId) : undefined;
  return { deviceId: node.data.deviceId, portLabel: port?.label ?? portId ?? '' };
};

/**
 * Both ends of a wire. Single source of truth for "where does this wire go",
 * shared by the properties sidebar and the on-canvas inspection chip so the two
 * can never disagree.
 */
export const describeWireEndpoints = (
  nodes: readonly Node[],
  edge: Pick<Edge, 'source' | 'sourcePort' | 'target' | 'targetPort'>,
): WireEndpoints => ({
  source: describeWireEndpoint(nodes, edge.source, edge.sourcePort),
  target: describeWireEndpoint(nodes, edge.target, edge.targetPort),
});

/** "NANO-1 x D9", or an em dash when the end is dangling. */
export const formatWireEndpoint = (endpoint: WireEndpointInfo | null): string => {
  if (!endpoint) return '—';
  return endpoint.portLabel ? `${endpoint.deviceId} · ${endpoint.portLabel}` : endpoint.deviceId;
};
