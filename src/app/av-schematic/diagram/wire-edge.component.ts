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
import {
  EdgeReshapeDirective,
  type EdgeReshapePointerEvent,
} from './edge-reshaping/directives/edge-reshape.directive';
import { EdgeReshapeEventHandler } from './edge-reshaping/handlers/edge-reshape.handler';
import { getHandlerPositions, reflowEndpoint } from './edge-reshaping/logic';
import { type WireEdgeData } from './model/interfaces';

interface BendHandleView {
  id: string;
  index: number;
  transform: string;
}

interface GhostHandleView {
  id: string;
  segmentIndex: number;
  transform: string;
}

const handleTransform = (x: number, y: number, originX: number, originY: number): string =>
  `translate(${x - originX}px, ${y - originY}px) translate(-50%, -50%)`;

@Component({
  imports: [
    NgDiagramBaseEdgeComponent,
    NgDiagramBaseEdgeLabelComponent,
    EdgeReshapeDirective,
  ],
  templateUrl: './wire-edge.component.html',
  styleUrl: './wire-edge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WireEdgeComponent implements NgDiagramEdgeTemplate<WireEdgeData> {
  private readonly reshapeHandler = inject(EdgeReshapeEventHandler);
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

  private readonly handlerPositions = computed(() => {
    if (!this.edge().selected) return { bends: [], ghosts: [] };
    const points = this.baseEdge()?.points();
    if (!points) return { bends: [], ghosts: [] };
    return getHandlerPositions(points);
  });

  protected readonly bendHandles = computed<BendHandleView[]>(() => {
    const points = this.baseEdge()?.points();
    if (!points || points.length === 0) return [];
    const source = points[0];
    return this.handlerPositions().bends.map((b) => ({
      id: `bend-${b.pointIndex}`,
      index: b.pointIndex,
      transform: handleTransform(b.x, b.y, source.x, source.y),
    }));
  });

  protected readonly ghostHandles = computed<GhostHandleView[]>(() => {
    const points = this.baseEdge()?.points();
    if (!points || points.length === 0) return [];
    const source = points[0];
    return this.handlerPositions().ghosts.map((g) => ({
      id: `ghost-${g.segmentIndex}`,
      segmentIndex: g.segmentIndex,
      transform: handleTransform(g.x, g.y, source.x, source.y),
    }));
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
          const reflowed = reflowEndpoint(nextPoints, 'source', desired, 'horizontal');
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
          const reflowed = reflowEndpoint(nextPoints, 'target', desired, 'horizontal');
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

  protected onVertexStart(event: EdgeReshapePointerEvent, bendIndex: number): void {
    const points = this.baseEdge()?.points();
    if (!points) return;
    this.reshapeHandler.onVertexStart(this.edge().id, bendIndex, points, event.pointerId);
  }

  protected onGhostStart(event: EdgeReshapePointerEvent, segmentIndex: number): void {
    const points = this.baseEdge()?.points();
    if (!points) return;
    this.reshapeHandler.onGhostStart(this.edge().id, segmentIndex, points, event.pointerId);
  }

  protected onReshapeContinue(event: EdgeReshapePointerEvent): void {
    this.reshapeHandler.onContinue(event.clientX, event.clientY, event.pointerId);
  }

  protected onReshapeEnd(event: EdgeReshapePointerEvent): void {
    this.reshapeHandler.onEnd(event.pointerId);
  }

  protected onBendContextMenu(event: MouseEvent, bendIndex: number): void {
    event.preventDefault();
    event.stopPropagation();
    const points = this.baseEdge()?.points();
    if (!points) return;
    this.reshapeHandler.onRemoveSegmentRequest(this.edge().id, bendIndex, points);
  }
}
