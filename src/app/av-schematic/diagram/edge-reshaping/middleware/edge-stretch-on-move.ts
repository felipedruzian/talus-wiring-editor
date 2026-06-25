import type { NgDiagramModelService, Point } from 'ng-diagram';
import {
  collapseCollinearBends,
  portFlowPosition,
  stretchPolylineWithBendInsertion,
} from '../logic';

// Re-anchor manual edges to live ports after a node move. Skips edges not
// incident to `movedNodeIds` before the per-edge probe (O(incident), not
// O(all)). Auto edges are re-routed by ng-diagram's orthogonal router.
//
// `merge` folds redundant collinear bends. Pass `false` during the live drag
// (`selectionMoved`) so the route isn't simplified before the user drops, then
// `true` once on `nodeDragEnded` to fold what the drag left collinear.
export function applyEdgeStretchOnSelectionMoved(
  modelService: NgDiagramModelService,
  movedNodeIds: ReadonlySet<string>,
  merge: boolean,
): void {
  const patches: { id: string; points: Point[] }[] = [];
  for (const edge of modelService.edges()) {
    if (edge.routingMode !== 'manual') continue;
    if (!edge.points || edge.points.length < 2) continue;
    // Skip before the getNodeById + portFlowPosition probe below.
    if (!movedNodeIds.has(edge.source) && !movedNodeIds.has(edge.target)) continue;

    const liveSource = liveEndpointWorld(
      modelService,
      edge.source,
      edge.sourcePort,
      edge.sourcePosition,
    );
    const liveTarget = liveEndpointWorld(
      modelService,
      edge.target,
      edge.targetPort,
      edge.targetPosition,
    );
    const oldSource = edge.points[0];
    const oldTarget = edge.points[edge.points.length - 1];

    const sourceDrifted =
      !!liveSource &&
      (Math.abs(liveSource.x - oldSource.x) > 0.5 || Math.abs(liveSource.y - oldSource.y) > 0.5);
    const targetDrifted =
      !!liveTarget &&
      (Math.abs(liveTarget.x - oldTarget.x) > 0.5 || Math.abs(liveTarget.y - oldTarget.y) > 0.5);
    if (!sourceDrifted && !targetDrifted) {
      // Nothing to re-anchor. On finalize, fold any collinear bends the drag
      // left behind — invisible to the rendered line, so the drop matches what
      // the user saw.
      if (merge) {
        const collapsed = collapseCollinearBends(edge.points);
        if (collapsed.length !== edge.points.length) {
          patches.push({ id: edge.id, points: collapsed });
        }
      }
      continue;
    }

    const stretched = stretchPolylineWithBendInsertion(
      edge.points,
      sourceDrifted ? liveSource : null,
      targetDrifted ? liveTarget : null,
      merge,
    );
    if (stretched) {
      patches.push({ id: edge.id, points: stretched });
    } else {
      // Can't stay orthogonal: keep the edge manual and re-anchor the drifted
      // endpoint(s) rather than discarding the reshape by flipping to auto.
      const kept = edge.points.map((p) => ({ x: p.x, y: p.y }));
      if (sourceDrifted && liveSource) kept[0] = { x: liveSource.x, y: liveSource.y };
      if (targetDrifted && liveTarget) kept[kept.length - 1] = { x: liveTarget.x, y: liveTarget.y };
      patches.push({ id: edge.id, points: kept });
    }
  }
  if (patches.length > 0) {
    modelService.updateEdges(patches);
  }
}

// Returns null when the port isn't measured yet (transient mount state).
function liveEndpointWorld(
  modelService: NgDiagramModelService,
  nodeId: string,
  portId: string | undefined,
  fallback: Point | undefined,
): Point | null {
  if (nodeId && portId) {
    const node = modelService.getNodeById(nodeId);
    return portFlowPosition(node, portId);
  }
  return fallback ? { x: fallback.x, y: fallback.y } : null;
}
