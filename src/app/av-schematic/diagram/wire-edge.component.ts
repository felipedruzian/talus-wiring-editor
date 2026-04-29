import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  viewChild,
} from '@angular/core';
import {
  NgDiagramBaseEdgeComponent,
  NgDiagramBaseEdgeLabelComponent,
  type Edge,
  type NgDiagramEdgeTemplate,
} from 'ng-diagram';
import { type WireEdgeData } from './model/interfaces';

interface BendHandle {
  id: string;
  index: number;
  transform: string;
}

@Component({
  imports: [NgDiagramBaseEdgeComponent, NgDiagramBaseEdgeLabelComponent],
  templateUrl: './wire-edge.component.html',
  styleUrl: './wire-edge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WireEdgeComponent implements NgDiagramEdgeTemplate<WireEdgeData> {
  edge = input.required<Edge<WireEdgeData>>();

  private readonly baseEdge = viewChild(NgDiagramBaseEdgeComponent);

  protected readonly strokeColor = computed(() =>
    this.edge().selected ? 'var(--av-color-accent)' : 'var(--av-color-wire-stroke)',
  );

  protected readonly strokeWidth = computed(() => (this.edge().selected ? 2 : 1));

  protected readonly bendHandles = computed<BendHandle[]>(() => {
    if (!this.edge().selected) return [];
    const baseEdge = this.baseEdge();
    if (!baseEdge) return [];

    const points = baseEdge.points();
    if (!points || points.length < 3) return [];

    const source = points[0];

    return points.slice(1, -1).map((p, i) => {
      const dx = p.x - source.x;
      const dy = p.y - source.y;
      return {
        id: `bend-${i + 1}`,
        index: i + 1,
        transform: `translate(${dx}px, ${dy}px) translate(-50%, -50%)`,
      };
    });
  });
}
