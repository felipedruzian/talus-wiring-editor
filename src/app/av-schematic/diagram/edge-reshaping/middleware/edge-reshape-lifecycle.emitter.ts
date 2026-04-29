import { EventEmitter, Injectable, inject } from '@angular/core';
import { NgDiagramModelService, type Edge } from 'ng-diagram';

export interface EdgeReshapeStartedEvent {
  edgeId: string;
  edge: Edge;
}

export interface EdgeReshapeEndedEvent {
  edgeId: string;
  edge: Edge;
}

/**
 * Public-facing events fired at edge-reshape gesture boundaries. Listeners
 * subscribe to the EventEmitters; the dispatcher calls `emitStarted` /
 * `emitEnded` when the corresponding lifecycle commands flow through.
 *
 * Porting target: when this lands inside ng-diagram, the EventEmitters
 * become entries on the `DiagramEventMap` (alongside `nodeResizeStarted`,
 * `nodeDragEnded`, etc.), and emission moves into a middleware that
 * listens for `reshapeEdgeStart` / `reshapeEdgeStop` action types in the
 * update pipeline. The shape stays the same; the plumbing changes.
 */
@Injectable()
export class EdgeReshapeLifecycleEmitter {
  private readonly modelService = inject(NgDiagramModelService);

  readonly edgeReshapeStarted = new EventEmitter<EdgeReshapeStartedEvent>();
  readonly edgeReshapeEnded = new EventEmitter<EdgeReshapeEndedEvent>();

  emitStarted(edgeId: string): void {
    const edge = this.modelService.getEdgeById(edgeId);
    if (!edge) return;
    this.edgeReshapeStarted.emit({ edgeId, edge });
  }

  emitEnded(edgeId: string): void {
    const edge = this.modelService.getEdgeById(edgeId);
    if (!edge) return;
    this.edgeReshapeEnded.emit({ edgeId, edge });
  }
}
