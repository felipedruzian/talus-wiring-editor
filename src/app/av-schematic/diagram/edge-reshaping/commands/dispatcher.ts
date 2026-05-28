import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService, NgDiagramService } from 'ng-diagram';
import { EdgeReshapeLifecycleEmitter } from '../middleware/edge-reshape-lifecycle.emitter';
import { reshapeEdge } from './reshape-edge';
import { type ReshapeCommand } from './types';

/**
 * App-local dispatcher that routes reshape commands to executors. Mirrors
 * what `commandHandler.emit('reshapeEdge', ...)` does inside ng-diagram.
 * Lifecycle commands fan out to the lifecycle emitter; the data command
 * runs the normalization pipeline (when finalize=true) and writes to the
 * model.
 */
@Injectable()
export class EdgeReshapeCommandDispatcher {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly diagramService = inject(NgDiagramService);
  private readonly lifecycle = inject(EdgeReshapeLifecycleEmitter);

  dispatch(command: ReshapeCommand): void {
    switch (command.type) {
      case 'reshapeEdgeStart': {
        this.lifecycle.emitStarted(command.edgeId);
        return;
      }
      case 'reshapeEdgeStop': {
        this.lifecycle.emitEnded(command.edgeId);
        return;
      }
      case 'reshapeEdge': {
        reshapeEdge(this.modelService, this.diagramService, command);
        return;
      }
    }
  }
}
