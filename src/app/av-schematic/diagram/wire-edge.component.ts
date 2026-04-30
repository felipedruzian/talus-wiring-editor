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
import {
  EdgeReshapeDirective,
  type EdgeReshapePointerEvent,
} from './edge-reshaping/directives/edge-reshape.directive';
import { EdgeReshapeEventHandler } from './edge-reshaping/handlers/edge-reshape.handler';
import { getHandlerPositions } from './edge-reshaping/logic';
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

  edge = input.required<Edge<WireEdgeData>>();

  private readonly baseEdge = viewChild(NgDiagramBaseEdgeComponent);

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

  protected onGhostContextMenu(event: MouseEvent, segmentIndex: number): void {
    event.preventDefault();
    event.stopPropagation();
    const points = this.baseEdge()?.points();
    if (!points) return;
    this.reshapeHandler.onRemoveSegmentRequest(this.edge().id, segmentIndex, points);
  }
}
