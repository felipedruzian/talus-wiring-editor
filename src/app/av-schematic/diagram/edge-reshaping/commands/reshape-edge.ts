import { type NgDiagramModelService, type Point } from 'ng-diagram';
import { simplifyPath } from '../logic';

export interface ReshapeEdgeCommand {
  type: 'reshapeEdge';
  edgeId: string;
  points: Point[];
  finalize: boolean;
}

/**
 * Writes the new path to the model. When `finalize` is true (drag end /
 * one-shot operations like remove-segment), runs the normalization pipeline
 * first — collinear merge, alternation snap, endpoint nudge. Continue-phase
 * dispatches use raw points so the gesture stays direct.
 *
 * The 'horizontal' literal for source/target orientations is the AV
 * left/right invariant; step 7 wires real port-side lookups.
 */
export const reshapeEdge = (
  modelService: NgDiagramModelService,
  command: ReshapeEdgeCommand,
): void => {
  const points = command.finalize
    ? simplifyPath(command.points, 'horizontal', 'horizontal', { minInteriorBends: 2 })
    : command.points;
  modelService.updateEdge(command.edgeId, { points, routingMode: 'manual' });
};
