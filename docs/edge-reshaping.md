# Layout and edge reshaping

No automatic node layout is included. Device positions are explicit in `data.ts`. Wire routing has two modes:

**Auto routing (default).** ng-diagram's built-in orthogonal algorithm, configured in `diagram/diagram.component.ts`:

```ts
edgeRouting: {
  defaultRouting: 'orthogonal',
  orthogonal: {
    firstLastSegmentLength: 80,
    maxCornerRadius: 4,
  },
},
```

`firstLastSegmentLength` guarantees enough straight horizontal space at each end of the wire to fit the label.

**Manual routing.** As soon as the user grabs a bend handle, the wire flips to `routingMode: 'manual'` and ng-diagram renders through user-supplied `points` instead of recomputing a path on every change. The feature is structured to mirror ng-diagram's own resize feature so it can be lifted into the library later (see [Porting edge reshaping into ng-diagram](#porting-edge-reshaping-into-ng-diagram) below).

Three logical layers across five focused folders:

- **Gesture layer** (`directives/`, `handlers/`) — UI-bound. Knows about pointer events, edge components, and how a gesture maps to a command.
- **Command pipeline** (`commands/`, `middleware/`) — ng-diagram-coupled. The mutation entry point plus the cross-cutting reactions that fan out from it (lifecycle events, node-move endpoint sync).
- **Pure logic** (`logic/`) — no Angular, no ng-diagram services. Orthogonal-path math, fully unit-tested.

```
src/app/av-schematic/diagram/edge-reshaping/
├── directives/    UI / gesture detection           ┐  gesture
├── handlers/      gesture → command translation    ┘
├── commands/      command + dispatcher             ┐  command pipeline
├── middleware/    cross-cutting reactions          ┘
└── logic/         pure functions + types              pure logic
```

| File | Role |
|---|---|
| `directives/edge-reshape.directive.ts` | Per-handle directive. Owns the document-level `pointermove` / `pointerup` listeners so a gesture survives the DOM handle being re-rendered. Emits typed `reshapeStart` / `reshapeContinue` / `reshapeEnd` events; doesn't know about edges |
| `handlers/edge-reshape.handler.ts` | Translates pointer-phase events into reshape commands. Holds the in-flight drag state (snapshot of original points + the running last-computed path). Looks up the source port's orientation per gesture so `moveBend` works for any port side |
| `commands/dispatcher.ts` | App-local command dispatcher. Maps each command type to its executor; mirrors what `commandHandler.emit('reshapeEdge', ...)` does inside ng-diagram |
| `commands/reshape-edge.ts` | The data-bearing command. Applies all constraints: grid snap on every dispatch (so the dragged bend visibly steps between grid lines, like nodes do), full normalization pipeline on `finalize` (collinear merge, alternation snap, endpoint nudge). Reads snap config off `NgDiagramService.config()` |
| `commands/reshape-edge-lifecycle.ts` | `reshapeEdgeStart` / `reshapeEdgeStop` — payload-less signals fired at gesture boundaries. Dispatcher fans them out to the lifecycle emitter |
| `middleware/edge-endpoint-sync.service.ts` | Watches all manual edges. Reflows endpoints whenever a connected port moves (read from `Node.measuredPorts`). During a `nodeDragStarted` / `nodeDragEnded` window, runs reflow only and defers simplify until the drag ends — same mid-drag-vs-commit split the bend gesture uses |
| `middleware/edge-reshape-lifecycle.emitter.ts` | Public-facing `edgeReshapeStarted` / `edgeReshapeEnded` EventEmitters. Subscribe to react to gesture boundaries (e.g., toolbars, telemetry) |
| `logic/` | Pure orthogonal-path math (one function per file, all unit-tested). See *Pure logic* below |
| `wire-edge.component.ts` | Thin renderer + gesture router. Computes handle positions via `getHandlerPositions`, lays vertex and ghost handles (theme-aware fills defined in `wire-edge.component.scss`), routes directive events to the handler |

**Pure logic** in `logic/`:

