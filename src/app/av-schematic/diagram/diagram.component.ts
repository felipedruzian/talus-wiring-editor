import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  DiagramInitEvent,
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramEdgeTemplateMap,
  NgDiagramNodeTemplateMap,
  NgDiagramViewportService,
  type Edge,
  type NgDiagramConfig,
  type SelectionGestureEndedEvent,
} from 'ng-diagram';
import { AV_SCHEMATIC_CONFIG } from '../av-schematic.config';
import { PropertiesSidebarService } from '../properties-sidebar/properties-sidebar.service';
import { isDeviceNode } from './model/guards';
import { EdgeTemplateType, NodeTemplateType } from './model/interfaces';
import { NodeVisibilityConfigService } from './node-visibility/node-visibility-config.service';
import { DeviceNodeComponent } from './node/device-node.component';
import { WireEdgeComponent } from './wire-edge.component';
import { diagramModel } from './data';

@Component({
  selector: 'app-diagram',
  imports: [NgDiagramComponent, NgDiagramBackgroundComponent],
  templateUrl: './diagram.component.html',
  styleUrl: './diagram.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagramComponent {
  private readonly avConfig = inject(AV_SCHEMATIC_CONFIG);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly sidebarService = inject(PropertiesSidebarService);
  private readonly nodeVisibilityConfigService = inject(NodeVisibilityConfigService);

  config = {
    linking: {
      finalEdgeDataBuilder: (edge: Edge) => ({
        ...edge,
        type: EdgeTemplateType.WireEdge,
      }),
    },
    watermarkPosition: 'bottom-left',
    zIndex: {
      elevateOnSelection: false,
    },
  } satisfies NgDiagramConfig;

  nodeTemplateMap = new NgDiagramNodeTemplateMap([
    [NodeTemplateType.DeviceNode, DeviceNodeComponent],
  ]);

  edgeTemplateMap = new NgDiagramEdgeTemplateMap([
    [EdgeTemplateType.WireEdge, WireEdgeComponent],
  ]);

  model = initializeModel(diagramModel);

  onDiagramInit(_: DiagramInitEvent): void {
    this.zoomToFit();
  }

  onSelectionGestureEnded(event: SelectionGestureEndedEvent): void {
    const hasDeviceNodes = event.nodes.some(isDeviceNode);
    if (hasDeviceNodes) {
      this.sidebarService.expandSidebar();
    }
  }

  private zoomToFit(): void {
    const insets = this.nodeVisibilityConfigService.getViewportInsets();
    const pad = this.avConfig.viewport.zoomToFitPadding;
    this.viewportService.zoomToFit({
      padding: [
        (insets.top ?? 0) + pad,
        (insets.right ?? 0) + pad,
        (insets.bottom ?? 0) + pad,
        (insets.left ?? 0) + pad,
      ],
    });
  }
}
