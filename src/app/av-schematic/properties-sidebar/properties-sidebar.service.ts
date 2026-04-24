import { computed, inject, Injectable, signal } from '@angular/core';
import { NgDiagramSelectionService, type Node } from 'ng-diagram';
import { isDeviceNode } from '../diagram/model/guards';
import { type DeviceNodeData } from '../diagram/model/interfaces';

/** Manages sidebar visibility and exposes selection-derived data. */
@Injectable()
export class PropertiesSidebarService {
  private readonly selectionService = inject(NgDiagramSelectionService);

  readonly isExpanded = signal(false);

  readonly selectedDeviceNodes = computed<Node<DeviceNodeData>[]>(() =>
    this.selectionService.selection().nodes.filter(isDeviceNode),
  );

  readonly selectedNode = computed<Node<DeviceNodeData> | undefined>(() =>
    this.selectedDeviceNodes().at(0),
  );

  readonly sidebarState = computed<'empty' | 'single' | 'multi'>(() => {
    const count = this.selectedDeviceNodes().length;
    if (count === 0) return 'empty';
    if (count > 1) return 'multi';
    return 'single';
  });

  expandSidebar(): void {
    this.isExpanded.set(true);
  }

  toggleSidebarVisibility(): void {
    this.isExpanded.update((v) => !v);
  }
}