| File | Algorithm |
|---|---|
| `path-types.ts`, `constants.ts` | Types (`Orientation`, `BendHandle`, `GhostHandle`, `ReshapeOptions`); thresholds (`POINT_DISTANCE=20`, `ENDPOINT_OFFSET=1`, `ALIGNMENT_TOLERANCE=5`, `MAX_SAFE_ITERATIONS=3`) |
| `expected-segment-orientation.ts` | `expectedSegmentOrientation(index, sourceOrientation)` — orthogonal-invariant orientation of segment N (alternates from source). Replaces an index-parity helper so degenerate segments (two collocated points after an insert) still classify correctly |
| `port-orientation.ts`, `get-port-flow-position.ts` | Read `Node.measuredPorts[].side` to convert port sides to `'horizontal'` / `'vertical'`; compute the port's flow-coord position |
| `move-bend.ts` | Move a bend along the gesture position; locks the perpendicular axis when an adjacent segment touches the source/target port; propagates X/Y to interior neighbours so adjacent segments stay orthogonal |
| `insert-collocated-bends.ts` | Splits a segment by inserting two coincident bends at its midpoint; the caller drags the second one and the pair pulls apart along the perpendicular axis |
| `reflow-endpoint.ts` | Slides a port-side endpoint to a new position and shifts the immediately-adjacent bend along the constrained axis only |
| `remove-straight-segments.ts` | Drops near-collinear interior points (within `alignmentTolerance`), merging three consecutive segments into one |
| `correct-path.ts` | Snaps drifted segments back to H/V alternation; nudges first/last interior point by `endpointOffset` if a port-touching segment collapsed to zero length |
| `simplify-path.ts` | Iterative loop (`removeStraightSegments` → `correctPath` → `snapToGrid`), bounded by `MAX_SAFE_ITERATIONS`, honoring a `getMinInteriorBends` floor (refuses merges that would drop below the orthogonal minimum for the port pair) |
| `snap-to-grid.ts` | Segment-aware grid snap: leaves source/target endpoints untouched, keeps first/last bend's port-aligned axis intact, snaps only the *shared* coord of interior orthogonal segments |
| `get-handler-positions.ts` | Coord-derived bend (vertex) + ghost (segment-midpoint) handle positions; works for any port pair without a parity assumption |
| `get-default-min-interior-bends.ts` | `(sourceOrientation, targetOrientation) => 1` for perpendicular ports (L-shape), `=> 2` otherwise (Z- or U-shape minimum) |

**Gesture / event semantics.**

- *Vertex left-click + drag* — moves that bend; perpendicular-axis lock when adjacent to a port stub; on release, the simplify pipeline runs (collinear merge, endpoint nudge, optional grid snap).
- *Ghost left-click + drag* — inserts two collocated bends at the segment midpoint and starts dragging the second one; the pair pulls apart into an L-shaped detour.
- *Vertex right-click* — removes the orthogonal segment **after** the bend (toward target). Both endpoint bends of the segment go away; simplify snaps the bridging segment back to orthogonal. No fallback: the last interior bend can't be removed via vertex right-click — right-click the second-to-last instead, or use the ghost handle for the last segment.
- *Ghost right-click* — removes that exact segment.
- *Refused* when removal would drop interior bends below the orthogonal minimum for the port pair (1 for perpendicular ports, 2 for matching).

**Top/bottom port support.** Path orientation is derived from each edge's actual port sides (`Node.measuredPorts[].side`) rather than assuming horizontal stubs. Z-shape (matching ports), L-shape (perpendicular ports), and U-shape (same-side ports) all handled.

**Node-drag integration.** `EdgeEndpointSyncService` subscribes to `NgDiagramService.addEventListener('nodeDragStarted' / 'nodeDragEnded')`. While a node-drag is in flight it reflows endpoints raw; on `nodeDragEnded` it runs simplify on every manual edge connected to one of the dragged nodes — same bend-drag-style split between mid-drag responsiveness and commit-time cleanup. Per-edge port positions are read fresh from `Node.measuredPorts` on every tick (no lazy offset cache).

