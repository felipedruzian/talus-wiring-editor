import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramPortComponent,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import {
  FOOTPRINT_PADDING_CELLS,
  footprintNodeSize,
  footprintPinHoles,
  rotatedFootprintBox,
} from '../model/footprint-geometry';
import { resolveFootprint, type FootprintPaint, type FootprintShape } from '../model/footprint';
import { isBoardNode } from '../model/guards';
import { type BoardRotation, type DeviceNodeData } from '../model/interfaces';
import { BoardPlacementService } from '../placement/board-placement.service';
import { centerLeftPortBoxPosition } from '../edge-reshaping/logic/port-position';

interface PinView {
  id: string;
  label: string;
  x: number;
  y: number;
  port: boolean;
  primary: boolean;
}

const FALLBACK_PITCH = 20;

@Component({
  selector: 'app-footprint-node',
  imports: [NgDiagramPortComponent],
  templateUrl: './footprint-node.component.html',
  styleUrl: './footprint-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.selected]': 'node().selected',
  },
})
export class FootprintNodeComponent implements NgDiagramNodeTemplate<DeviceNodeData> {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly placementService = inject(BoardPlacementService);

  node = input.required<Node<DeviceNodeData>>();

  protected readonly data = computed(() => this.node().data);
  protected readonly footprint = computed(() => resolveFootprint(this.data()));
  protected readonly rotation = computed<BoardRotation>(() => this.data().placement?.rotation ?? 0);

  protected readonly pitch = computed(() => {
    const placement = this.data().placement;
    if (!placement) return FALLBACK_PITCH;
    const board = this.modelService
      .nodes()
      .filter(isBoardNode)
      .find((candidate) => candidate.data.boardId === placement.boardId);
    return board?.data.pitch ?? FALLBACK_PITCH;
  });

  protected readonly size = computed(() => {
    const footprint = this.footprint();
    if (!footprint) return { width: 0, height: 0 };
    return footprintNodeSize(footprint, this.rotation(), this.pitch());
  });

  protected readonly viewBox = computed(() => {
    const footprint = this.footprint();
    if (!footprint) return '0 0 0 0';
    const box = rotatedFootprintBox(footprint, this.rotation());
    const pad = FOOTPRINT_PADDING_CELLS;
    return `${-pad} ${-pad} ${box.cols - 1 + pad * 2} ${box.rows - 1 + pad * 2}`;
  });

  protected readonly illustrationTransform = computed(() => {
    const footprint = this.footprint();
    if (!footprint) return '';
    switch (this.rotation()) {
      case 0:
        return '';
      case 90:
        return `matrix(0 1 -1 0 ${footprint.rows - 1} 0)`;
      case 180:
        return `matrix(-1 0 0 -1 ${footprint.cols - 1} ${footprint.rows - 1})`;
      case 270:
        return `matrix(0 -1 1 0 0 ${footprint.cols - 1})`;
    }
  });

  protected readonly pins = computed<PinView[]>(() => {
    const footprint = this.footprint();
    const placement = this.data().placement;
    if (!footprint || !placement) return [];
    const portIds = new Set(this.data().ports.map((port) => port.id));
    const pinsById = new Map(footprint.pins.map((pin) => [pin.id, pin]));
    const pad = FOOTPRINT_PADDING_CELLS * this.pitch();
    return footprintPinHoles(footprint, placement).map((pin) => ({
      id: pin.pinId,
      label: pin.label,
      x: pad + pin.cell.col * this.pitch(),
      y: pad + pin.cell.row * this.pitch(),
      port: portIds.has(pin.pinId),
      primary: pinsById.get(pin.pinId)?.primary ?? false,
    }));
  });

  protected readonly conflictMessage = computed(() => {
    const conflict = this.placementService.conflict();
    return conflict?.nodeId === this.node().id ? this.placementService.conflictMessage() : null;
  });

  protected readonly portSize = computed(() => Math.max(4, Math.min(this.pitch() - 2, 14)));

  protected portLeft(pin: PinView): number {
    return centerLeftPortBoxPosition(pin, this.portSize()).x;
  }

  protected portTop(pin: PinView): number {
    return centerLeftPortBoxPosition(pin, this.portSize()).y;
  }

  protected fill(shape: FootprintShape): string {
    return this.paint(shape.kind === 'line' ? 'none' : shape.fill);
  }

  protected stroke(shape: FootprintShape): string {
    return this.paint('stroke' in shape ? shape.stroke : undefined);
  }

  protected textSize(shape: Extract<FootprintShape, { kind: 'text' }>): number {
    return shape.size ?? 0.42;
  }

  protected async rotate(step: 1 | -1, event: Event): Promise<void> {
    event.stopPropagation();
    await this.placementService.rotate(this.node().id, step);
  }

  protected stopNodeGesture(event: Event): void {
    event.stopPropagation();
  }

  private paint(paint: FootprintPaint | undefined): string {
    switch (paint ?? 'none') {
      case 'none':
        return 'none';
      case 'body':
        return 'var(--footprint-body)';
      case 'body-alt':
        return 'var(--footprint-body-alt)';
      case 'accent':
        return 'var(--footprint-accent)';
      case 'lead':
        return 'var(--footprint-lead)';
      case 'silk':
        return 'var(--footprint-silk)';
      case 'polarity':
        return 'var(--footprint-polarity)';
    }
  }
}
