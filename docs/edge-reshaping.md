# Edge reshaping, linking & relinking

Wires in the AV schematic are orthogonal edges the user can reshape, draw out to
nothing (dangling), and reconnect to other ports. These are **three separate
features**. Reshaping is the one structured as ng-diagram's pipeline
(interaction → command → middleware → model) so it can move into core; relinking
and dangling-edge creation are self-contained features that share only the pure
geometry.

```
diagram/
├── edge-reshaping/            reshaping feature (pipeline) + shared geometry
│   ├── directives/            gesture detection      pointer capture → start/move/end
│   ├── handlers/              gesture → command       own drag state, dispatch commands
│   ├── commands/              command + dispatcher    reshaping's only model-write surface
│   ├── middleware/            cross-cutting           node-move re-anchor (edge-stretch-on-move)
│   ├── logic/                 pure fns + types        shared geometry — no model access, unit-tested
│   └── edge-reshape-overlay.component.*               thin UI host: renders handles → handler
│
├── edge-relinking/            separate feature — drag an endpoint to reconnect / dangle
│   ├── relink-endpoint.handler.ts          owns the gesture + its own model writes
│   ├── relink-handle.directive.ts          endpoint-grip pointer capture
│   └── relink-target-highlight.service.ts  hovered-port highlight signal
│
└── dangling-edge-creation/    separate, AV-specific feature — draw a port into empty space
    ├── dangling-edge.service.ts            on edgeDrawEnded(noTarget) → add a one-ended wire
    └── temp-edge-points.service.ts         captures the live preview's bends for that wire
```

`edge-reshaping/logic/` is a leaf (imported by every layer and by the other two
features, importing none) — the unit intended to lift into core. Reshaping's
data flow: a **directive** captures the pointer → a **handler** owns the drag
state and dispatches a typed `EdgeCommand` → the **commands/** dispatcher is the
single place reshaping calls `NgDiagramModelService.updateEdge(s)`. Relinking and
dangling creation do their **own** writes directly (they are not on the command
pipeline); they depend on reshaping only for `logic/`.

Manual-routed edges (`routingMode: 'manual'`, explicit `points`) own their path;
auto edges are routed by ng-diagram. All three features pin edges to `manual`.

## Reshaping

`EdgeReshapeOverlayComponent` is a single overlay layered over the canvas (not
handles embedded per-edge): its inner layer is transformed by the viewport
`translate · scale`, and it renders a midpoint handle on every orthogonal
segment of every selected edge. Dragging a handle slides that segment
perpendicular to its axis.

- **Snapping is config-driven** — the grid is resolved per gesture via
  `resolveEdgeGrid`; when snapping is off it returns `null` and the segment moves
  freely. The geometry takes the grid as an argument (`null` = no snap), so the
  pure layer never assumes snapping is on.
- **Port anchoring** — a first/last segment touching a connected port grows an
  L-bend off the port instead of dragging the port itself
  (`reshapeAnchoredSegment`).
- **Live-port anchoring** — each move re-reads the live port positions so port
  drift never freezes into the route, then realigns the end-segment neighbour
  and orthogonalizes any diagonal left behind.
- **Merge only on drop** — mid-drag never simplifies; the committed route is
  exactly what was on screen. On pointer-up, `collapseCollinearBends` then
  `dropSameAxisBends` fold redundant bends once.

### Node moves

Manual edges don't auto-reroute, so `applyEdgeStretchOnSelectionMoved` re-anchors
each incident manual edge to the moved node's live ports, sliding interior bends
or inserting an L-bend to stay orthogonal. It runs in two phases, mirroring the
reshape/relink merge timing:

- `selectionMoved` (live drag) → `merge: false`: re-anchor only, never simplify.
- `nodeDragEnded` (drop) → `merge: true`: fold the now-collinear bends once.

`EdgeReshapeHandler` drives the gesture through `PointerDragController` (pointer
capture + move/up plumbing) and dispatches the commands. The overlay's L-bend
mask keeps the grabbed handle's `@for` track key stable when a bend is injected
mid-drag.

## Relinking

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

## Dangling-edge creation

ng-diagram discards a port-to-empty draw. `DanglingEdgeService` (on
`edgeDrawEnded` with no target) turns that into a one-ended manual edge.
`TempEdgePointsService` captures the live preview's rendered points each frame so
the created edge keeps the exact bends the user saw; otherwise a simple
orthogonal stub is built. The dangling end is grid-snapped. AV-specific: it mints
a `WireEdge` with a `wireId`.

## Grid

Reshaping, relinking and linking all resolve their grid through the same
`resolveEdgeGrid`, which mirrors ng-diagram's node-drag snap config: an edge
snaps exactly when its reference node would snap on drag, and not at all when
snapping is off (`null`). The step itself comes from
`AV_SCHEMATIC_CONFIG.snapping.gridSize` (default 20) via that config. Device node
port rows are sized to a multiple of the grid step so port centres land on grid
lines.

## Tests

`logic/*.spec.ts` cover the pure layer (segment reshaping, simplify
passes, orthogonalize, stretch, snap, axis classification). Run with `npm test`.

## Porting to ng-diagram core — known seams

The pure layer (`logic/`) imports only `ng-diagram` types and is the
intended unit to lift into core. Three places knowingly depend on app context
and would change on the way in:

- **Edge snap borrows node-drag snap.** `resolveEdgeGrid` keys off
  `shouldSnapDragForNode` because ng-diagram has no dedicated edge-snap config.
  Core should give edge snapping its own switch rather than piggybacking on the
  node one (also flagged in `edge-grid.ts`).
- **`portFlowPosition` assumes left/right ports.** It infers a port's side from
  its measured X to work around `port.side` being frozen when a same-id port is
  recreated with a new side (direction flip). The general, side-based version
  (all four sides) belongs in core, where the underlying `port.side` staleness
  should be fixed instead.
- **The command pipeline is emulated.** `commands/` + its dispatcher mirror
  ng-diagram's command flow, but ng-diagram exposes no public command-registration
  API, so the dispatcher ultimately calls `NgDiagramModelService` directly. In
  core these become first-class registered commands (and `middleware/` real
  middleware), with `directives/handlers/logic/` mapping across largely unchanged.
