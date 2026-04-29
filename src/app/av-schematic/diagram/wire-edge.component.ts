import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  NgDiagramBaseEdgeComponent,
  NgDiagramBaseEdgeLabelComponent,
  NgDiagramModelService,
  type Edge,
  type NgDiagramEdgeTemplate,
  type Point,
} from 'ng-diagram';
import { BendPointDragService } from './edge-routing/bend-point-drag.service';
import { reflowEndpoint, segmentMidpoint } from './edge-routing/edge-points';
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
  private readonly modelService = inject(NgDiagramModelService);

  edge = input.required<Edge<WireEdgeData>>();

  private readonly baseEdge = viewChild(NgDiagramBaseEdgeComponent);

  private readonly sourceNodePosition = computed<Point | undefined>(() => {
    const id = this.edge().source;
    return this.modelService.nodes().find((n) => n.id === id)?.position;
  });

  private readonly targetNodePosition = computed<Point | undefined>(() => {
    const id = this.edge().target;
    return this.modelService.nodes().find((n) => n.id === id)?.position;
  });

  // Per-edge cache: where the source/target ports sit relative to their node
  // origins. We capture this the first time the edge enters manual mode (when
  // points[0] / points[N-1] are still aligned to the actual ports because the
  // drag service just wrote them from auto-routed values). After that, on any
  // node move we can compute the desired port flow position directly as
  // `nodePosition + portOffset` — no delta accumulation, no drift.
  private sourcePortOffset: Point | null = null;
  private targetPortOffset: Point | null = null;

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

  constructor() {
    effect(() => {
      const edge = this.edge();
      const sourcePos = this.sourceNodePosition();
      const targetPos = this.targetNodePosition();

      if (
        edge.routingMode !== 'manual' ||
        !edge.points ||
        edge.points.length < 3
      ) {
        // Drop the cached offsets so the next manual session captures fresh
        // values (e.g., after Reset routing or a programmatic clear).
        this.sourcePortOffset = null;
        this.targetPortOffset = null;
        return;
      }

      if (!this.sourcePortOffset && sourcePos) {
        const head = edge.points[0];
        this.sourcePortOffset = { x: head.x - sourcePos.x, y: head.y - sourcePos.y };
      }
      if (!this.targetPortOffset && targetPos) {
        const tail = edge.points[edge.points.length - 1];
        this.targetPortOffset = { x: tail.x - targetPos.x, y: tail.y - targetPos.y };
      }

      let nextPoints = edge.points;
      let changed = false;

      if (sourcePos && this.sourcePortOffset) {
        const desired = {
          x: sourcePos.x + this.sourcePortOffset.x,
          y: sourcePos.y + this.sourcePortOffset.y,
        };
        const head = nextPoints[0];
        if (desired.x !== head.x || desired.y !== head.y) {
          const reflowed = reflowEndpoint(nextPoints, 'source', desired);
          if (reflowed) {
            nextPoints = reflowed;
            changed = true;
          }
        }
      }

      if (targetPos && this.targetPortOffset) {
        const desired = {
          x: targetPos.x + this.targetPortOffset.x,
          y: targetPos.y + this.targetPortOffset.y,
        };
        const tail = nextPoints[nextPoints.length - 1];
        if (desired.x !== tail.x || desired.y !== tail.y) {
          const reflowed = reflowEndpoint(nextPoints, 'target', desired);
          if (reflowed) {
            nextPoints = reflowed;
            changed = true;
          }
        }
      }

      if (changed) {
        this.modelService.updateEdge(edge.id, { points: nextPoints });
      }
    });
  }

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
