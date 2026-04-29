import type { Point } from 'ng-diagram';
import type { WireEdgeData } from '../../diagram/model/interfaces';
import { DxfLwPolyline, DxfText } from '../dxf/dxf-entity';
import type { DxfEdgeRenderer, DxfRenderContext } from '../dxf/dxf-types';
import {
  FONT_WIRE_LABEL,
  LAYERS,
  LINE_WEIGHT,
  TEXT_STYLE,
  WIRE_ENDPOINT_EXTENSION,
  WIRE_LABEL_DISTANCE_FROM_END,
} from './av-dxf-constants';

/**
 * Emits a single LWPOLYLINE per wire edge from `edge.points` plus two
 * `wireId` labels, one near each end — mirroring the two
 * `<ng-diagram-base-edge-label>` markers in wire-edge.component.html.
 *
 * `edge.points` is supplied by ng-diagram after routing — orthogonal,
 * polyline, and future point-following routings all expose the same array,
 * so this renderer doesn't care which routing produced them.
 *
 * The first/last point is the port's *measured center*. The device-node
 * renderer snaps each port rect's adjacent edge flush with the device
 * frame, leaving the rect's outer edge slightly past the measured center.
 * We extend each endpoint a small distance along the first/last segment
 * (toward the next routing point — that direction always points outward
 * from the port for left/right side ports) so wires meet ports at their
 * outer boundary.
 */
export const renderWireEdge: DxfEdgeRenderer = (ctx, edge) => {
  const points = edge.points ?? [];
  if (points.length < 2) return;

  const last = points.length - 1;
  const adjusted = [...points];
  adjusted[0] = extendToward(points[0], points[1], WIRE_ENDPOINT_EXTENSION);
  adjusted[last] = extendToward(points[last], points[last - 1], WIRE_ENDPOINT_EXTENSION);

  const mapped = adjusted.map((p) => ctx.mapper.mapPoint(p.x, p.y));
  ctx.doc.addEntity(new DxfLwPolyline(LAYERS.WIRES, mapped, false, undefined, LINE_WEIGHT.WIRE));

  renderWireLabels(ctx, adjusted, edge.data as WireEdgeData);
};

const renderWireLabels = (
  ctx: DxfRenderContext,
  points: readonly Point[],
  data: WireEdgeData,
): void => {
  const wireId = data?.wireId;
  if (!wireId) return;

  const sourceAnchor = pointAtDistance(points, WIRE_LABEL_DISTANCE_FROM_END, false);
  const targetAnchor = pointAtDistance(points, WIRE_LABEL_DISTANCE_FROM_END, true);
  if (sourceAnchor) renderLabel(ctx, sourceAnchor, wireId);
  if (targetAnchor) renderLabel(ctx, targetAnchor, wireId);
};

const renderLabel = (ctx: DxfRenderContext, anchor: Point, text: string): void => {
  const pos = ctx.mapper.mapPoint(anchor.x, anchor.y);
  const heightMm = ctx.mapper.mapLength(FONT_WIRE_LABEL);
  // halign=1 (center), valign=1 (bottom) — text sits centered above the wire,
  // bottom edge of the glyphs flush with the wire line.
  ctx.doc.addEntity(
    new DxfText(LAYERS.WIRES, text, pos.x, pos.y, heightMm, TEXT_STYLE.STANDARD, 1, 1),
  );
};

const pointAtDistance = (
  points: readonly Point[],
  distance: number,
  fromEnd: boolean,
): Point | null => {
  if (points.length < 2) return null;
  const ordered = fromEnd ? [...points].reverse() : points;

  let remaining = distance;
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (remaining <= segLen) {
      const t = segLen === 0 ? 0 : remaining / segLen;
      return { x: a.x + dx * t, y: a.y + dy * t };
    }
    remaining -= segLen;
  }
  // Path is shorter than `distance` — fall back to the far end.
  return ordered[ordered.length - 1];
};

const extendToward = (point: Point, neighbor: Point, distance: number): Point => {
  const dx = neighbor.x - point.x;
  const dy = neighbor.y - point.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return point;
  return { x: point.x + (dx / len) * distance, y: point.y + (dy / len) * distance };
};
