import type { Point } from 'ng-diagram';
import { DxfLwPolyline } from '../dxf/dxf-entity';
import type { DxfEdgeRenderer } from '../dxf/dxf-types';
import { LAYERS, LINE_WEIGHT, WIRE_ENDPOINT_EXTENSION } from './av-dxf-constants';

/**
 * Emits a single LWPOLYLINE per wire edge from `edge.points`.
 *
 * `edge.points` is supplied by ng-diagram after routing — orthogonal,
 * polyline, and future point-following routings all expose the same array,
 * so this renderer doesn't care which routing produced them.
 *
 * The first/last point is the port's *measured center*, but the device-node
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
};

const extendToward = (point: Point, neighbor: Point, distance: number): Point => {
  const dx = neighbor.x - point.x;
  const dy = neighbor.y - point.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return point;
  return { x: point.x + (dx / len) * distance, y: point.y + (dy / len) * distance };
};
