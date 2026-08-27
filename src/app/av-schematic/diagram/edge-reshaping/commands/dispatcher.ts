import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { applyInsertBend, applyMoveBend, applyRemoveBend } from './bend-edge';
import { applyReshapeMove, finishReshape, setEdgeRoute } from './reshape-edge';
import type { EdgeCommand } from './types';

/**
 * The reshaping feature's model-write surface. The handler builds a typed
 * {@link EdgeCommand} and dispatches it here; this is the only place reshaping
 * mutates the model. Maps onto ng-diagram's command pipeline -- when reshaping
 * moves into core, these become first-class commands.
 */
@Injectable()
export class EdgeCommandDispatcher {
  private readonly model = inject(NgDiagramModelService);

  dispatch(command: EdgeCommand): void {
    switch (command.kind) {
      case 'set-edge-route':
        setEdgeRoute(this.model, command);
        return;
      case 'reshape-move':
        applyReshapeMove(this.model, command);
        return;
      case 'reshape-finish':
        finishReshape(this.model, command);
        return;
      case 'insert-bend':
        applyInsertBend(this.model, command);
        return;
      case 'remove-bend':
        applyRemoveBend(this.model, command);
        return;
      case 'move-bend':
        applyMoveBend(this.model, command);
        return;
    }
  }
}
