import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramSelectionService,
  NgDiagramViewportService,
  type Point,
} from 'ng-diagram';
import { AV_SCHEMATIC_CONFIG } from '../../av-schematic.config';
import {
  collapseCollinearBends,
  dropSameAxisBends,
  endpointNeighborAxis,
  findReshapeableSegments,
  orthogonalizePolyline,
  portFlowPosition,
  realignEndpointNeighbor,
  reshapeAnchoredSegment,
  type EdgeEndpointSide,
  type ReshapeEndpointKind,
  type ReshapeSegment,
} from '../edge-geometry';
import { PointerDragController } from './pointer-drag-controller';

interface HandleDescriptor extends ReshapeSegment {
  readonly edgeId: string;
}

interface DragState {
  readonly edgeId: string;
  readonly segmentIndex: number;
  readonly axis: 'horizontal' | 'vertical';
  readonly anchorPortAtSource: boolean;
  readonly anchorPortAtTarget: boolean;
  readonly initialPoints: { readonly x: number; readonly y: number }[];
  readonly initialClientX: number;
  readonly initialClientY: number;
}

// Reshape handles on every orthogonal segment of a selected edge. Dragging a
// segment flips the edge to `routingMode: 'manual'`; first/last segments anchor
// their port end (an L-bend grows off the port instead of dragging it).
@Component({
  selector: 'app-edge-reshape-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './edge-reshape-overlay.component.html',
  styleUrl: './edge-reshape-overlay.component.scss',
})
export class EdgeReshapeOverlayComponent {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly selectionService = inject(NgDiagramSelectionService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly avConfig = inject(AV_SCHEMATIC_CONFIG);

  private readonly gridPx = this.avConfig.snapping.gridSize;

  // Handle-bound, no frame coalescing: the reshape compute is light and the
  // grabbed handle stays mounted through the gesture (the L-bend mask keeps its
  // track key).
  private readonly drag = new PointerDragController<DragState>(
    {
      onMove: (event, state) => {
        this.applyPointerMove(event, state);
      },
      onEnd: (event, state) => {
        this.finishReshape(event, state);
      },
      onTeardown: () => {
        this.gestureActive.set(false);
      },
    },
    { listenerTarget: 'handle', coalesce: false },
  );

  // Masks L-bend insertions so the `@for track segmentIndex` doesn't
  // remap the grabbed DOM element off the cursor mid-drag.
  private readonly gestureActive = signal(false);

  constructor() {
    // Release capture + clear the mask if destroyed mid-drag.
    inject(DestroyRef).onDestroy(() => {
      this.drag.teardown();
    });
  }

  protected readonly handles = computed<readonly HandleDescriptor[]>(() => {
    const drag = this.drag.current;
    const gestureOn = this.gestureActive();
    const selection = this.selectionService.selection();
    const handles: HandleDescriptor[] = [];
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
          this.normalizeRoute(edge.points),
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

  // Drop L-bends injected this gesture and shift the remaining indices so
  // the dragged handle keeps its original track key.
  private maskInjectedBends(
    segments: readonly ReshapeSegment[],
    drag: DragState,
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

  // An edge end is anchored when connected to a port, dangling when loose.
  private classifyEndpoint(nodeId: string): ReshapeEndpointKind {
    return nodeId ? 'anchored' : 'dangling';
  }

  // Fold collinear vertices so a visually straight run is one reshape segment.
  private normalizeRoute(points: readonly Point[] | undefined): Point[] {
    if (!points) return [];
    return dropSameAxisBends(collapseCollinearBends(points));
  }

  protected readonly transform = computed(() => {
    const viewport = this.viewportService.viewport();
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
  });

  protected onPointerDown(event: PointerEvent, handle: HandleDescriptor): void {
    // Stop ng-diagram from treating this as selection / box-select.
    event.stopPropagation();
    event.preventDefault();

    const edge = this.modelService.getEdgeById(handle.edgeId);
    if (!edge?.points) return;

    const initialPoints = this.normalizeRoute(edge.points);
    if (initialPoints.length < 2) return;
    if (initialPoints.length !== edge.points.length) {
      this.modelService.updateEdge(handle.edgeId, {
        points: initialPoints,
        routingMode: 'manual',
      });
    }

    const handleEl = event.currentTarget as HTMLElement;
    this.gestureActive.set(true);
    this.drag.begin(event, handleEl, {
      edgeId: handle.edgeId,
      segmentIndex: handle.segmentIndex,
      axis: handle.axis,
      anchorPortAtSource: handle.anchorPortAtSource,
      anchorPortAtTarget: handle.anchorPortAtTarget,
      initialPoints,
      initialClientX: event.clientX,
      initialClientY: event.clientY,
    });
  }

  private applyPointerMove(event: PointerEvent, drag: DragState): void {
    const scale = this.viewportService.scale() || 1;
    const dxWorld = (event.clientX - drag.initialClientX) / scale;
    const dyWorld = (event.clientY - drag.initialClientY) / scale;

    const newPoints = reshapeAnchoredSegment(
      drag.initialPoints,
      drag.segmentIndex,
      drag.axis,
      dxWorld,
      dyWorld,
      this.gridPx,
      drag.anchorPortAtSource,
      drag.anchorPortAtTarget,
    );

    // Snap endpoints to LIVE ports so port drift doesn't freeze into the
    // route. Capture each end-segment's axis first so we can rebuild the stub
    // orthogonally after the anchor shift.
    const sourceAxisBeforeAnchor = endpointNeighborAxis(newPoints, 'source');
    const targetAxisBeforeAnchor = endpointNeighborAxis(newPoints, 'target');
    this.anchorEndpointToPort(newPoints, drag.edgeId, 'source');
    this.anchorEndpointToPort(newPoints, drag.edgeId, 'target');
    realignEndpointNeighbor(newPoints, 'source', sourceAxisBeforeAnchor);
    realignEndpointNeighbor(newPoints, 'target', targetAxisBeforeAnchor);
    // Mops up diagonals when the dragged segment had a same-axis sibling.
    const orthoPoints = orthogonalizePolyline(newPoints);

    this.modelService.updateEdge(drag.edgeId, {
      points: orthoPoints,
      routingMode: 'manual',
    });
  }

  // Replace the end vertex with the live port world position.
  private anchorEndpointToPort(
    points: { x: number; y: number }[],
    edgeId: string,
    side: EdgeEndpointSide,
  ): void {
    const edge = this.modelService.getEdgeById(edgeId);
    if (!edge) return;
    const nodeId = side === 'source' ? edge.source : edge.target;
    const portId = side === 'source' ? edge.sourcePort : edge.targetPort;
    if (!nodeId || !portId) return;
    const node = this.modelService.getNodeById(nodeId);
    const anchor = portFlowPosition(node, portId);
    if (!anchor) return;
    const idx = side === 'source' ? 0 : points.length - 1;
    points[idx] = anchor;
  }

  private finishReshape(event: PointerEvent, drag: DragState): void {
    // Fold redundant bends now (deferred from pointerMove). The controller
    // already cleared the gesture, so the recompute sees no L-bend mask.
    this.collapseAfterReshape(drag);
    // Prevent the trailing click from deselecting the edge.
    event.stopPropagation();
  }

  private collapseAfterReshape(drag: DragState): void {
    const edge = this.modelService.getEdgeById(drag.edgeId);
    if (!edge?.points || edge.points.length < 3) return;
    // Strict-collinear pass folds zero-length L-bends; same-axis pass
    // catches consecutive bends left sub-grid-misaligned by the reshape.
    const collapsed = dropSameAxisBends(collapseCollinearBends(edge.points));
    if (collapsed.length === edge.points.length) return;
    this.modelService.updateEdge(drag.edgeId, {
      points: collapsed,
      routingMode: 'manual',
    });
  }
}
