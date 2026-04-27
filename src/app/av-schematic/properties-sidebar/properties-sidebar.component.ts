import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DeviceFormComponent } from './components/device-form/device-form.component';
import {
  ON_DEVICE_FIELD_CHANGE,
  type DeviceFieldChange,
} from './components/device-form/device-form.mappers';
import { DeviceFormService } from './components/device-form/device-form.service';
import { SidebarHeaderComponent } from './components/sidebar-header/sidebar-header.component';
import { SidebarPlaceholderComponent } from './components/sidebar-placeholder/sidebar-placeholder.component';
import { WireFormComponent } from './components/wire-form/wire-form.component';
import {
  ON_WIRE_FIELD_CHANGE,
  type WireFieldChange,
} from './components/wire-form/wire-form.mappers';
import { WireFormService } from './components/wire-form/wire-form.service';
import { ElementMutationService } from './element-mutation.service';
import { PropertiesSidebarService } from './properties-sidebar.service';

@Component({
  selector: 'app-properties-sidebar',
  imports: [
    SidebarHeaderComponent,
    SidebarPlaceholderComponent,
    DeviceFormComponent,
    WireFormComponent,
  ],
  providers: [
    DeviceFormService,
    WireFormService,
    {
      provide: ON_DEVICE_FIELD_CHANGE,
      useFactory: () => {
        const mutation = inject(ElementMutationService);
        return (change: DeviceFieldChange) => mutation.handleDeviceFieldChange(change);
      },
    },
    {
      provide: ON_WIRE_FIELD_CHANGE,
      useFactory: () => {
        const mutation = inject(ElementMutationService);
        return (change: WireFieldChange) => mutation.handleWireFieldChange(change);
      },
    },
  ],
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
