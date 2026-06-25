import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { NgDiagramSelectionService, NgDiagramViewportService } from 'ng-diagram';
import {
  findReshapeableSegments,
  normalizeRoute,
  type ReshapeEndpointKind,
  type ReshapeSegment,
} from './logic';
import {
  EdgeReshapeHandler,
  type ReshapeDragState,
  type ReshapeStartDescriptor,
} from './handlers/edge-reshape.handler';

// Renders a reshape handle on every orthogonal segment of a selected edge and
// forwards the pointer gesture to the handler. UI only — no geometry, no model
// writes (those live in handlers/ and commands/).
@Component({
  selector: 'app-edge-reshape-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edge-reshape-overlay.component.html',
  styleUrl: './edge-reshape-overlay.component.scss',
})
export class EdgeReshapeOverlayComponent {
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly handler = inject(EdgeReshapeHandler);

  constructor() {
    // Release capture + clear the mask if destroyed mid-drag.
    inject(DestroyRef).onDestroy(() => {
      this.handler.teardown();
    });
  }

  protected readonly handles = computed<readonly ReshapeStartDescriptor[]>(() => {
    const drag = this.handler.current;
    const gestureOn = this.handler.gestureActive();
    const selection = this.selectionService.selection();
    const handles: ReshapeStartDescriptor[] = [];
    for (const edge of selection.edges) {
      const sourceKind = this.classifyEndpoint(edge.source);
      const targetKind = this.classifyEndpoint(edge.target);
      const isDragged = !!drag && gestureOn && drag.edgeId === edge.id;
      if (isDragged && drag) {
        const segments = findReshapeableSegments(edge.points, sourceKind, targetKind);
        for (const segment of this.maskInjectedBends(segments, drag, edge.points?.length ?? 0)) {
          handles.push({ edgeId: edge.id, ...segment });
        }
      } else {
        const segments = findReshapeableSegments(
          normalizeRoute(edge.points),
          sourceKind,
          targetKind,
        );
        for (const segment of segments) {
          handles.push({ edgeId: edge.id, ...segment });
        }
      }
    }
    return handles;
  });

  protected readonly transform = computed(() => {
    const viewport = this.viewportService.viewport();
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  });

  protected onPointerDown(event: PointerEvent, handle: ReshapeStartDescriptor): void {
    // Stop ng-diagram from treating this as selection / box-select.
    event.stopPropagation();
    event.preventDefault();
    this.handler.start(event, event.currentTarget as HTMLElement, handle);
  }

  // An edge end is anchored when connected to a port, dangling when loose.
  private classifyEndpoint(nodeId: string): ReshapeEndpointKind {
    return nodeId ? 'anchored' : 'dangling';
  }

  // Drop L-bends injected this gesture and shift the remaining indices so
  // the dragged handle keeps its original track key.
  private maskInjectedBends(
    segments: readonly ReshapeSegment[],
    drag: ReshapeDragState,
    liveLen: number,
  ): ReshapeSegment[] {
    const initialLen = drag.initialPoints.length;
    const lengthDiff = liveLen - initialLen;
    if (lengthDiff <= 0) return segments.slice();

    const sourceBendInserted =
      drag.anchorPortAtSource && drag.segmentIndex === 0 && lengthDiff >= 1;
    const targetBendInserted =
      drag.anchorPortAtTarget &&
      drag.segmentIndex === initialLen - 2 &&
      lengthDiff >= (sourceBendInserted ? 2 : 1);

    const targetBendLiveIndex = liveLen - 2;
    const result: ReshapeSegment[] = [];
    for (const segment of segments) {
      if (sourceBendInserted && segment.segmentIndex === 0) continue;
      if (targetBendInserted && segment.segmentIndex === targetBendLiveIndex) continue;
      const remapped = sourceBendInserted
        ? { ...segment, segmentIndex: segment.segmentIndex - 1 }
        : segment;
      result.push(remapped);
    }
    return result;
  }
}
