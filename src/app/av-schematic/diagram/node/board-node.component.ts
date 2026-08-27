import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type NgDiagramNodeTemplate, type Node } from 'ng-diagram';
import { allHoles, boardSize, holeLocalPoint } from '../model/board-geometry';
import { type BoardHole, type BoardNodeData } from '../model/interfaces';

interface HoleView extends BoardHole {
  x: number;
  y: number;
}

/**
 * Renders a physical board (e.g. "placa A", 6 x 11 holes) as an ng-diagram
 * node: an addressable hole grid sharing the same canvas and coordinate
 * plane as device nodes and wire edges. Purely a visual substrate in this
 * slice — not connectable (no ports) and not editable via the properties
 * sidebar.
 */
@Component({
  selector: 'app-board-node',
  templateUrl: './board-node.component.html',
  styleUrl: './board-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.selected]': 'node().selected',
  },
})
export class BoardNodeComponent implements NgDiagramNodeTemplate<BoardNodeData> {
  node = input.required<Node<BoardNodeData>>();

  protected readonly data = computed(() => this.node().data);

  protected readonly size = computed(() => boardSize(this.data()));

  protected readonly holes = computed<HoleView[]>(() =>
    allHoles(this.data()).map((hole) => ({ ...hole, ...holeLocalPoint(this.data(), hole) })),
  );
}
