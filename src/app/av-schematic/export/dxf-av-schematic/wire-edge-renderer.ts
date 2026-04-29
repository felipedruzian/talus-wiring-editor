import { DxfLwPolyline } from '../dxf/dxf-entity';
import type { DxfEdgeRenderer } from '../dxf/dxf-types';
import { LAYERS, LINE_WEIGHT } from './av-dxf-constants';

/**
 * Emits a single LWPOLYLINE per wire edge from `edge.points`.
 *
 * `edge.points` is supplied by ng-diagram after routing — orthogonal,
 * polyline, and future point-following routings all expose the same array,
 * so this renderer doesn't care which routing produced them.
 */
export const renderWireEdge: DxfEdgeRenderer = (ctx, edge) => {
  const points = edge.points ?? [];
  if (points.length < 2) return;

  const mapped = points.map((p) => ctx.mapper.mapPoint(p.x, p.y));
  ctx.doc.addEntity(new DxfLwPolyline(LAYERS.WIRES, mapped, false, undefined, LINE_WEIGHT.WIRE));
};
