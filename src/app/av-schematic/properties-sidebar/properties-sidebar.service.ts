import { computed, inject, Injectable, signal } from '@angular/core';
import { NgDiagramModelService, NgDiagramSelectionService, type Edge, type Node } from 'ng-diagram';
import { isDeviceNode, isJunctionNode, isWireEdge } from '../diagram/model/guards';
import {
  type DeviceNodeData,
  type JunctionNodeData,
  type WireEdgeData,
} from '../diagram/model/interfaces';
import { describeWireEndpoints, type WireEndpointInfo } from '../diagram/model/wire-endpoints';

export type SidebarState = 'empty' | 'single-node' | 'single-junction' | 'single-edge' | 'multi';

// Re-exported so existing consumers keep their import path.
export type { WireEndpointInfo } from '../diagram/model/wire-endpoints';

export interface SelectedWireDetails {
  edge: Edge<WireEdgeData>;
  source: WireEndpointInfo | null;
  target: WireEndpointInfo | null;
  /** Number of physical conductors selected by a net highlight. */
  netSize: number;
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
    const { source, target } = describeWireEndpoints(this.modelService.nodes(), edge);
    return {
      edge,
      source,
      target,
      netSize: this.countNetMembers(edge.data.netId),
    };
  });

  expandSidebar(): void {
    this.isExpanded.set(true);
  }

  toggleSidebarVisibility(): void {
    this.isExpanded.update((v) => !v);
  }

  private countNetMembers(netId: string | undefined): number {
    if (!netId) return 0;
    return this.modelService
      .edges()
      .filter((edge) => isWireEdge(edge) && edge.data.netId === netId).length;
  }
}
