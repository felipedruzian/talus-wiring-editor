import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgDiagramPortComponent, type NgDiagramNodeTemplate, type Node } from 'ng-diagram';
import {
  BOARD_MARGIN,
  DEFAULT_HOLE_DIAMETER,
  boardHoles,
  boardSize,
  holeKey,
  holeLocalPoint,
} from '../model/board-geometry';
import { holePortId, tracePortId } from '../model/board-ports';
import { traceHoles, traceSegmentHoles } from '../model/board-trace';
import { type BoardHole, type BoardNodeData, type BoardTrace } from '../model/interfaces';
import { BoardPlacementService } from '../placement/board-placement.service';
import { centerLeftPortBoxPosition } from '../edge-reshaping/logic/port-position';

interface HoleView extends BoardHole {
  key: string;
  x: number;
  y: number;
  portId: string;
  conflicted: boolean;
}

interface TraceSegmentView {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** A segment that covers a single hole is a solder blob, not a run. */
  dot: boolean;
}

interface TraceView {
  id: string;
  label: string;
  net?: string;
  color: string;
  segments: TraceSegmentView[];
  /** Dashed hops between disjoint segments of one trace - i.e. jumper wires. */
  bridges: { x1: number; y1: number; x2: number; y2: number }[];
  portId: string;
  portX: number;
  portY: number;
  labelX: number;
  labelY: number;
}

/** Stable hue per net name, so the same rail is the same color on every board. */
function netColor(net: string | undefined): string {
  if (!net) return 'var(--av-color-board-copper, #b87333)';
  let hash = 0;
  for (let i = 0; i < net.length; i++) {
    hash = (hash * 31 + net.charCodeAt(i)) % 360;
  }
  return `hsl(${hash}, 68%, 28%)`;
}

/**
 * Renders a physical board as an ng-diagram node: an addressable hole grid,
 * its copper traces, and a connection port for every hole and every trace.
 *
 * Nothing about the rendering is specialized per board - placa A (6 x 11), the
 * 6 x 28 origin perfboard and the 6 x 3 pecas all take this same path, sized
 * from `rows`/`cols`/`pitch`. Sharing the single `Node[]` array, coordinate
 * space and z-order with device nodes is what keeps "mesmo canvas" true.
 *
 * Every hole carries a port, which is what makes "furos e trilhas funcionam
 * como endpoints conectaveis" literally true rather than approximated: the
 * association a wire records is an ordinary `targetPort` on this node. For a
 * 6 x 28 board that is 168 ports; boards materially larger than that would want
 * ports minted on demand instead (see docs/physical-footprints.md).
 */
@Component({
  selector: 'app-board-node',
  imports: [NgDiagramPortComponent],
  templateUrl: './board-node.component.html',
  styleUrl: './board-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.selected]': 'node().selected',
  },
})
export class BoardNodeComponent implements NgDiagramNodeTemplate<BoardNodeData> {
  private readonly placement = inject(BoardPlacementService);

  node = input.required<Node<BoardNodeData>>();

  protected readonly data = computed(() => this.node().data);

  protected readonly size = computed(() => boardSize(this.data()));

  protected readonly holeRadius = computed(
    () => (this.data().holeDiameter ?? DEFAULT_HOLE_DIAMETER) / 2,
  );

  /** Hit area for a hole's port: generous enough to grab, never wider than the pitch. */
  protected readonly holePortSize = computed(() =>
    Math.max(4, Math.min(this.data().pitch - 2, 14)),
  );

  private readonly conflictedKeys = computed(() =>
    this.placement.conflictHoleKeys(this.data().boardId),
  );

  protected readonly holes = computed<HoleView[]>(() => {
    const data = this.data();
    const conflicted = this.conflictedKeys();
    return boardHoles(data).map((hole) => {
      const key = holeKey(hole);
      return {
        ...hole,
        key,
        ...holeLocalPoint(data, hole),
        portId: holePortId(hole),
        conflicted: conflicted.has(key),
      };
    });
  });

  protected readonly traces = computed<TraceView[]>(() =>
    (this.data().traces ?? []).map((trace) => this.toTraceView(trace)),
  );

  protected holePortLeft(hole: HoleView): number {
    return centerLeftPortBoxPosition(hole, this.holePortSize()).x;
  }

  protected holePortTop(hole: HoleView): number {
    return centerLeftPortBoxPosition(hole, this.holePortSize()).y;
  }

  /**
   * A port's flow position is taken from its own box (left edge, vertical
   * centre - see edge-reshaping/logic/port-position.ts), so every port box is
   * laid out with its left edge exactly on the point it represents. That makes
   * wires land on the hole centre without any correction elsewhere.
   */
  protected tracePortLeft(trace: TraceView): number {
    return centerLeftPortBoxPosition(
      { x: trace.portX, y: trace.portY },
      this.holePortSize(),
    ).x;
  }

  protected tracePortTop(trace: TraceView): number {
    return centerLeftPortBoxPosition(
      { x: trace.portX, y: trace.portY },
      this.holePortSize(),
    ).y;
  }

  private toTraceView(trace: BoardTrace): TraceView {
    const data = this.data();
    const segments: TraceSegmentView[] = trace.segments.map((segment) => {
      const from = holeLocalPoint(data, segment.from);
      const to = holeLocalPoint(data, segment.to);
      return {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        dot: traceSegmentHoles(segment).length === 1,
      };
    });

    const bridges = segments.slice(1).map((segment, index) => {
      const previous = segments[index];
      return { x1: previous.x2, y1: previous.y2, x2: segment.x1, y2: segment.y1 };
    });

    const holes = traceHoles(trace);
    const first = holes[0] ?? { row: 0, col: 0 };
    const last = holes[holes.length - 1] ?? first;
    const firstPoint = holeLocalPoint(data, first);
    const lastPoint = holeLocalPoint(data, last);

    return {
      id: trace.id,
      label: trace.label,
      net: trace.net,
      color: netColor(trace.net),
      segments,
      bridges,
      portId: tracePortId(trace.id),
      portX: firstPoint.x,
      portY: firstPoint.y,
      labelX: lastPoint.x + BOARD_MARGIN * 0.4,
      labelY: lastPoint.y + 3,
    };
  }
}
