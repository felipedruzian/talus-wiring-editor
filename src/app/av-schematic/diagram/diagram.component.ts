import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import {
  DiagramInitEvent,
  initializeModel,
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramEdgeTemplateMap,
  NgDiagramModelService,
  NgDiagramNodeTemplateMap,
  NgDiagramViewportService,
  type Edge,
  type NgDiagramConfig,
  type PaletteItemDroppedEvent,
  type SelectionGestureEndedEvent,
} from 'ng-diagram';
import { AV_SCHEMATIC_CONFIG } from '../av-schematic.config';
import { DiagramExportService } from '../export/diagram-export.service';
import { PropertiesSidebarService } from '../properties-sidebar/properties-sidebar.service';
import { generateDeviceId } from './model/auto-device-id';
import { isDeviceNode, isWireEdge } from './model/guards';
import {
  EdgeTemplateType,
  NodeTemplateType,
  type DeviceNodeData,
  type WireEdgeData,
} from './model/interfaces';
import { NodeVisibilityConfigService } from './node-visibility/node-visibility-config.service';
import { DeviceNodeComponent } from './node/device-node.component';
import { WireEdgeComponent } from './wire-edge.component';
import { diagramModel } from './data';

const generateWireId = (): string =>
  'W-' + Math.random().toString(36).slice(2, 8).toUpperCase();

@Component({
  selector: 'app-diagram',
  imports: [NgDiagramComponent, NgDiagramBackgroundComponent],
  templateUrl: './diagram.component.html',
  styleUrl: './diagram.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagramComponent implements OnInit, OnDestroy {
  private readonly avConfig = inject(AV_SCHEMATIC_CONFIG);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly sidebarService = inject(PropertiesSidebarService);
  private readonly nodeVisibilityConfigService = inject(NodeVisibilityConfigService);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly exportService = inject(DiagramExportService);

  config = {
    edgeRouting: {
      defaultRouting: 'orthogonal',
      orthogonal: {
        firstLastSegmentLength: 80,
        maxCornerRadius: 4,
      },
    },
    linking: {
      temporaryEdgeDataBuilder: (edge: Edge): Edge<WireEdgeData> => ({
        ...edge,
        type: EdgeTemplateType.WireEdge,
        routing: 'polyline',
        sourceArrowhead: undefined,
        targetArrowhead: undefined,
        data: { type: 'wire', wireId: '' },
      }),
      finalEdgeDataBuilder: (edge: Edge): Edge<WireEdgeData> => ({
        ...edge,
        type: EdgeTemplateType.WireEdge,
        routing: undefined,
        sourceArrowhead: undefined,
        targetArrowhead: undefined,
        data: { type: 'wire', wireId: generateWireId() },
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

  ngOnInit(): void {
    this.exportService.register({
      element: this.elementRef,
      modelService: this.modelService,
    });
  }

  ngOnDestroy(): void {
    this.exportService.unregister();
  }

  onDiagramInit(_: DiagramInitEvent): void {
    this.zoomToFit();
  }

  onSelectionGestureEnded(event: SelectionGestureEndedEvent): void {
    const hasDeviceNodes = event.nodes.some(isDeviceNode);
    const hasWireEdges = event.edges.some(isWireEdge);
    if (hasDeviceNodes || hasWireEdges) {
      this.sidebarService.expandSidebar();
    }
  }

  onPaletteItemDropped(event: PaletteItemDroppedEvent): void {
    const node = event.node;
    if (!isDeviceNode(node) || node.data.deviceId) return;

    const deviceId = generateDeviceId(node.data.category, this.modelService.nodes());
    this.modelService.updateNodeData<DeviceNodeData>(node.id, {
      ...node.data,
      deviceId,
    });
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