**Grid snap.** ng-diagram doesn't currently expose an edge-specific snap config — `SnappingConfig` only has node-drag and node-resize knobs (`shouldSnapDragForNode` / `computeSnapForNodeDrag` / `defaultDragSnap` and the resize counterparts). Rather than introduce our own ad-hoc knob, manual edge reshaping reuses the existing node-drag snap config: edges snap when `snapping.shouldSnapDragForNode(sourceNode)` returns `true`, with the step from `computeSnapForNodeDrag(sourceNode)` falling back to `defaultDragSnap`. With ng-diagram defaults (`shouldSnapDragForNode: () => false`) no snap fires — opting in for node drag opts in for edge bends too. Snap is applied on every dispatch (continue + finalize) via the segment-aware `snapToGrid`, so the dragged bend visually steps between grid lines like a snapped node.

The intended long-term solution is a dedicated `FlowConfig.edgeReshape.shouldSnapForEdge(edge)` / `computeSnapForEdge(edge)` mirror of the node API — letting a diagram opt-in to bend snap independently of node-drag snap. Until that lands inside ng-diagram, riding on the node predicate is the chosen v1 default (most diagrams that snap nodes also want bend points on the same grid; the few that don't can override `shouldSnapDragForNode` to be node-id-specific).

Automatic node layout (e.g., ELK or a custom signal-flow layout) is a likely future addition.

## Porting edge reshaping into ng-diagram

The feature is structured so the move into the ng-diagram library is mostly mechanical. The architecture mirrors how the resize feature is built today (`core/src/input-events/handlers/resize/`, `core/src/command-handler/commands/resize-node.ts`, `core/src/middleware-manager/middlewares/event-emitter/emitters/node-resize-lifecycle.emitter.ts`).

**Reading order:** start with `logic/` for the pure orthogonal-path math, then `commands/reshape-edge.ts` for the mutation entry point, then `wire-edge.component.ts` for the gesture surface. Everything else (directive, handler, dispatcher, middleware) is plumbing around those three.

What changes when porting:

| Today (in this app) | After porting (inside ng-diagram) |
|---|---|
| `directives/edge-reshape.directive.ts` | Lives in `lib/directives/input-events/edge-reshape/edge-reshape.directive.ts`. Routes events to `InputEventsRouterService` instead of `(reshapeStart)` / etc. outputs |
| `handlers/edge-reshape.handler.ts` (with private `state` field) | Lives in `core/src/input-events/handlers/edge-reshape/`. The drag state moves into `ActionStateManager.edgeReshape` (new entry alongside `dragging`, `resize`, `rotation`); reads/writes use `actionStateManager.edgeReshape` instead of a private field |
| `commands/dispatcher.ts` (app-local switch) | Removed. Each command function is registered in the `CommandMap` (`core/src/command-handler/commands/index.ts`). Handler calls `commandHandler.emit('reshapeEdge', { ... })` |
| `commands/reshape-edge.ts` taking `(modelService, diagramService, command)` | Same body, but signature becomes `(commandHandler, command)` — both `modelService.*` and `diagramService.*` reads come off `commandHandler.flowCore` (`flowCore.modelLookup`, `flowCore.config`) |
| `commands/reshape-edge-lifecycle.ts` (TS-only types) | Stays as command type definitions, but `reshapeEdgeStart` / `reshapeEdgeStop` are registered in `CommandMap` as no-op commands (matches `resizeNodeStart` / `resizeNodeStop` shape — empty payload, signal-only, used by lifecycle emitter middleware) |
| `middleware/edge-endpoint-sync.service.ts` (Angular service with `effect()`) | Becomes a middleware in `core/src/middleware-manager/middlewares/`. Listens for the node-move command in the update pipeline and runs reflow + simplify with the affected nodes from the action delta. The per-edge `lastKnownPorts` snapshot map goes away — middleware sees the previous state directly |
| `middleware/edge-reshape-lifecycle.emitter.ts` (Angular EventEmitters) | Becomes an emitter in `core/src/middleware-manager/middlewares/event-emitter/emitters/edge-reshape-lifecycle.emitter.ts`. `edgeReshapeStarted` / `edgeReshapeEnded` are added to `DiagramEventMap`; emission via `eventManager.deferredEmit('edgeReshapeStarted', { edgeId, edge })` |
| `logic/get-port-flow-position.ts` (local replica) | Deleted. Use the upstream `getPortFlowPosition` from `core/src/utils/get-port-flow-position.ts` (also handles node rotation) |
| `logic/port-orientation.ts` (`getEdgePortOrientations`, `getNodePortOrientation`) | Move into `core/src/utils/`; reconcile with any upstream port-side helper before landing |
| `logic/*` pure functions | Unchanged. Move into a folder under `core/src/utils/` (or a feature-scoped `core/src/edge-reshape/`); remain pure-TS, unit-tested |
| `wire-edge.component.ts` template logic | Stays in the application as a custom edge template — it's not a library concern. The directive (now a host directive on whatever handle component the library ships) gets imported from ng-diagram |

**Configuration shape.** Add to `FlowConfig`:

```ts
edgeReshape: {
  getMinInteriorBends: (edge: Edge) => number;  // default: derived from port pair via getDefaultMinInteriorBends
  // future: per-edge enable predicate, custom alignment tolerance, etc.
}
```

The handler reads it off `flowCore.config.edgeReshape.getMinInteriorBends(edge)` instead of calling `getDefaultMinInteriorBends` directly. The current app uses `getDefaultMinInteriorBends` inline as the v1 stub; the function signature already takes `edge` so the call site won't change.

**Public API after porting.**

- `Edge.points`, `Edge.routingMode: 'manual'` — already exists.
- New `DiagramEventMap` entries: `edgeReshapeStarted: { edgeId, edge }`, `edgeReshapeEnded: { edgeId, edge }`.
- New commands: `reshapeEdge`, `reshapeEdgeStart`, `reshapeEdgeStop` — programmatic callers can `commandHandler.emit('reshapeEdge', { edgeId, points, finalize })` to reshape an edge from outside a gesture.
- New `FlowConfig.edgeReshape.getMinInteriorBends`.

**Assumptions / decisions baked into the current implementation.**

1. **Right-click semantics:** vertex right-click removes the segment *after* the bend (no fallback). Right-click on a ghost handle removes that segment. Picked over the old "remove segment defined by bend with prefer-after / fallback-before" rule because the no-fallback variant gives every middle bend a unique, predictable effect (the old rule made the second-to-last and last bend-clicks collapse to the same removal).
2. **No auto-align target node** when removing the only middle bend (the React reference does this). Skipped per product decision; the min-bends check naturally refuses such removals.
3. **`getMinInteriorBends` defaults from port pair** (1 for perpendicular, 2 for matching). Coords might allow fewer (a Z with aligned ports collapses to 0), but we don't lower the floor based on geometry — too easy to misfire.
4. **Mid-drag simplify only on `nodeDragEnded`**, not on every node-position tick. Avoids visible "snap" mid-drag while a connected node is being dragged.
5. **Grid snap is gated by node-drag snap config** because ng-diagram has no edge-specific snap option in `SnappingConfig`. Edge snaps when `shouldSnapDragForNode(sourceNode)` returns `true`, with the same step size. Defaults (`() => false`) → no snap. Long-term, add `FlowConfig.edgeReshape.shouldSnapForEdge(edge)` and `computeSnapForEdge(edge)` so users can opt-in to bend snap independently of node-drag snap; the v1 stand-in keeps the two coupled.
6. **Snap is segment-shared-coord** (not per-point). Source/target endpoints are never snapped (port-driven); first/last bend's port-aligned axis is preserved; only the shared coord of an interior orthogonal segment lands on grid.
7. **Drag state is per-pointer-id**, single slot. Multi-touch second gesture would clobber the first; matches today's resize feature's behavior. ActionStateManager-based version (in ng-diagram) gets the same shape.
8. **`expectedSegmentOrientation(index, sourceOrientation)`** rather than coord-derived orientation. Coord-derived breaks on the "two collocated points" mid-insert case (X==X and Y==Y is ambiguous). The expected-orientation function uses the source port side as the parity reference, which stays well-defined throughout the gesture.
