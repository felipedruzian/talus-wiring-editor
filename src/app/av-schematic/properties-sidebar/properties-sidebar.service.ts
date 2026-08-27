import { computed, inject, Injectable, signal } from '@angular/core';
import { NgDiagramModelService, NgDiagramSelectionService, type Edge, type Node } from 'ng-diagram';
import { isDeviceNode, isJunctionNode, isWireEdge } from '../diagram/model/guards';
import {
  type DeviceNodeData,
  type JunctionNodeData,
  type WireEdgeData,
} from '../diagram/model/interfaces';

export type SidebarState = 'empty' | 'single-node' | 'single-junction' | 'single-edge' | 'multi';

export interface WireEndpointInfo {
  deviceId: string;
  portLabel: string;
}

export interface SelectedWireDetails {
  edge: Edge<WireEdgeData>;
  source: WireEndpointInfo | null;
  target: WireEndpointInfo | null;
}

/** Manages sidebar visibility and exposes selection-derived data. */
@Injectable()
export class PropertiesSidebarService {
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly modelService = inject(NgDiagramModelService);

  readonly isExpanded = signal(false);

  readonly selectedDeviceNodes = computed<Node<DeviceNodeData>[]>(() =>
    this.selectionService.selection().nodes.filter(isDeviceNode),
  );

  readonly selectedWireEdges = computed<Edge<WireEdgeData>[]>(() =>
    this.selectionService.selection().edges.filter(isWireEdge),
  );

  readonly selectedJunctionNodes = computed<Node<JunctionNodeData>[]>(() =>
    this.selectionService.selection().nodes.filter(isJunctionNode),
  );

  readonly selectedNode = computed<Node<DeviceNodeData> | undefined>(() =>
    this.selectedDeviceNodes().at(0),
  );

  readonly selectedEdge = computed<Edge<WireEdgeData> | undefined>(() =>
    this.selectedWireEdges().at(0),
  );

  readonly selectedJunction = computed<Node<JunctionNodeData> | undefined>(() =>
    this.selectedJunctionNodes().at(0),
  );

  readonly sidebarState = computed<SidebarState>(() => {
    const nodeCount = this.selectedDeviceNodes().length;
    const junctionCount = this.selectedJunctionNodes().length;
    const edgeCount = this.selectedWireEdges().length;
    const total = nodeCount + junctionCount + edgeCount;
    if (total === 0) return 'empty';
    if (total > 1) return 'multi';
    if (nodeCount === 1) return 'single-node';
    if (junctionCount === 1) return 'single-junction';
    return 'single-edge';
  });

  readonly selectedWireDetails = computed<SelectedWireDetails | null>(() => {
    const edge = this.selectedEdge();
    if (!edge) return null;
    const nodes = this.modelService.nodes();
    return {
      edge,
      source: this.resolveEndpoint(nodes, edge.source, edge.sourcePort),
      target: this.resolveEndpoint(nodes, edge.target, edge.targetPort),
    };
  });

  expandSidebar(): void {
    this.isExpanded.set(true);
  }

  toggleSidebarVisibility(): void {
    this.isExpanded.update((v) => !v);
  }

  private resolveEndpoint(
    nodes: readonly Node[],
    nodeId: string | undefined,
    portId: string | undefined,
  ): WireEndpointInfo | null {
    if (!nodeId) return null;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    if (isJunctionNode(node)) {
      return {
        deviceId: node.data.label,
        portLabel: portId ?? 'junção',
      };
    }
    if (!isDeviceNode(node)) return null;
    const port = portId ? node.data.ports.find((candidate) => candidate.id === portId) : undefined;
    return {
      deviceId: node.data.deviceId,
      portLabel: port?.label ?? portId ?? '',
    };
  }
}
