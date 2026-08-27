import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NgDiagramPortComponent,
  NgDiagramSelectionService,
  NgDiagramService,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import { PortFocusService } from '../port-focus.service';
import { RelinkTargetHighlightService } from '../edge-relinking/relink-target-highlight.service';
import { type DeviceNodeData, type DevicePort } from '../model/interfaces';

/**
 * Bounded, seed-only physical illustration variants (issue #1 tracer
 * bullet). Purely a visual reskin of the same generic device-node
 * card/ports — not a persisted field, not the general footprint system from
 * issue #3. Resolved from `manufacturer`/`model` so any other device
 * (including every existing AV seed/library entry) keeps rendering as the
 * plain generic card, unchanged.
 */
export type DeviceIllustration = 'arduino-nano' | 'tb6612fng' | null;

function resolveIllustration(data: DeviceNodeData): DeviceIllustration {
  if (data.manufacturer === 'Arduino' && data.model === 'Nano') return 'arduino-nano';
  if (data.model === 'TB6612FNG') return 'tb6612fng';
  return null;
}

@Component({
  selector: 'app-device-node',
  imports: [NgDiagramPortComponent],
  templateUrl: './device-node.component.html',
  styleUrl: './device-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.selected]': 'node().selected',
    '[class.edge-highlighted]': 'edgeHighlighted()',
    '[class.is-link-target]': 'linkTargetPortId() !== null',
    '[class.is-linking]': 'isLinking()',
  },
})
export class DeviceNodeComponent implements NgDiagramNodeTemplate<DeviceNodeData> {
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly diagramService = inject(NgDiagramService);
  private readonly portFocusService = inject(PortFocusService);
  private readonly relinkHighlight = inject(RelinkTargetHighlightService);

  node = input.required<Node<DeviceNodeData>>();

  protected readonly data = computed(() => this.node().data);

  protected readonly illustration = computed<DeviceIllustration>(() =>
    resolveIllustration(this.data()),
  );

  protected readonly inputPorts = computed(() => this.portsByDirection('input'));
  protected readonly outputPorts = computed(() => this.portsByDirection('output'));

  protected readonly edgeHighlighted = computed(() => {
    const nodeId = this.node().id;
    return this.selectionService
      .selection()
      .edges.some((e) => e.source === nodeId || e.target === nodeId);
  });

  protected readonly isLinking = computed(() => !!this.diagramService.actionState().linking);

  protected readonly linkTargetPortId = computed(() => {
    const target = this.relinkHighlight.target();
    return target?.nodeId === this.node().id ? target.portId : null;
  });

  protected onPortDblClick(portId: string): void {
    this.portFocusService.navigateToConnectedPort(portId, this.node().id);
  }

  private portsByDirection(direction: DevicePort['direction']): DevicePort[] {
    return this.data().ports.filter((p) => p.direction === direction);
  }
}
