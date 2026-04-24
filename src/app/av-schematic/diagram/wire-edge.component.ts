import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  NgDiagramBaseEdgeComponent,
  type Edge,
  type NgDiagramEdgeTemplate,
} from 'ng-diagram';
import { type WireEdgeData } from './model/interfaces';

@Component({
  imports: [NgDiagramBaseEdgeComponent],
  template: `<ng-diagram-base-edge [edge]="edge()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WireEdgeComponent implements NgDiagramEdgeTemplate<WireEdgeData> {
  edge = input.required<Edge<WireEdgeData>>();
}
