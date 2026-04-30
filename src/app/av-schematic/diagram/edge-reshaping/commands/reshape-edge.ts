import {
  type NgDiagramModelService,
  type NgDiagramService,
  type Point,
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

const gridFromConfig = (
  diagramService: NgDiagramService,
): { x: number; y: number } | undefined => {
  const snap = diagramService.config()?.snapping?.defaultDragSnap;
  if (!snap || !snap.width || !snap.height) return undefined;
  return { x: snap.width, y: snap.height };
};

/**
 * Writes the new path to the model. Constraints applied:
 * - Grid snap on every dispatch (continue and finalize) so the dragged
 *   bend visibly steps between grid lines, matching node-drag feel.
 * - Full normalization pipeline (collinear merge, alternation snap,
 *   endpoint nudge) on finalize only — these are heavier cleanups that
 *   should run once at gesture end, not every pointermove.
 */
export const reshapeEdge = (
  modelService: NgDiagramModelService,
  diagramService: NgDiagramService,
  command: ReshapeEdgeCommand,
): void => {
  const edge = modelService.getEdgeById(command.edgeId);
  const orientations = edge
    ? getEdgePortOrientations(modelService.nodes(), edge)
    : fallback;
  const grid = gridFromConfig(diagramService);

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
