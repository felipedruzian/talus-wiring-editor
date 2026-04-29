import { type NgDiagramModelService, type Point } from 'ng-diagram';
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

/**
 * Writes the new path to the model. When `finalize` is true (drag end /
 * one-shot operations like remove-segment), runs the normalization pipeline:
 * collinear merge, alternation snap, endpoint nudge — using the actual
 * port-side orientations of the edge.
 */
export const reshapeEdge = (
  modelService: NgDiagramModelService,
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
    });
  }

  modelService.updateEdge(command.edgeId, { points, routingMode: 'manual' });
};
