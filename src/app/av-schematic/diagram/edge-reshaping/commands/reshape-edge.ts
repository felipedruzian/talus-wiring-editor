import {
  type Edge,
  type NgDiagramModelService,
  type NgDiagramService,
  type Node,
  type Point,
  type SnappingConfig,
} from 'ng-diagram';
import {
  getDefaultMinInteriorBends,
  getEdgePortOrientations,
  simplifyPath,
  snapToGrid,
  type Orientation,
} from '../logic';

export interface ReshapeEdgeCommand {
  type: 'reshapeEdge';
  edgeId: string;
  points: Point[];
  finalize: boolean;
}

const fallback = { source: 'horizontal' as Orientation, target: 'horizontal' as Orientation };

/**
 * Resolve the grid to apply to this edge by mirroring node-drag snap config:
 * the edge snaps only when the source node would snap on drag. Uses the
 * source node's per-node `computeSnapForNodeDrag` when defined, falling back
 * to `defaultDragSnap`. With the ng-diagram defaults (`shouldSnapDragForNode:
 * () => false`) no snap fires — so a user has to opt in by enabling node-drag
 * snap, and the edge follows the same opt-in.
 */
const gridForEdge = (
  diagramService: NgDiagramService,
  edge: Edge | null | undefined,
  sourceNode: Node | undefined,
): { x: number; y: number } | undefined => {
  if (!edge || !sourceNode) return undefined;

  const snapping = diagramService.config()?.snapping as Partial<SnappingConfig> | undefined;
  if (!snapping?.shouldSnapDragForNode?.(sourceNode)) return undefined;

  const snap = snapping.computeSnapForNodeDrag?.(sourceNode) ?? snapping.defaultDragSnap;
  if (!snap || !snap.width || !snap.height) return undefined;
  return { x: snap.width, y: snap.height };
};

/**
 * Writes the new path to the model. Constraints applied:
 * - Grid snap on every dispatch (continue and finalize) when the edge's
 *   source node has node-drag snap enabled.
 * - Full normalization pipeline (collinear merge, alternation snap,
 *   endpoint nudge) on finalize only.
 */
export const reshapeEdge = (
  modelService: NgDiagramModelService,
  diagramService: NgDiagramService,
  command: ReshapeEdgeCommand,
): void => {
  const edge = modelService.getEdgeById(command.edgeId);
  const nodes = modelService.nodes();
  const sourceNode = edge ? nodes.find((n) => n.id === edge.source) : undefined;

  const orientations = edge ? getEdgePortOrientations(nodes, edge) : fallback;
  const grid = gridForEdge(diagramService, edge, sourceNode);

  let points = command.points;

  if (command.finalize) {
    points = simplifyPath(points, orientations.source, orientations.target, {
      minInteriorBends: getDefaultMinInteriorBends(orientations.source, orientations.target),
      gridSize: grid,
    });
  } else if (grid) {
    points = snapToGrid(points, grid, orientations.source);
  }

  modelService.updateEdge(command.edgeId, { points, routingMode: 'manual' });
};
