# Edge reshaping, linking & relinking

Wires in the AV schematic are orthogonal edges the user can reshape, draw out to
nothing (dangling), and reconnect to other ports. The feature is built in three
decoupled layers so the geometry stays portable and the interaction code stays
thin.

## Layers

```
edge-geometry/        pure functions — no ng-diagram model access, fully unit-tested
edge-reshaping/       segment-drag overlay + node-move re-anchoring
edge-relinking/       endpoint-drag handler + hovered-port highlight
edge-linking/         dangling-link creation from a port-to-empty draw
```

`edge-geometry/` is the only place the orthogonal-path math lives. Everything
above it converts pointer input to flow coordinates, calls the geometry, and
writes the result back through `NgDiagramModelService.updateEdge(s)`. This mirrors
ng-diagram's unidirectional flow (interaction → model write → signal re-render)
and keeps the geometry layer free to move into ng-diagram core later.

Manual-routed edges (`routingMode: 'manual'`, explicit `points`) own their path;
auto edges are routed by ng-diagram. Reshaping and relinking always pin an edge
to `manual`.

## Reshaping (`edge-reshaping/`)

`EdgeReshapeOverlayComponent` is a single overlay layered over the canvas (not
handles embedded per-edge): its inner layer is transformed by the viewport
`translate · scale`, and it renders a midpoint handle on every orthogonal
segment of every selected edge. Dragging a handle slides that segment
perpendicular to its axis, snapped to the grid.

- **Port anchoring** — a first/last segment touching a connected port grows an
  L-bend off the port instead of dragging the port itself
  (`reshapeAnchoredSegment`).
- **Live-port anchoring** — each move re-reads the live port positions so port
  drift never freezes into the route, then realigns the end-segment neighbour
  and orthogonalizes any diagonal left behind.
- **Merge only on drop** — mid-drag never simplifies; the committed route is
  exactly what was on screen. On pointer-up, `collapseCollinearBends` then
  `dropSameAxisBends` fold redundant bends once.
- **Node moves** — `applyEdgeStretchOnSelectionMoved` (wired to `selectionMoved`)
  re-anchors incident manual edges to the moved node's live ports, sliding
  interior bends or inserting an L-bend to stay orthogonal.

The overlay drives the gesture through `PointerDragController` (pointer capture +
move/up plumbing). The L-bend mask keeps the grabbed handle's `@for` track key
stable when a bend is injected mid-drag.

## Relinking (`edge-relinking/`)

Selecting a wire shows a ring grip at each endpoint (`appRelinkHandle` directive
for pointer capture). Dragging a grip moves that endpoint; the path is rebuilt
from the original points each move (bends never accumulate) and re-orthogonalized.

- Hovering within `PORT_SNAP_PX` of a port previews a connection and highlights
  the target via `RelinkTargetHighlightService` (the device node reads it and
  applies `is-link-target`) — the handle's pointer capture suppresses the native
  `:hover` link-draw uses, so the highlight is driven explicitly.
- Dropping on a port reconnects; dropping in empty space leaves the end dangling
  (`source`/`target: ''` with a stored `*Position`).
- **Merge only on drop** — mid-drag is orthogonalize-only; the collinear fold
  runs on connect / final dangling commit.

Relinking is intentionally independent of reshaping.

## Linking — dangling cables (`edge-linking/`)

ng-diagram discards a port-to-empty draw. `LinkDanglingService`
(on `edgeDrawEnded`) turns that into a one-ended manual edge. `TempEdgePointsService`
captures the live preview's rendered points each frame so the created edge keeps
the exact bends the user saw; otherwise a simple orthogonal stub is built. The
dangling end is grid-snapped.

## Grid

The snap step comes from `AV_SCHEMATIC_CONFIG.snapping.gridSize` (default 20).
`resolveEdgeGrid` mirrors ng-diagram's node-drag snap config so an edge snaps
exactly when node drag would. Device node port rows are sized to a multiple of
the grid step so port centres land on grid lines.

## Tests

`edge-geometry/*.spec.ts` cover the pure layer (segment reshaping, simplify
passes, orthogonalize, stretch, snap, axis classification). Run with `npm test`.
