import {
  type NgDiagramModelService,
  type NgDiagramService,
  type Point,
} from 'ng-diagram';
import {
  getDefaultMinInteriorBends,
  getEdgePortOrientations,
  simplifyPath,
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
 * Writes the new path to the model. When `finalize` is true (drag end /
 * remove-bend / endpoint-sync drag end), runs the normalization pipeline:
 * collinear merge, alternation snap, endpoint nudge, optional grid snap —
 * using the actual port-side orientations of the edge.
 */
export const reshapeEdge = (
  modelService: NgDiagramModelService,
  diagramService: NgDiagramService,
  command: ReshapeEdgeCommand,
): void => {
  let points = command.points;

  if (command.finalize) {
    const edge = modelService.getEdgeById(command.edgeId);
    const orientations = edge
      ? getEdgePortOrientations(modelService.nodes(), edge)
      : fallback;
    points = simplifyPath(points, orientations.source, orientations.target, {
      minInteriorBends: getDefaultMinInteriorBends(orientations.source, orientations.target),
      gridSize: gridFromConfig(diagramService),
    });
  }

  modelService.updateEdge(command.edgeId, { points, routingMode: 'manual' });
};
