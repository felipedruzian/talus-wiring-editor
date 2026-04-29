import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { reshapeEdge } from './reshape-edge';
import { type ReshapeCommand } from './types';

/**
 * App-local dispatcher that maps reshape commands to executors. Mirrors what
 * `commandHandler.emit('reshapeEdge', ...)` does inside ng-diagram. Lifecycle
 * commands are pure signals here; step 8 will attach listeners that turn them
 * into public events.
 */
@Injectable()
export class EdgeReshapeCommandDispatcher {
  private readonly modelService = inject(NgDiagramModelService);

  dispatch(command: ReshapeCommand): void {
    switch (command.type) {
      case 'reshapeEdgeStart':
      case 'reshapeEdgeStop':
        return;
      case 'reshapeEdge':
        return reshapeEdge(this.modelService, command);
    }
  }
}
