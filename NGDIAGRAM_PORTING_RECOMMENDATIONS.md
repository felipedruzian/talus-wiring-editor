# ngDiagram Porting Recommendations

This document identifies the workarounds present in `ng-diagram-av-schematic` that exist solely to compensate for missing features in the `ng-diagram` library. For each workaround, it documents the current implementation in detail, explains why it qualifies as a workaround, proposes a concrete ngDiagram public API to replace it, and estimates effort and impact.

The template was originally conceived as advertising for ngDiagram. Today it doubles as a feature backlog. Every workaround listed here represents code that adopters will be forced to rewrite if they build similar applications. Every workaround moved into ngDiagram makes the template smaller, the library stronger, and the adoption story easier.

## Methodology

Files were classified into three buckets:

- **Workaround for missing ngDiagram feature.** Logic that has nothing to do with the AV schematic domain, but is present because ngDiagram does not provide the equivalent. These are candidates for porting.
- **Domain specific.** Logic specific to audio video schematics (device IDs, DXF export, library seed, theming). These belong in the application, not the library.
- **Internal glue.** Wrappers around ngDiagram internals that exist because the application does not have direct access. After porting, these wrappers disappear and should not be exposed in the public API.

Only the first bucket is in scope. The third bucket is mentioned where relevant but explicitly excluded from the porting recommendations.

## Priority Definitions

- **P0 Critical.** Blocks adoption for major use cases. Most adopters will hit the missing feature within their first week.
- **P1 High.** Universal pain point across most adopter projects. Workaround is a common pattern in the wider Angular community.
- **P2 Medium.** Quality of life. Reduces boilerplate but adopters can live without it short term.
- **P3 Low.** Polish. Eliminates small repetitive code in adopter projects.

---

## P0.1 Manual Edge Reshaping

**Status.** Largest single workaround in the codebase. 27 files across 5 layers.

### Current Implementation

Located in [diagram/edge-reshaping/](src/app/av-schematic/diagram/edge-reshaping/). Structure:

```
edge-reshaping/
├── commands/
│   ├── dispatcher.ts                  // routes commands to executors
│   ├── reshape-edge.ts                // writes new path to model
│   ├── reshape-edge-lifecycle.ts      // start/stop signals
│   └── types.ts                       // discriminated union of commands
├── handlers/
│   └── edge-reshape.handler.ts        // pointer events to commands, holds DragState
├── middleware/
│   ├── edge-endpoint-sync.service.ts  // see P0.2
│   └── edge-reshape-lifecycle.emitter.ts // public event emitter
├── directives/
│   └── edge-reshape.directive.ts      // pointer event capture and emit
└── logic/                             // pure functions, no Angular dependency
    ├── snap-to-grid.ts (+ spec)
    ├── simplify-path.ts (+ spec)
    ├── correct-path.ts (+ spec)
    ├── move-bend.ts (+ path-functions.spec)
    ├── reflow-endpoint.ts
    ├── insert-collocated-bends.ts (+ spec)
    ├── remove-straight-segments.ts (+ spec)
    ├── port-orientation.ts (+ spec)
    ├── expected-segment-orientation.ts (+ spec)
    ├── get-handler-positions.ts (+ spec)
    ├── get-default-min-interior-bends.ts (+ spec)
    ├── get-port-flow-position.ts
    ├── port-pair-coverage.spec.ts
    ├── point-array.ts
    ├── path-types.ts
    ├── constants.ts
    └── index.ts
```

50+ unit tests cover the pure logic layer. The Angular layers (handler, directive, middleware) are uncovered.

### What the User Sees

1. Select a manual-routed edge. Bend points appear as visible circles at each interior corner.
2. Ghost circles appear at midpoints between bends, semi-transparent.
3. Drag a bend. The path follows the cursor, snapping to grid if grid snap is enabled for the source node.
4. Drop the bend. The path is normalized: collinear segments merge, alternation enforced, endpoints nudged into orthogonal alignment.
5. Click a ghost circle. A new bend is inserted at that midpoint.

### Why It Is a Workaround

ngDiagram supports `routingMode: 'manual'` on edges, meaning "render this exact path of points". It does not support **editing** that path. There is no built-in UI, no command, no middleware, and no public event for bend manipulation. Every application that needs manual routing has to build all of this from scratch.

The author of this template explicitly documents the porting intent. From [edge-reshape.handler.ts:27-33](src/app/av-schematic/diagram/edge-reshaping/handlers/edge-reshape.handler.ts):

```typescript
/**
 * Porting target: when this lands inside ng-diagram, the inline `state`
 * field moves to `ActionStateManager.edgeReshape` so other parts of the
 * system can observe it (mirror of how dragging/resize state lives there
 * today). Method shapes don't change.
 */
```

