import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  NgDiagramBaseEdgeComponent,
  NgDiagramBaseEdgeLabelComponent,
  type Edge,
  type NgDiagramEdgeTemplate,
} from 'ng-diagram';
import { BendPointDragService } from './edge-routing/bend-point-drag.service';
import { segmentMidpoint } from './edge-routing/edge-points';
import { type WireEdgeData } from './model/interfaces';

interface BendHandle {
  id: string;
  index: number;
  transform: string;
}

interface GhostHandle {
  id: string;
  segmentIndex: number;
  transform: string;
}

@Component({
  imports: [NgDiagramBaseEdgeComponent, NgDiagramBaseEdgeLabelComponent],
  templateUrl: './wire-edge.component.html',
  styleUrl: './wire-edge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WireEdgeComponent implements NgDiagramEdgeTemplate<WireEdgeData> {
  private readonly dragService = inject(BendPointDragService);

  edge = input.required<Edge<WireEdgeData>>();

  private readonly baseEdge = viewChild(NgDiagramBaseEdgeComponent);

  protected readonly strokeColor = computed(() =>
    this.edge().selected ? 'var(--av-color-accent)' : 'var(--av-color-wire-stroke)',
  );

  protected readonly strokeWidth = computed(() => (this.edge().selected ? 2 : 1));

  protected readonly bendHandles = computed<BendHandle[]>(() => {
    if (!this.edge().selected) return [];
    const points = this.baseEdge()?.points();
    if (!points || points.length < 3) return [];

    const source = points[0];
    return points.slice(1, -1).map((p, i) => ({
      id: `bend-${i + 1}`,
      index: i + 1,
      transform: `translate(${p.x - source.x}px, ${p.y - source.y}px) translate(-50%, -50%)`,
    }));
  });

  protected readonly ghostHandles = computed<GhostHandle[]>(() => {
    if (!this.edge().selected) return [];
    const points = this.baseEdge()?.points();
    if (!points || points.length < 4) return [];

    const source = points[0];
    const result: GhostHandle[] = [];
    // Skip the first and last segments (they connect to a port endpoint).
    for (let i = 1; i <= points.length - 3; i++) {
      const mid = segmentMidpoint(points[i], points[i + 1]);
      result.push({
        id: `ghost-${i}`,
        segmentIndex: i,
        transform: `translate(${mid.x - source.x}px, ${mid.y - source.y}px) translate(-50%, -50%)`,
      });
    }
    return result;
  });

  protected onBendPointerDown(event: PointerEvent, bendIndex: number): void {
    const points = this.baseEdge()?.points();
    if (!points) return;
    this.dragService.startVertexDrag(event, this.edge().id, bendIndex, points);
  }

  protected onBendContextMenu(event: MouseEvent, bendIndex: number): void {
    event.preventDefault();
    event.stopPropagation();
    const points = this.baseEdge()?.points();
    if (!points) return;
    this.dragService.removeSegmentAtBend(this.edge().id, bendIndex, points);
  }

  protected onGhostPointerDown(event: PointerEvent, segmentIndex: number): void {
    const points = this.baseEdge()?.points();
    if (!points) return;
    this.dragService.startInsertAndDrag(event, this.edge().id, segmentIndex, points);
  }
}
