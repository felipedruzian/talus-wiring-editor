import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramPortComponent,
  type NgDiagramNodeTemplate,
  type Node,
} from 'ng-diagram';
import {
  DETACHED_FOOTPRINT_FALLBACK_PITCH,
  FOOTPRINT_PADDING_CELLS,
  footprintNodeSize,
  footprintPinHoles,
  rotatedFootprintBox,
} from '../model/footprint-geometry';
import {
  resolveFootprint,
  type Footprint,
  type FootprintPaint,
  type FootprintShape,
} from '../model/footprint';
import { isBoardNode } from '../model/guards';
import { type BoardRotation, type DeviceNodeData, type DevicePort } from '../model/interfaces';
import { BoardPlacementService } from '../placement/board-placement.service';
import { centerLeftPortBoxPosition } from '../edge-reshaping/logic/port-position';

export interface FootprintPinView {
  id: string;
  label: string;
  x: number;
  y: number;
  port: boolean;
  primary: boolean;
}

export function footprintPinViews(
  footprint: Footprint,
  rotation: BoardRotation,
  pitch: number,
  ports: readonly DevicePort[],
): FootprintPinView[] {
  const portIds = new Set(ports.map((port) => port.id));
  const pinsById = new Map(footprint.pins.map((pin) => [pin.id, pin]));
  const pad = FOOTPRINT_PADDING_CELLS * pitch;
  return footprintPinHoles(footprint, { anchor: { row: 0, col: 0 }, rotation }).map((pin) => ({
    id: pin.pinId,
    label: pin.label,
    x: pad + pin.cell.col * pitch,
    y: pad + pin.cell.row * pitch,
    port: portIds.has(pin.pinId),
    primary: pinsById.get(pin.pinId)?.primary ?? false,
  }));
}

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
  protected readonly rotation = computed<BoardRotation>(
    () => this.data().placement?.rotation ?? this.data().footprintRotation ?? 0,
  );

  protected readonly pitch = computed(() => {
    const placement = this.data().placement;
    if (placement) {
      const board = this.modelService
        .nodes()
        .filter(isBoardNode)
        .find((candidate) => candidate.data.boardId === placement.boardId);
      if (board) return board.data.pitch;
    }
    return this.data().footprintPitch ?? DETACHED_FOOTPRINT_FALLBACK_PITCH;
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

  protected readonly pins = computed<FootprintPinView[]>(() => {
    const footprint = this.footprint();
    if (!footprint) return [];
    return footprintPinViews(footprint, this.rotation(), this.pitch(), this.data().ports);
  });

  protected readonly conflictMessage = computed(() => {
    const conflict = this.placementService.conflict();
    return conflict?.nodeId === this.node().id ? this.placementService.conflictMessage() : null;
  });

  protected readonly portSize = computed(() => Math.max(4, Math.min(this.pitch() - 2, 14)));

  protected portLeft(pin: FootprintPinView): number {
    return centerLeftPortBoxPosition(pin, this.portSize()).x;
  }

  protected portTop(pin: FootprintPinView): number {
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