From [edge-endpoint-sync.service.ts:44-49](src/app/av-schematic/diagram/edge-reshaping/middleware/edge-endpoint-sync.service.ts#L44-L49):

```typescript
/**
 * Porting target: when this lands inside ng-diagram, the state-observing
 * `effect()` becomes a middleware that listens for the `moveNode` /
 * node-drag-end commands. The middleware sees the affected nodes directly
 * (no per-edge port snapshot map needed) and dispatches `reshapeEdge`
 * through the command handler.
 */
```

The code was written with portability as a first-class concern. The `logic/` folder has zero `@angular/*` imports. It is a library inside a library, ready for extraction.

### Proposed ngDiagram Public API

Five components must land in ngDiagram for full feature parity.

**1. Renderable bend handles component.**

```typescript
// In ng-diagram public API
import { NgDiagramEdgeHandlesComponent } from 'ng-diagram';

// In an edge template:
@Component({
  template: `
    <svg:g>
      <ng-diagram-edge-path [points]="points()" />
      <ng-diagram-edge-handles
        [edge]="edge()"
        [showGhostHandles]="true"
        [handleSize]="6"
        (reshapeStart)="onReshapeStart($event)"
        (reshapeEnd)="onReshapeEnd($event)"
      />
    </svg:g>
  `,
})
export class MyWireEdge implements NgDiagramEdgeTemplate<MyData> {
  // ...
}
```

The component renders the bend circles and ghost circles, captures pointer events internally, dispatches `reshapeEdge` commands to the ngDiagram command handler, and emits lifecycle events. Adopters opt in by including it in their edge template.

**2. Built-in `reshapeEdge` command.**

ngDiagram already has a command handler pattern (`commandHandler.emit('moveNode', ...)`). Add `reshapeEdge`:

```typescript
diagramService.commandHandler.emit('reshapeEdge', {
  edgeId: 'edge-1',
  points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }],
  finalize: true,  // run normalization pipeline
});
```

When `finalize: true`, the engine applies `simplifyPath` (collinear merge, alternation enforcement, endpoint nudge). When `finalize: false`, it applies grid snap only (mid-drag).

**3. State in `ActionStateManager`.**

Today ngDiagram exposes `dragging` and `resizing` state. Add `edgeReshape`:

```typescript
diagramService.actionState.edgeReshape();  // signal<EdgeReshapeState | null>
// EdgeReshapeState: { edgeId, bendIndex, originalPoints, currentPoints }
```

Use cases. Sidebars can disable form inputs while reshape is active. Undo stack can group reshape into a single undo entry. Telemetry can measure reshape session duration. Plugins can react to reshape state.

**4. Lifecycle events.**

Mirror the existing `nodeDragStarted` / `nodeDragEnded` pattern:

```typescript
diagramService.addEventListener('edgeReshapeStarted', (event) => {
  // event: { edgeId: string }
});
diagramService.addEventListener('edgeReshapeEnded', (event) => {
  // event: { edgeId: string, finalPoints: Point[] }
});
```

**5. Pure path utilities as named exports.**

For adopters who want to write their own UI on top of the engine, expose the algorithm primitives:

```typescript
import {
  simplifyOrthogonalPath,
  snapPathToGrid,
  insertBendAtMidpoint,
  reflowEndpoint,
} from 'ng-diagram/utils';
```

These are the same functions that live in `logic/` today. Pure, no Angular dependency, fully unit tested.

### Migration Path for Existing Adopters

Adopters who already implemented their own reshape (this template, or any future similar template) follow this path:

1. Replace custom bend handle rendering with `<ng-diagram-edge-handles>`.
2. Remove custom command dispatcher. Direct calls to `commandHandler.emit('reshapeEdge', ...)` if any.
3. Remove custom middleware. Subscribe to `edgeReshapeStarted` / `edgeReshapeEnded` for app-level reactions.
4. Delete `logic/` folder. Use named exports from `ng-diagram/utils` instead.
5. Delete `EdgeReshapeEventHandler`, `EdgeReshapeDirective`, `EdgeReshapeLifecycleEmitter`. All native.

For this specific template, post-migration the `edge-reshaping/` folder collapses from 27 files to 0.

### Items Excluded from Public API

Per discussion with the project owner: `gridForEdge` in [reshape-edge.ts:31-44](src/app/av-schematic/diagram/edge-reshaping/commands/reshape-edge.ts#L31-L44) and the inline `reshapeEdge` executor in the same file are application-side wrappers around ngDiagram internals. They mirror reading the snapping configuration (`diagramService.config()?.snapping`) which becomes direct internal access once the code lives inside the library. These wrappers should not be ported as public API. They simply disappear.

### Effort Estimate

4 to 6 sprints (8 to 12 weeks) for the full feature including tests, documentation, and storybook examples.

### Impact

This is the single most valuable investment ngDiagram could make in 2026. Manual edge editing is a baseline feature in every competing diagram library (React Flow, GoJS, JointJS, mxGraph). Its absence is a deal breaker for the whole class of applications: schematic editors (this template), BPMN flows, network topology, ladder logic, P&ID diagrams, electrical CAD lite. Adopters evaluating ngDiagram against alternatives discover the gap during proof-of-concept and choose another library.

---

## P0.2 Edge Endpoint Reflow on Node Drag

**Status.** Critical companion feature to P0.1. Without this, manual routing is functionally broken.

### Current Implementation

Single file: [edge-endpoint-sync.service.ts](src/app/av-schematic/diagram/edge-reshaping/middleware/edge-endpoint-sync.service.ts) (185 lines).

Behavior:

1. On startup, attaches listeners to `nodeDragStarted` and `nodeDragEnded` from `NgDiagramService`.
2. Maintains `lastKnownPorts: Map<string, { source: Point, target: Point }>` indexed by edge ID.
3. Reactive effect observes `modelService.nodes()` and `modelService.edges()`.
4. For each manual-routed edge with at least 3 points, computes current source and target port positions via `getPortFlowPosition()`.
5. If port positions changed since the last snapshot, calls `reflowEndpoint()` for each affected end and dispatches a `reshapeEdge` command with `finalize: false` (during drag) or `finalize: true` (on `nodeDragEnded`).

The middleware avoids work in two ways:

- Snapshot map ensures no work when port positions are stable.
- During drag, only reflow runs (cheap). Full simplification runs once on drag end.

### Why It Is a Workaround

ngDiagram automatically reflows auto-routed edges when their connected nodes move. For manual-routed edges, it does nothing. The endpoint stays at its original coordinate, disconnected from the (now moved) port. Visually the edge dangles in space.

The application has to detect "port has moved" by tracking port positions across renders. That requires:

- Knowing every manual edge's current endpoints.
- Computing port positions from node geometry plus port layout.
- Distinguishing drag-in-progress from drag-end (so partial vs full normalization).

This is plumbing that belongs inside the engine.

### Proposed ngDiagram Public API

Native middleware, configurable per project or per edge:

```typescript
// Global config
provideNgDiagram({
  edgeRouting: {
    manual: {
      reflowEndpointsOnNodeDrag: true,  // default true
      simplifyOnDragEnd: true,          // default true
      gridSnap: 'inheritFromNode',      // 'inheritFromNode' | 'always' | 'never'
    },
  },
});

// Per-edge override
const edge: Edge = {
  id: 'edge-1',
  source: 'a',
  target: 'b',
  routingMode: 'manual',
  routingOptions: {
    reflowEndpointsOnNodeDrag: false,  // pin endpoints, do not follow port
  },
  points: [...],
};
```

When enabled, ngDiagram subscribes internally to its own node drag events. No application code required. The reflow happens before the next render frame, so users never see the dangling state.

### Migration Path

Adopters using the current workaround:

1. Set `edgeRouting.manual.reflowEndpointsOnNodeDrag: true` in `provideNgDiagram` config.
2. Remove `EdgeEndpointSyncService` and its provider entry.
3. Remove the side-effect-only `inject(EdgeEndpointSyncService)` line in the page component.
4. The `lastKnownPorts` map and all its tracking logic disappear.

Net result: 185 lines deleted, 1 config line added.

### Effort Estimate

1 sprint (2 weeks). Smaller than P0.1 because the algorithm exists already in the application; porting is mostly relocating and integrating with ngDiagram's existing event loop.

### Impact

Without this, P0.1 ships as a feature that visibly breaks when users drag nodes. Cannot be released without it. Treat as a single deliverable with P0.1.

---

## P1.1 Viewport Overlay Awareness

**Status.** Universal problem across every nontrivial diagram application.

### Current Implementation

Three files in [diagram/node-visibility/](src/app/av-schematic/diagram/node-visibility/):

**[node-visibility-config.service.ts](src/app/av-schematic/diagram/node-visibility/node-visibility-config.service.ts) (87 lines).** Service that holds:

- `viewportBounds: () => DOMRect` (one)
- `overlays: Map<string, () => DOMRect>` (many)

Computes per-side intrusion of each overlay into the viewport rect. Returns `ViewportInsets { top, right, bottom, left }`.

```typescript
getViewportInsets(): ViewportInsets {
  if (!this.viewportBounds) return {};
  const diagramRect = this.viewportBounds();
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const getBounds of this.overlays.values()) {
    const overlayRect = getBounds();
    const side = this.getOverlaySide(overlayRect, diagramRect);
    switch (side) {
      case 'top':
        inset.top = Math.max(inset.top, overlayRect.bottom - diagramRect.top);
        break;
      // ... right, bottom, left
    }
  }
  return inset;
}
```

**[viewport-bounds.directive.ts](src/app/av-schematic/diagram/node-visibility/viewport-bounds.directive.ts) (16 lines).** Directive `[appViewportBounds]` registers the host element as the viewport bounds source.

**[viewport-overlay.directive.ts](src/app/av-schematic/diagram/node-visibility/viewport-overlay.directive.ts) (26 lines).** Directive `[appViewportOverlay]="'navbar'"` registers the host element as an overlay obscuring the canvas.

Usage in [av-schematic-page.component.html](src/app/av-schematic/pages/av-schematic-page.component.html):

```html
<app-diagram appViewportBounds />
<div class="ui-overlay">
  <app-top-navbar appViewportOverlay="navbar" />
  <app-library-sidebar appViewportOverlay="library" />
  <app-properties-sidebar appViewportOverlay="properties" />
</div>
```

Consumed in [diagram.component.ts:127-138](src/app/av-schematic/diagram/diagram.component.ts#L127-L138):

```typescript
private zoomToFit(): void {
  const insets = this.nodeVisibilityConfigService.getViewportInsets();
  const pad = this.avConfig.viewport.zoomToFitPadding;
  this.viewportService.zoomToFit({
    padding: [
      (insets.top ?? 0) + pad,
      (insets.right ?? 0) + pad,
      (insets.bottom ?? 0) + pad,
      (insets.left ?? 0) + pad,
    ],
  });
}
```

### Why It Is a Workaround

ngDiagram does not know about UI overlays. The diagram canvas is treated as if it spans its full DOM bounds. When the application has a sidebar covering 360 pixels on the left, ngDiagram does not subtract that from the usable area.

`zoomToFit()` accepts a `padding` parameter, so the workaround is to compute padding manually based on overlay measurements. But `zoomToFit` is not the only viewport operation that needs this. Any future operation (`fitToSelection`, `centerOn`, `zoomToNodes`) would need the same calculation.

The deeper issue is that "padding" is the wrong abstraction. Padding implies extra space inside the canvas. Overlays imply space that is hidden, not empty. Using padding to model overlays works for `zoomToFit` but breaks for operations that need to know "what point is the visual center of the canvas right now". The visual center is shifted, not just the layout extent.

### Proposed ngDiagram Public API

Two complementary mechanisms.

**Mechanism A. Overlay directive.**

```typescript
// In application template
<app-diagram>
  <app-sidebar [ngDiagramOverlay]="'left'" />
  <app-toolbar [ngDiagramOverlay]="'top'" />
</app-diagram>
```

The directive is provided by ngDiagram and registers the host element as an overlay on the parent diagram. ngDiagram tracks the bounding rectangle via `ResizeObserver` and updates internal state when the overlay resizes. All viewport operations (zoom, pan, fit, center) automatically respect overlays.

This is the Angular-idiomatic solution and the one I recommend.

**Mechanism B. Imperative API for advanced cases.**

```typescript
viewportService.setUsableArea({ top: 0, right: 360, bottom: 0, left: 360 });
viewportService.clearUsableArea();
```

For applications with dynamic overlays that cannot be modeled as siblings of `<app-diagram>`. Returns to default (full canvas) when cleared.

**Visible viewport center signal.**

Once usable area is known, expose:

```typescript
viewportService.visibleCenter();  // signal<Point>. Center of usable area in flow coords.
viewportService.usableArea();     // signal<Rect>. Usable area in client coords.
```

Useful for "open dialog at canvas center" scenarios.

### Migration Path

1. Wrap overlay components with `[ngDiagramOverlay]="'left'"` etc.
2. Remove `NodeVisibilityConfigService`, `ViewportBoundsDirective`, `ViewportOverlayDirective` from the application.
3. Remove the `getViewportInsets()` calculation in `zoomToFit()`. The library handles it.
4. Net deletion: ~130 lines from the application.

### Effort Estimate

1 sprint (2 weeks). The logic is straightforward. Most effort is in API design (directive vs imperative) and documentation.

### Impact

Universal. Every diagram application has UI chrome. Every adopter writes some version of this calculation. Standardizing it in the library means every adopter gets correct behavior for free across all viewport operations, not just `zoomToFit`.

---

## P1.2 Partial Data Updates

**Status.** Developer experience bug. Low effort, high return.

### Current Implementation

[resolve-updates.ts](src/app/av-schematic/diagram/model/resolve-updates.ts) (54 lines). Pure function that:

1. Deduplicates patches by ID, merging multiple patches for the same entity.
2. Resolves each merged patch against the entity's current `data`, producing a complete `data` object.

```typescript
export const resolveUpdates = <
  TData extends object,
  TPatch extends { id: string; data?: Partial<TData> },
>(
  updates: readonly TPatch[],
  getById: (id: string) => { data?: TData } | null,
): TPatch[] => {
  const byId = new Map<string, TPatch>();
  for (const update of updates) {
    const existing = byId.get(update.id);
    byId.set(update.id, existing ? mergePatch(existing, update) : { ...update });
  }
  for (const [id, entry] of byId) {
    if (entry.data) {
      const current = getById(id);
      if (current?.data) {
        entry.data = { ...current.data, ...entry.data };
      }
    }
  }
  return [...byId.values()];
};
```

The reason for the merge step is documented in the file:

> Dedupes patches by id (merging them) and resolves each merged `data` against the entity's current `data`, so ng-diagram receives a full object. Its update API expects complete `data`, not partial patches.

### Why It Is a Workaround

ngDiagram's `updateNodeData(id, data)` and `updateEdgeData(id, data)` accept the **full** data object. Callers must merge themselves. The common case (change one field) becomes:

```typescript
const node = modelService.getNodeById(id);
modelService.updateNodeData(id, { ...node.data, label: 'new' });
```

Three problems compound:

1. **Verbosity.** Every field change requires a fetch-merge pattern.
2. **Race conditions.** If two patches land in the same tick, the second overwrites the first unless the application implements its own deduplication (which is exactly what `resolve-updates.ts` does).
3. **Testability.** Application authors write merge logic, then test it. ngDiagram could write it once, test it once.

This is pure DX debt. The pattern exists in this template because it had to. Every adopter doing field-level form updates writes the same.

### Proposed ngDiagram Public API

Add patch-semantics methods alongside the existing replace-semantics methods:

```typescript
// Existing (replace semantics, retained for clarity)
modelService.updateNodeData<T>(id: string, data: T): void;
modelService.updateEdgeData<T>(id: string, data: T): void;

// New (patch semantics)
modelService.patchNodeData<T>(id: string, patch: Partial<T>): void;
modelService.patchEdgeData<T>(id: string, patch: Partial<T>): void;
```

Internally `patchNodeData` reads current `data`, merges with the patch, and writes the result. Within a single transaction, patches for the same ID coalesce automatically (last write wins per field).

For nested data, accept either shallow merge (default, simpler) or document a deep merge variant:

```typescript
modelService.patchNodeData<T>(id, patch, { deep: true });
```

Most domain models are flat enough that shallow is fine. Deep is opt-in.

### Migration Path

1. Replace `updateNodeData(id, { ...node.data, ...patch })` with `patchNodeData(id, patch)`.
2. Delete `resolve-updates.ts` and its tests.
3. Adjust `ModelChanges.addNodeUpdates` and `ModelApplyService.apply` accordingly. They become much shorter.

### Effort Estimate

2 to 3 days including tests for shallow merge, deduplication within transactions, and edge cases (patch with `undefined` values).

### Impact

Touches every adopter who edits entity data via forms (which is most of them). Eliminates 50+ lines of merge code per project. Removes a class of subtle bugs (forgetting to spread current data, accidentally clearing fields).

---

## P2.1 Animated Viewport Transitions

**Status.** UX standard, currently absent.

### Current Implementation

[viewport-animation.service.ts](src/app/av-schematic/diagram/viewport-animation.service.ts) (62 lines). Single method `animateTo(target: Point)` that:

1. Cancels any in-flight animation.
2. Records start time and start position via `performance.now()` and `viewport()`.
3. Runs a `requestAnimationFrame` tick loop.
4. Each tick computes linear progress, applies `easeOutCubic`, lerps to target, calls `viewportService.moveViewport(nextX, nextY)`.
5. Stops when progress reaches 1.

```typescript
const easeOutCubic = (progress: number): number => 1 - Math.pow(1 - progress, 3);

private cancelPendingFrame(): void {
  if (this.rafId !== null) {
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
```

Cleanup via `DestroyRef.onDestroy(() => this.cancelPendingFrame())`.

Used by [port-focus.service.ts:35](src/app/av-schematic/diagram/port-focus.service.ts#L35) for "navigate to connected port" feature.

### Why It Is a Workaround

`viewportService.moveViewport(x, y)` jumps instantly to the target. There is no `panTo`, no `zoomTo`, no `fitToNode` with animation support. Any application that wants smooth viewport transitions must implement the RAF loop themselves.

### Proposed ngDiagram Public API

Make all viewport mutation methods animation-aware:

```typescript
viewportService.panTo(point: Point, options?: ViewportAnimationOptions): Promise<void>;
viewportService.zoomTo(scale: number, options?: ViewportAnimationOptions): Promise<void>;
viewportService.zoomToFit(options?: ZoomToFitOptions & ViewportAnimationOptions): Promise<void>;
viewportService.fitToNodes(nodeIds: string[], options?: ViewportAnimationOptions): Promise<void>;
viewportService.centerOn(nodeId: string, options?: ViewportAnimationOptions): Promise<void>;

interface ViewportAnimationOptions {
  duration?: number;        // ms, default 300
  easing?: EasingFunction;  // default ease-out-cubic
  animated?: boolean;       // default true. Set false to skip animation.
}

type EasingFunction =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | ((progress: number) => number);  // custom
```

Returned `Promise<void>` resolves when the animation completes (or immediately if `animated: false`). Useful for chaining: pan first, then zoom in.

```typescript
await viewportService.centerOn('node-42');
await viewportService.zoomTo(2, { duration: 200 });
```

Cancellation semantics: a new viewport mutation cancels any in-flight animation. The cancelled promise resolves (does not reject) so chains do not break.

### Migration Path

1. Replace `viewportAnimation.animateTo(target)` with `viewportService.panTo(target)`.
2. Delete `ViewportAnimationService`.
3. For "centerOn node" use case (P3.1 below), use the dedicated method.

### Effort Estimate

1 sprint (2 weeks). Half the time is API design and ensuring smooth interaction with user-initiated pan or zoom (drag should cancel animation gracefully).

### Impact

Animated viewport transitions are an expectation in 2025 UX. Every modern map, diagram, and canvas tool animates. Static jumps look broken.

---

## P2.2 Batch Model Operations with Guards

**Status.** Quality of life. Useful for bulk operations, undo, paste, import.

### Current Implementation

Two files:

**[model-changes.ts](src/app/av-schematic/diagram/model/model-changes.ts) (49 lines).** Accumulator class:

```typescript
export class ModelChanges {
  readonly nodeUpdates: NodeUpdate[] = [];
  readonly edgeUpdates: EdgeUpdate[] = [];
  readonly newNodes: DiagramNode<AvSchematicNodeData>[] = [];
  readonly newEdges: DiagramEdge<AvSchematicEdgeData>[] = [];
  readonly deleteNodeIds: string[] = [];
  readonly deleteEdgeIds: string[] = [];

  addNodeUpdates(...updates: NodeUpdate[]): void { /* ... */ }
  addNewNodes(...nodes: DiagramNode<AvSchematicNodeData>[]): void { /* ... */ }
  addDeleteNodeIds(...ids: string[]): void { /* ... */ }
  // ... etc
}
```

**[model-apply.service.ts](src/app/av-schematic/diagram/model/model-apply.service.ts) (52 lines).** Applies the accumulator atomically with guards:

```typescript
async apply(changes: ModelChanges = new ModelChanges()): Promise<void> {
  await this.diagramService.transaction(
    () => {
      if (changes.deleteEdgeIds.length > 0) {
        const toDelete = changes.deleteEdgeIds.filter((id) => this.modelService.getEdgeById(id));
        if (toDelete.length > 0) this.modelService.deleteEdges(toDelete);
      }
      // ... similar guards for deleteNodes, newNodes, newEdges
      if (changes.nodeUpdates.length > 0) {
        this.modelService.updateNodes(
          resolveUpdates(changes.nodeUpdates, (id) => this.modelService.getNodeById(id)),
        );
      }
      // ... edgeUpdates similar
    },
    { waitForMeasurements: true },
  );
}
```

Guards are non-trivial:

- Skip add if entity already exists (idempotent reapply).
- Skip delete if entity already missing (concurrent removal safe).
- Dedupe and merge update patches via `resolveUpdates` (see P1.2).

### Why It Is a Workaround

ngDiagram exposes `transaction()` as a low-level batching primitive. Inside the callback, the developer calls individual mutation methods. There is no higher-level "build a worklist, apply atomically with guards" pattern.

For interactive form edits this is fine (one change at a time). For bulk operations it adds boilerplate:

- Paste 50 nodes from clipboard. Need transaction with 50 `addNodes` calls.
- Undo a complex compound action. Need transaction reapplying delete plus add plus update.
- Import a file. Same.

Without guards, replaying these operations against a model that has changed since the worklist was built risks errors (add an existing ID throws, delete a missing ID throws).

### Proposed ngDiagram Public API

Builder-style transaction API:

```typescript
const changes = modelService.changes()
  .addNodes(...newNodes)
  .deleteNodes(['n1', 'n2'])
  .patchNode('n3', { label: 'updated' })
  .patchEdge('e1', { label: 'new' });

await modelService.apply(changes, {
  guard: 'skip',  // 'skip' | 'throw' | 'replace'
  waitForMeasurements: true,
});
```

`guard` modes:

- **`skip`** (default). Add idempotent (skip if exists), delete idempotent (skip if missing), patch only applies if entity exists. Safe for replay scenarios.
- **`throw`** (current behavior). Errors on stale operations. Useful for catching bugs in development.
- **`replace`** (advanced). Add overwrites if exists, delete plus add becomes update.

Alternatively, provide a callback-based API alongside the builder:

```typescript
await modelService.transaction(tx => {
  tx.addNode(node);              // skip silently if exists when guard is 'skip'
  tx.deleteNode(id);
  tx.patchNodeData(id, patch);   // see P1.2
});
```

Both forms accumulate to the same internal representation, applied atomically.

### Migration Path

1. Replace `new ModelChanges()` plus `apply(...)` with `modelService.changes()` builder.
2. Delete `ModelChanges`, `ModelApplyService`, `resolveUpdates` (latter already deleted in P1.2).
3. Net deletion: ~150 lines.

### Effort Estimate

1 sprint (2 weeks). Includes test coverage for all three guard modes and interaction with patch semantics from P1.2.

### Impact

Major for bulk operations (clipboard, import, undo). Minor for typical form-edit scenarios. The biggest win is eliminating a recurring pattern in adopter code.

---

## P3.1 Pan and Center Helpers

**Status.** Polish. Eliminates per-project math.

### Current Implementation

[port-focus.service.ts:38-53](src/app/av-schematic/diagram/port-focus.service.ts#L38-L53) computes the viewport target needed to center a given node:

```typescript
private viewportTargetForNode(node: Node): Point {
  const viewport = this.viewportService.viewport();
  const scale = viewport.scale;
  const viewportWidth = viewport.width ?? 0;
  const viewportHeight = viewport.height ?? 0;
  const nodeWidth = node.size?.width ?? 0;
  const nodeHeight = node.size?.height ?? 0;

  const nodeCenterX = node.position.x + nodeWidth / 2;
  const nodeCenterY = node.position.y + nodeHeight / 2;

  return {
    x: viewportWidth / 2 - nodeCenterX * scale,
    y: viewportHeight / 2 - nodeCenterY * scale,
  };
}
```

This is then passed to `ViewportAnimationService.animateTo()` for animated centering.

### Why It Is a Workaround

Centering a node is a primitive operation. Every search-jump, breadcrumb-click, keyboard-nav, "find selected" feature needs it. Each adopter writes the same coordinate math. ngDiagram knows the node position, knows the viewport size, knows the scale. It should expose:

```typescript
viewportService.centerOn(nodeId: string, options?: ViewportAnimationOptions): Promise<void>;
viewportService.centerOnPoint(point: Point, options?: ViewportAnimationOptions): Promise<void>;
viewportService.fitToNodes(nodeIds: string[], options?: ViewportAnimationOptions): Promise<void>;
```

After P2.1 lands, these methods automatically support animation.

### Migration Path

1. Replace the manual calculation with `viewportService.centerOn(nodeId)`.
2. `viewportTargetForNode` private method disappears.

### Effort Estimate

1 day. Mostly API exposure plus tests.

### Impact

Small per project, but additive across the ecosystem. Removes 15 lines of subtly-error-prone math from every adopter. Centering math has off-by-one-half mistakes (half node width vs full node width, scale before vs after centering) that are easy to get wrong.

---

## P3.2 Connectivity Traversal Helpers

**Status.** Polish. Reduces small repetitive lookups.

### Current Implementation

[port-focus.service.ts:20-36](src/app/av-schematic/diagram/port-focus.service.ts#L20-L36) finds the node connected via a specific port:

```typescript
navigateToConnectedPort(portId: string, originNodeId: string): void {
  const connectedEdge = this.modelService
    .getConnectedEdges(originNodeId)
    .find(
      (edge) =>
        (edge.source === originNodeId && edge.sourcePort === portId) ||
        (edge.target === originNodeId && edge.targetPort === portId),
    );
  if (!connectedEdge) return;

  const connectedNodeId =
    connectedEdge.source === originNodeId ? connectedEdge.target : connectedEdge.source;
  // ...
}
```

[element-mutation.service.ts:56-73](src/app/av-schematic/properties-sidebar/element-mutation.service.ts#L56-L73) does similar traversal to find orphaned edges after port removal.

### Why It Is a Workaround

`getConnectedEdges(nodeId)` returns all edges touching the node. Filtering down to "edges using a specific port" or "node on the other side of this port" is manual every time. The application has to remember to handle source vs target symmetry.

### Proposed ngDiagram Public API

Add helpers to `NgDiagramModelService`:

```typescript
modelService.getEdgesForPort(nodeId: string, portId: string): Edge[];
modelService.getConnectedNodes(nodeId: string, portId?: string): Node[];
modelService.getOppositeEnd(edge: Edge, nodeId: string): { nodeId: string; portId?: string } | null;
modelService.findOrphanedEdges(nodeId: string, removedPortIds: string[]): Edge[];
```

The last one specifically targets the use case in `element-mutation.service.ts`. Common enough to deserve a primitive.

### Migration Path

1. Replace manual filter chains with the new helpers.
2. `findOrphanedEdgeIds` private method in `ElementMutationService` disappears.

### Effort Estimate

1 day. Pure helper additions, easily tested.

### Impact

Marginal per project. But the source-vs-target asymmetry is a known source of bugs. Standardizing the API in the library means everyone gets the right semantics for free.

---

## What Is NOT for ngDiagram

For transparency and to prevent scope creep, the following items in this template look like workarounds but are domain or application concerns. They should remain in adopter projects.

| Element | Location | Why It Stays |
|---|---|---|
| Auto device ID generation | [diagram/model/auto-device-id.ts](src/app/av-schematic/diagram/model/auto-device-id.ts) | Generates IDs like `MIC-1` from category prefix. Pure AV schematic domain. |
| Random short ID generator | [shared/random-short-id.ts](src/app/av-schematic/shared/random-short-id.ts) | Generic 6-char ID utility. Not graph-specific. |
| DXF export | [export/dxf/](src/app/av-schematic/export/dxf/) and [export/dxf-av-schematic/](src/app/av-schematic/export/dxf-av-schematic/) | CAD format export. Out of scope for a graph engine. |
| PNG export wrapper | [export/diagram-export.service.ts](src/app/av-schematic/export/diagram-export.service.ts) | Thin wrapper around `html-to-image`. Could argue for a `viewportService.toCanvas()` helper, but PNG specifically is an application concern. |
| Device form, library forms | [shared/device-form/](src/app/av-schematic/shared/device-form/), [properties-sidebar/components/wire-form/](src/app/av-schematic/properties-sidebar/components/wire-form/) | Domain-specific UI. |
| Theme toggle | [top-navbar/theme-toggle.component.ts](src/app/av-schematic/top-navbar/theme-toggle.component.ts) | Application-level concern. ngDiagram already supports CSS theming via tokens. |
| Library palette seed | [library-sidebar/seed-library.ts](src/app/av-schematic/library-sidebar/seed-library.ts) | Application data. |
| Sidebars, navbar, minimap panel | Various | Application UI built on top of ngDiagram's `<ng-diagram-minimap>` and similar. |
| `gridForEdge` and `reshapeEdge` executor in [edge-reshaping/commands/reshape-edge.ts](src/app/av-schematic/diagram/edge-reshaping/commands/reshape-edge.ts) | See P0.1 | Internal wrappers. After porting they become direct internal access and disappear. Not for public API. |

## Priority Summary Table

| Priority | Feature | Files Removed from Template | Effort | Impact |
|---|---|---|---|---|
| P0.1 | Manual edge reshaping | 27 (entire `edge-reshaping/` folder) | 4 to 6 sprints | Critical. Deal breaker for major use cases. |
| P0.2 | Edge endpoint reflow on node drag | 1 (subset of P0.1, paired delivery) | 1 sprint | Critical companion to P0.1. |
| P1.1 | Viewport overlay awareness | 3 (`node-visibility/`) | 1 sprint | Universal. Every diagram app. |
| P1.2 | Partial data updates | 1 (`resolve-updates.ts`) plus simplification of others | 2 to 3 days | DX bug. Low cost, high return. |
| P2.1 | Animated viewport transitions | 1 (`viewport-animation.service.ts`) | 1 sprint | UX standard. |
| P2.2 | Batch model operations | 2 (`model-changes.ts`, `model-apply.service.ts`) | 1 sprint | Major for bulk ops, undo, paste. |
| P3.1 | Pan and center helpers | Cleanup in `port-focus.service.ts` | 1 day | Polish. Removes per-project math. |
| P3.2 | Connectivity traversal helpers | Cleanup in `port-focus.service.ts` and `element-mutation.service.ts` | 1 day | Polish. Standardizes a known footgun. |

### Total Template Code Reduction

After all P0 and P1 items ship in ngDiagram, this template loses approximately:

- 27 files from `edge-reshaping/` (P0.1 + P0.2)
- 3 files from `node-visibility/` (P1.1)
- 1 file from `model/` (P1.2, plus simplification of `model-apply.service.ts`)

Total: roughly 31 file deletions, 1500+ lines of code. The template shrinks from advertising "look at this complex setup" to advertising "look how little setup you need".

After P2 and P3 also ship, additional 5 files and ~300 lines disappear.

## Strategic Context

This template is simultaneously a marketing artifact and a backlog. Its size and complexity send a signal to potential adopters about the maturity of ngDiagram. Specifically:

A potential adopter evaluating ngDiagram against React Flow, GoJS, or similar opens this template. They see 27 files in `edge-reshaping/`, 3 files in `node-visibility/`, custom transaction batching in `model/`, and a hand-rolled animation service. Their conclusion: "this library is missing the basics; I will have to write this myself; let me look at React Flow instead".

After porting the P0 and P1 items into ngDiagram, the same adopter sees the same template with 31 fewer files. Their conclusion changes: "this library has everything I need out of the box; the template just shows me how to plug in my domain; this is the modern Angular choice for diagrams".

The ROI on this work is not measured in features delivered. It is measured in evaluation outcomes. The single most important thing ngDiagram can do in 2026 is reduce the apparent surface area of customer-written code in this template. Every workaround eliminated is one less reason to choose a competitor.

## Recommended Sequencing

**Quarter 1.** P1.2 (partial updates, 3 days) plus P3.1 and P3.2 (helpers, 2 days). Quick wins. Total: 1 week. Updates this template to delete `resolve-updates.ts`, simplify `port-focus.service.ts`, simplify `element-mutation.service.ts`. Visible immediate benefit.

**Quarter 2.** P1.1 (viewport overlay, 1 sprint) plus P2.1 (animated viewport, 1 sprint). Two focused mid-size features. Total: 4 weeks. Updates template to delete `node-visibility/` and `viewport-animation.service.ts`.

**Quarters 3 to 4.** P0.1 and P0.2 together (manual edge reshaping plus reflow, 5 to 7 sprints combined). The headline feature. Treat as a unified release: "ngDiagram 2.0 introduces native manual edge editing". Marketing event. Updates template to delete entire `edge-reshaping/` folder.

**Quarter 4 or later.** P2.2 (batch operations). Lower priority because applications can live with the current `transaction()` API. Useful but not blocking.

After all sequencing completes, this template is roughly half its current size, and its remaining content is genuinely AV-schematic-specific. At that point the template stops being a workaround showcase and starts being what it was always meant to be: a clean integration example.
