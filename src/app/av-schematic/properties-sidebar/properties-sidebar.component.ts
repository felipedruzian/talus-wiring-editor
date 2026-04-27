import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ElementMutationService } from './element-mutation.service';
import { PropertiesSidebarService } from './properties-sidebar.service';
import { SidebarHeaderComponent } from './components/sidebar-header/sidebar-header.component';
import { SidebarPlaceholderComponent } from './components/sidebar-placeholder/sidebar-placeholder.component';

@Component({
  selector: 'app-properties-sidebar',
  imports: [SidebarHeaderComponent, SidebarPlaceholderComponent],
  templateUrl: './properties-sidebar.component.html',
  styleUrl: './properties-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.expanded]': 'isExpanded()' },
})
export class PropertiesSidebarComponent {
  private readonly sidebarService = inject(PropertiesSidebarService);
  private readonly elementMutationService = inject(ElementMutationService);

  protected readonly isExpanded = this.sidebarService.isExpanded;
  protected readonly state = this.sidebarService.sidebarState;
  protected readonly selectedNode = this.sidebarService.selectedNode;
  protected readonly selectedWireDetails = this.sidebarService.selectedWireDetails;

  protected onHeaderToggle(): void {
    this.sidebarService.toggleSidebarVisibility();
  }

  protected onRemoveNode(): void {
    const nodeId = this.sidebarService.selectedNode()?.id;
    if (nodeId) {
      this.elementMutationService.removeNode(nodeId);
    }
  }

  protected onRemoveWire(): void {
    const edgeId = this.sidebarService.selectedEdge()?.id;
    if (edgeId) {
      this.elementMutationService.removeEdge(edgeId);
    }
  }
}
