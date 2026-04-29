import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { EdgeReshapeLifecycleEmitter } from '../middleware/edge-reshape-lifecycle.emitter';
import { reshapeEdge } from './reshape-edge';
import { type ReshapeCommand } from './types';

/**
 * App-local dispatcher that routes reshape commands to executors. Mirrors
 * what `commandHandler.emit('reshapeEdge', ...)` does inside ng-diagram.
 * Lifecycle commands are signal-only here; they fan out to the lifecycle
 * emitter so external code can react to gesture boundaries.
 */
@Injectable()
export class EdgeReshapeCommandDispatcher {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly lifecycle = inject(EdgeReshapeLifecycleEmitter);

  dispatch(command: ReshapeCommand): void {
    switch (command.type) {
      case 'reshapeEdgeStart':
        return this.lifecycle.emitStarted(command.edgeId);
      case 'reshapeEdgeStop':
        return this.lifecycle.emitEnded(command.edgeId);
      case 'reshapeEdge':
        return reshapeEdge(this.modelService, command);
    }
  }
}
