# ng-diagram AV Schematic Template

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/licenses/MIT)

_Live demo: TBD_

Interactive AV (audio/video) schematic diagram built with Angular 21 and [ng-diagram](https://www.npmjs.com/package/ng-diagram). Use this project as a starting point for building your own schematic, signal-flow, or device-wiring diagram. Minimal dependencies: only Angular and ng-diagram, with no opinionated third-party UI libraries.

Features:

- Custom `DeviceNode` template with header (deviceId / manufacturer / model) and per-side input/output port columns
- Custom `WireEdge` template with orthogonal routing and dual wire-id labels (near both ends)
- **Manual edge routing** — drag bend handles to reshape selected wires; midpoint ghost handles insert L-shaped detours; right-click drops segments; "Reset routing" in the sidebar restores ng-diagram's auto-routed Z-shape. Endpoints follow connected-node moves while keeping interior bends; honours the diagram's node-drag snap config for grid alignment. See [Layout → Manual routing](#layout) for the full behaviour and architecture.
- Per-port double-click to smoothly pan to the node connected on the other side
- Connector-type display per port (XLR, HDMI, Speakon, …)
- Selection and edge-highlighted states
- Minimap with zoom controls
- Properties sidebar with editable device and wire fields (live updates, debounced text inputs)
- Inline ports editor (add/remove/reorder ports, toggle direction, choose connector type from a list)
- Drag-and-drop **device library** sidebar — collapsible left panel with a curated set of templates (microphones, mixers, amplifiers, loudspeakers, displays, cameras, switchers, …) you drag onto the canvas to instantiate nodes
- Add / edit / remove your own library templates (manufacturer, model, category, ports), with a save-or-discard buffer so partial edits don't pollute the library
- Auto-generated `deviceId` on drop, by category prefix (`MIC-1`, `CAM-1`, … `DEV-1` for unmapped/empty categories) — picks the smallest integer not already used by another device of the same prefix
- Editable category **combobox** (predefined list with free-text input — pick from the dictionary or type a custom category)
- Dark/light theme
- **Export to PNG** (raster, theme-aware) and **Export to DXF** (vector, for AutoCAD / BricsCAD / LibreCAD) from a top-navbar dropdown

## Getting Started

**Prerequisites:** Node.js v20.19+ or v22.12+, npm 10+

```bash
npm install
npm start
```

Open [http://localhost:4200](http://localhost:4200).

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run format` | Format code with Prettier |

## ng-diagram APIs Demonstrated

This template wires up a focused subset of the ng-diagram public surface. Useful as a reference for which APIs to reach for in a wiring/schematic integration.

| Concern | API | Where in this repo |
|---|---|---|
| Bootstrap | `provideNgDiagram()` | `pages/av-schematic-page.component.ts` |
| Diagram component | `<ng-diagram>` (`NgDiagramComponent`) | `diagram/diagram.component.html` |
| Background | `<ng-diagram-background>` (`NgDiagramBackgroundComponent`) | `diagram/diagram.component.html` |
| Minimap | `<ng-diagram-minimap>` (`NgDiagramMinimapComponent`) | `minimap-panel/minimap-panel.component.ts` |
| Custom node template | `NgDiagramNodeTemplateMap`, `NgDiagramNodeTemplate<TData>` interface | `diagram/diagram.component.ts`, `diagram/node/device-node.component.ts` |
| Custom edge template | `NgDiagramEdgeTemplateMap`, `NgDiagramEdgeTemplate<TData>`, `NgDiagramBaseEdgeComponent` | `diagram/wire-edge.component.ts` |
| Edge labels | `NgDiagramBaseEdgeLabelComponent`, `EdgeLabelPosition` (absolute `'30px'` and `'-30px'`) | `diagram/wire-edge.component.html` |
| Connection ports | `<ng-diagram-port>` (`NgDiagramPortComponent`) | `diagram/node/device-node.component.html` |
| Palette items | `<ng-diagram-palette-item>` (`NgDiagramPaletteItemComponent`), `<ng-diagram-palette-item-preview>` (`NgDiagramPaletteItemPreviewComponent`), `NgDiagramPaletteItem` (defaults to `BasePaletteItemData` which requires a `label` — `asDevicePaletteItem()` localizes the cast since our device nodes have no label) | `library-sidebar/components/library-list-item/*` |
| Palette drop | `paletteItemDropped` output, `PaletteItemDroppedEvent` (used to auto-fill missing `deviceId`) | `diagram/diagram.component.ts` |
| Edge routing | `NgDiagramConfig.edgeRouting` (`orthogonal` with `firstLastSegmentLength`, `maxCornerRadius`) | `diagram/diagram.component.ts` |
| Manual edge points | `Edge.points`, `Edge.routingMode: 'manual'` | `diagram/edge-reshaping/*` |
| Node-drag lifecycle | `NgDiagramService.addEventListener('nodeDragStarted' / 'nodeDragEnded')` | `diagram/edge-reshaping/middleware/edge-endpoint-sync.service.ts` |
| Port-side metadata | `Node.measuredPorts[].side`, `Edge.sourcePort` / `targetPort` | `diagram/edge-reshaping/logic/port-orientation.ts`, `diagram/edge-reshaping/logic/get-port-flow-position.ts` |
| Snap config | `NgDiagramConfig.snapping` (`shouldSnapDragForNode`, `defaultDragSnap`, `computeSnapForNodeDrag`) | `diagram/edge-reshaping/commands/reshape-edge.ts` |
| Linking | `NgDiagramConfig.linking.finalEdgeDataBuilder` (assigns wire type and generates a wireId) | `diagram/diagram.component.ts` |
| Model init | `initializeModel()` | `diagram/diagram.component.ts` |
| Model reads | `NgDiagramModelService` (`getNodeById`, `getEdgeById`, `getConnectedEdges`) | `diagram/port-focus.service.ts`, `diagram/model/model-apply.service.ts` |
| Model writes | `NgDiagramModelService` (`addNodes`, `addEdges`, `deleteNodes`, `deleteEdges`, `updateNodes`, `updateEdges`) | `diagram/model/model-apply.service.ts` |
| Live data edits | `NgDiagramModelService` (`updateNodeData`, `updateEdgeData`) | `properties-sidebar/element-mutation.service.ts` |
| Atomic transactions | `NgDiagramService.transaction(..., { waitForMeasurements: true })` | `diagram/model/model-apply.service.ts` |
| Template-output event payloads | `DiagramInitEvent`, `SelectionGestureEndedEvent` | `diagram/diagram.component.ts` |
| Viewport state | `NgDiagramViewportService` (`scale()`, `viewport()`, `canZoomIn`, `canZoomOut`) | `minimap-panel/minimap-panel.component.ts` |
| Viewport actions | `NgDiagramViewportService` (`zoomToFit`, `zoom`, `moveViewport`) | `diagram/diagram.component.ts`, `diagram/viewport-animation.service.ts`, `minimap-panel/minimap-panel.component.ts` |
| Selection | `NgDiagramSelectionService` (`selection()`) | `properties-sidebar/properties-sidebar.service.ts`, `diagram/node/device-node.component.ts` |
| Config typing | `NgDiagramConfig` | `diagram/diagram.component.ts` |
| Core types | `Node<TData>`, `Edge<TData>` | throughout |

## Customizing for Your Project

### Configuration

Tunable values (viewport zoom step, padding, etc.) are centralized in a single config file:

**`src/app/av-schematic/av-schematic.config.ts`**

To override defaults, add `provideAvSchematicConfig` to your page providers:

```typescript
import { provideAvSchematicConfig } from './av-schematic.config';

providers: [
  provideAvSchematicConfig({
    viewport: { zoomToFitPadding: 40, zoomStep: 0.2 },
  }),
]
```

Unspecified values keep their defaults. See `AvSchematicConfig` interface for all options.

### Data Model

Node and edge data interfaces are defined in `src/app/av-schematic/diagram/model/interfaces.ts`.

`DeviceNodeData`:

| Property | Purpose |
|---|---|
| `type: 'device'` | Discriminator |
| `deviceId` | Bold header line (e.g. `AMP-01`) |
| `manufacturer` | Header subtitle |
| `model` | Header subtitle |
| `category` | Free-text metadata (editable in sidebar) |
| `location` | Free-text metadata (editable in sidebar) |
| `ports` | Array of `DevicePort` |

`DevicePort`:

| Property | Purpose |
|---|---|
| `id` | Port id (referenced by edges via `sourcePort`/`targetPort`) |
| `label` | Visible port label (e.g. `OUT A`) |
| `direction` | `'input'` (left column) or `'output'` (right column) |
| `connectorType` | Optional subtitle (e.g. `XLR`, `HDMI`, `Speakon`) |

`WireEdgeData`:

| Property | Purpose |
|---|---|
| `type: 'wire'` | Discriminator |
| `wireId` | Rendered as label near both ends of the edge (editable in sidebar) |
| `wireType` | Optional signal kind: `audio`, `video`, `speaker`, `ethernet`, `power`, `control`, `usb`, `fiber` (editable in sidebar) |

### Node Component

`src/app/av-schematic/diagram/node/device-node.component.*` — single template, no variants for now. Header strip, separator, two port columns. Each port is a D-shaped connector poking outside the card edge, with a label and optional connector-type subtitle. Selection and edge-highlighted states are driven by host class bindings.

### Edge Component

`src/app/av-schematic/diagram/wire-edge.component.*` — delegates rendering to `NgDiagramBaseEdgeComponent` with orthogonal routing. Two `<ng-diagram-base-edge-label>` instances render the `wireId` near the source and near the target, positioned above the path.

### Adding Your Own Data

Replace the seed data in `src/app/av-schematic/diagram/data.ts`. Each device node needs:

- A unique `id`
- `type: 'deviceNode'` (use the `NodeTemplateType.DeviceNode` enum)
- An explicit `position: { x, y }` (no automatic layout — see [Layout](#layout))
- A `data` object matching `DeviceNodeData`

Each wire edge needs:

- A unique `id`
- `type: 'wireEdge'` (use the `EdgeTemplateType.WireEdge` enum)
- `source` / `target` device ids and `sourcePort` / `targetPort` port ids
- A `data` object matching `WireEdgeData`

### Device Library (drag-and-drop palette)

Left-side collapsible panel that holds **device templates** — recipes (no `id` / `position`) the user drags onto the canvas to create new nodes.

| File | Purpose |
|---|---|
| `library-sidebar/seed-library.ts` | Initial set of templates. Each entry is `{ libraryId, template: DeviceNodeData }`. `deviceId` and `location` are kept empty — they're instance fields, not template fields |
| `library-sidebar/library.service.ts` | Page-scoped state: `devices`, `isExpanded`, `editingDeviceId`, `editingMode`. `beginCreate()` / `beginEdit()` / `commitDraft()` / `closeDetail()` / `removeDevice()` |
| `library-sidebar/library-draft.service.ts` | Per-detail-session draft buffer. While the detail view is open, every form change writes here (not to the library). **Save** commits via `LibraryService.commitDraft`; **Back** simply tears the component down and the draft with it |
| `library-sidebar/components/library-list-item/*` | Each row wraps its content in `<ng-diagram-palette-item [item]="…">` with a custom `<ng-diagram-palette-item-preview>` ghost card. `<ng-diagram>` auto-handles the drop |
| `library-sidebar/components/library-detail/*` | Reuses `<app-device-form>` with a local `DeviceFormService` provider and an overridden `ON_DEVICE_FIELD_CHANGE` token that writes to the draft service. Hides `deviceId` and `location` by providing `DEVICE_FORM_HIDDEN_FIELDS = ['deviceId', 'location']` |
| `diagram/model/device-categories.ts` | Canonical category dictionary — `DEVICE_CATEGORY_PREFIXES` (`microphone` → `MIC`, `camera` → `CAM`, …), `DEVICE_CATEGORIES` (the keys, used by the combobox), `FALLBACK_DEVICE_PREFIX = 'DEV'` |
| `diagram/model/auto-device-id.ts` | `generateDeviceId(category, existingNodes)` — returns `<PREFIX>-<N>` where `N` is the smallest positive integer not already in use by a device of that prefix. Called from `(paletteItemDropped)` in `DiagramComponent` |

**Adding a category.** Add an entry to `DEVICE_CATEGORY_PREFIXES` in `device-categories.ts` and the combobox plus the ID generator pick it up automatically. Unmapped categories fall through to `DEV-N`.

**Adding library entries.** Append to `SEED_LIBRARY` in `seed-library.ts`. Stable `libraryId`s, empty `deviceId` (auto-generated on drop), realistic `manufacturer` / `model` / `category` / `ports`. Or use the in-app **+ Add device** button at the bottom of the list to build one interactively.

**Why `paletteItemDropped`?** ng-diagram's `<ng-diagram>` registers `PaletteDropDirective` automatically — the drop creates a node from the palette item's `data` without any wiring on our side. We only listen to the event so we can auto-assign a `deviceId` if the template's was empty (which is the default for library entries).

### Editable category combobox

`shared/combobox/combobox.component.*` — a `FormValueControl<string>` so it slots into existing `[formField]` bindings. Visual structure mirrors the orgchart project's combobox (bordered trigger wrapping a transparent input + caret button, listbox panel with the project's `--ngd-token-spacing-dropdown-*` and `--ngd-input-stroke-primary-*` tokens). Behavior is the editable variant: typed values that aren't in the list are kept as-is. `filterText` is held separately from `value` so opening the panel always shows all options — typing narrows the list. Used for the device-form's `category` field.

### Theming

Theme is driven by the `data-theme` attribute on `<html>` (`"light"` or `"dark"`) and persisted in `localStorage`. The toggle UI lives in `src/app/av-schematic/top-navbar/theme-toggle.component.ts`.

Color and dimension tokens are defined in `src/tokens.css`:

- **`--ngd-colors-*`** — base palette (grays + accent ramps `acc1`–`acc9`).
- **`--ngd-*` semantic tokens** — UI surfaces, text colors, edge defaults, etc., theme-aware.
- **`--av-*` schematic tokens** — node width, port dimensions, accent and wire stroke aliases:
  - `--av-node-width`, `--av-port-width`, `--av-port-height`
  - `--av-color-accent`, `--av-color-wire-stroke`

Global stylesheet entry point: `src/styles.css` (imports `tokens.css`, typography, and `ng-diagram/styles.css`).

### Export (PNG and DXF)

`src/app/av-schematic/export/` houses both formats. The trigger is a download icon in the top navbar (`top-navbar/export-menu/`) — disabled until the diagram has at least one node.

**PNG** is a raster capture via [`html-to-image`](https://www.npmjs.com/package/html-to-image): `computePartsBounds(nodes, edges)` plus a 50-unit padding defines the region; the canvas is rendered at 2× pixel ratio with the active theme's background color (resolved by walking up from the diagram canvas to the first non-transparent ancestor — usually `<html>`).

**DXF** is a clean, vector, layer-aware drawing for CAD tools, generated entirely client-side (no library dependency). The code is split into two folders so the architecture stays clear:

```
export/
├── diagram-export.service.ts       — exportPng() + exportDxf() entry points
├── dxf/                            — generic, domain-free DXF library
│   ├── dxf-entity.ts               — DxfLwPolyline, DxfText
│   ├── dxf-document.ts             — layers, text styles, entities, header vars
│   ├── dxf-layer.ts, dxf-text-style.ts
│   ├── dxf-coordinate-mapper.ts    — diagram coords → DXF mm (with Y-flip)
│   ├── dxf-types.ts                — renderer signatures + DxfExportConfig
│   ├── dxf-exporter.ts             — orchestrator: dispatches by node.type / edge.type
│   └── dxf-writer.ts               — DXF ASCII serializer (AutoCAD 2013, AC1027)
└── dxf-av-schematic/               — av-schematic-specific renderers
    ├── av-dxf-constants.ts         — layers, lineweights, sizes, fonts
    ├── av-dxf-config.ts            — buildAvDxfConfig() — wires renderers in
    ├── device-node-renderer.ts     — renders a `deviceNode` to DXF
    └── wire-edge-renderer.ts       — renders a `wireEdge` to DXF
```

The `dxf/` folder has no knowledge of devices, ports, or wires — it could be lifted into a standalone package as-is. All av-schematic specifics live in `dxf-av-schematic/`.

**DXF layers and lineweights.** Two layers (`DEVICES`, `WIRES`) so a CAD user can hide one or the other. Visual hierarchy is expressed through DXF lineweights (group code 370): `WIRE` 0.35mm, `FRAME` / `DETAIL` 0.25mm, `SUBTLE` 0.13mm. Tunable in `av-dxf-constants.ts`.

**Coordinate scale.** Renderers operate in diagram coordinates (matching `node.position` / `edge.points`); `CoordinateMapper` converts to DXF millimetres at a fixed `0.3 mm` per diagram unit. This is intentional — not paper-fitted — so a device's physical size in the DXF stays constant regardless of overall diagram size (large diagrams just produce a large extent, which is normal for CAD).

**Devices.** `device-node-renderer.ts` reads port positions from `node.measuredPorts` so they line up with where ng-diagram routes wires. Each port rectangle is drawn at a fixed size and snapped flush with the device frame on the side facing away from the node. Header text uses a 1.4 line-height ratio to mirror the rendered DOM.

**Wires.** `wire-edge-renderer.ts` emits one `LWPOLYLINE` per edge from `edge.points` — orthogonal today, point-following in the future, the renderer doesn't care. Each endpoint is extended a small distance toward the next routing point so it meets the outer edge of the snapped port rectangle (ng-diagram routes to the port's measured center, which sits slightly inside that edge). The `wireId` is rendered as text at two anchors along the polyline — one near each end, mirroring the two `<ng-diagram-base-edge-label>` markers in `wire-edge.component.html`.

#### Adding a renderer for a new node or edge type

1. Write a renderer function in `dxf-av-schematic/` matching the `DxfNodeRenderer` / `DxfEdgeRenderer` signature from `dxf/dxf-types.ts`. Use `ctx.mapper.mapPoint` / `mapLength` to convert diagram coordinates to DXF mm, and `ctx.doc.addEntity(...)` to emit `DxfLwPolyline` or `DxfText` records on the appropriate layer.
2. Register it in `av-dxf-config.ts` under the matching `node.type` / `edge.type` key.

`DxfExporter` will dispatch automatically — no changes are needed in `dxf/`. `device-node-renderer.ts` and `wire-edge-renderer.ts` are the reference implementations to copy from.

### Layout

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

**Manual routing.** As soon as the user grabs a bend handle, the wire flips to `routingMode: 'manual'` and ng-diagram renders through user-supplied `points` instead of recomputing a path on every change. The feature is structured to mirror ng-diagram's own resize feature so it can be lifted into the library later (see [Porting edge reshaping into ng-diagram](#porting-edge-reshaping-into-ng-diagram)).

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

### Porting edge reshaping into ng-diagram

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

## Architecture

### Service Hierarchy

All services are provided at the page component level (`AvSchematicPageComponent`), no `providedIn: 'root'`.

```
AvSchematicPageComponent (providers)
  ├── ng-diagram: provideNgDiagram()
  ├── Model: ModelApplyService
  ├── UI: PropertiesSidebarService → ElementMutationService
  ├── Library: LibraryService (left palette state, draft mode)
  ├── Visibility: NodeVisibilityConfigService
  ├── Navigation: PortFocusService → ViewportAnimationService
  ├── Export: DiagramExportService
  ├── Edge reshaping:
  │     ├── EdgeReshapeLifecycleEmitter   (subscribe for toolbar / telemetry hooks)
  │     ├── EdgeReshapeCommandDispatcher  (routes commands to executors)
  │     ├── EdgeReshapeEventHandler       (gesture → command translation)
  │     └── EdgeEndpointSyncService       (reflows endpoints on node moves)
  └── DiagramComponent
```

The page component subscribes to `EdgeReshapeLifecycleEmitter` and `console.log`s
`edgeReshapeStarted` / `edgeReshapeEnded` as a wiring example — replace the
log with a toolbar status, telemetry call, or undo-stack push as needed.

### Key Patterns

- **Compute-then-apply mutations** — services build a `ModelChanges` accumulator (partial data patches allowed); `ModelApplyService` resolves patches against current state and commits in a single `NgDiagramService.transaction(..., { waitForMeasurements: true })`. Used for structural ops (add/remove).
- **Live field edits bypass the transaction wrapper** — sidebar form changes call `NgDiagramModelService.updateNodeData` / `updateEdgeData` directly so each keystroke (after debounce) flips the model without staging through `ModelChanges`.
- **Signals-based sidebar forms** — each entity (`device-form`, `wire-form`) owns a form service that holds a signal-backed model via `@angular/forms/signals`. Text fields are debounced (300 ms); on each dirty change the service computes a diff and emits via an injected `ON_*_FIELD_CHANGE` callback to `ElementMutationService`. Switching selection flushes pending edits before reloading the form.
- **Form reuse via injection-token override** — `DeviceFormComponent` is decoupled from the diagram model: it only depends on the `ON_DEVICE_FIELD_CHANGE` token. The properties sidebar provides a handler that calls `ElementMutationService` (live diagram update); the library detail provides a handler that writes to a `LibraryDraftService` instead. Same form, two destinations.
- **Library save-or-discard buffer** — `LibraryDraftService` is provided per `LibraryDetailComponent` instance and holds the in-progress edit. Clicking **Save** commits via `LibraryService.commitDraft` (append for create, replace for edit). Clicking **Back** just closes the detail; the component (and its draft) is destroyed. No live writes to the library while editing.
- **Palette → diagram via `paletteItemDropped`** — `<ng-diagram>` auto-instantiates the dropped node from the palette item's `data`. The diagram listens to the event only to fill in a missing `deviceId` based on the dropped category and the IDs already in use.
- **Diagram-as-model** — there is no separate device/wire domain layer; the ng-diagram `Node<DeviceNodeData>` and `Edge<WireEdgeData>` are the source of truth.
- **Viewport overlays** — `appViewportBounds` / `appViewportOverlay` directives register UI elements that obscure the diagram so visibility / zoom-to-fit calculations account for them.
- **Per-row port positioning** — each `.port-row` is `position: relative`, so each `<ng-diagram-port>`'s absolute positioning anchors to its own row, not the whole node. Side-specific transforms push the port shape entirely outside the card edge.

## Project Structure

```
src/app/av-schematic/
├── av-schematic.config.ts                # Central configuration
├── pages/                                # Page container with providers
├── diagram/
│   ├── diagram.component.ts              # Main diagram component (paletteItemDropped → auto-id)
│   ├── wire-edge.component.ts            # Wire edge template (thin renderer + gesture router)
│   ├── port-focus.service.ts             # Pan viewport to connected node
│   ├── viewport-animation.service.ts     # Animated viewport pan primitive
│   ├── data.ts                           # Seed data
│   ├── model/                            # Domain types & services
│   │   ├── interfaces.ts                 # DeviceNodeData, WireEdgeData, DevicePort
│   │   ├── guards.ts                     # Type guards
│   │   ├── model-changes.ts              # Change accumulator
│   │   ├── model-apply.service.ts        # Atomic apply
│   │   ├── device-categories.ts          # Category → ID-prefix dictionary, used by combobox + auto-id
│   │   └── auto-device-id.ts             # generateDeviceId(category, existingNodes) → <PREFIX>-<N>
│   ├── edge-reshaping/                   # Manual edge routing — three layers, designed to port into ng-diagram
│   │   ├── directives/                   # UI / gesture detection (per-handle pointer state machine)
│   │   ├── handlers/                     # Gesture → command translation (holds in-flight drag state)
│   │   ├── commands/                     # reshapeEdge data + lifecycle signals + dispatcher
│   │   ├── middleware/                   # Endpoint-sync (node-move reflow) + lifecycle event emitters
│   │   └── logic/                        # Pure orthogonal-path math (segment orientation, simplify, snap, etc.)
│   ├── node/                             # DeviceNode template
│   └── node-visibility/                  # Viewport-aware overlay registration
├── properties-sidebar/                   # Right panel: edit selected device/wire (live updates)
│   ├── element-mutation.service.ts       # Removal + live field updates
│   └── components/
│       ├── sidebar-header/               # Generic toggle header (title/icon inputs — reused by library)
│       ├── sidebar-placeholder/          # Empty / multi states
│       └── wire-form/                    # Wire fields (signals form)
├── export/                               # PNG + DXF export (see "Export" section)
│   ├── diagram-export.service.ts         # exportPng() + exportDxf() entry points
│   ├── dxf/                              # Generic, domain-free DXF library
│   └── dxf-av-schematic/                 # av-schematic-specific node/edge renderers
├── library-sidebar/                      # Left panel: drag-drop palette of device templates
│   ├── library.service.ts                # Devices, expand/collapse, editing mode (create/edit)
│   ├── library-draft.service.ts          # Per-detail-session draft buffer (Save commits; Back discards)
│   ├── seed-library.ts                   # Initial templates + createBlankTemplate factory
│   └── components/
│       ├── library-list/                 # Scrollable list + "Add device" button
│       ├── library-list-item/            # Draggable row wrapping <ng-diagram-palette-item>
│       └── library-detail/               # Reuses <app-device-form> with overridden ON_DEVICE_FIELD_CHANGE
├── shared/
│   ├── autofocus/                        # Re-focus directive on selection change
│   ├── combobox/                         # Editable combobox (FormValueControl<string>)
│   ├── device-form/                      # Device fields (signals form). DEVICE_FORM_HIDDEN_FIELDS DI token controls visibility per-host
│   ├── form-field/                       # Label + projected input wrapper
│   ├── ports-editor/                     # Two-column ports editor (FormValueControl<DevicePort[]>)
│   └── sidebar-shell/                    # SCSS partial — common :host / .sidebar / animation rules
├── top-navbar/                           # Navigation bar + theme toggle + export menu
└── minimap-panel/                        # Minimap with zoom controls
```

## Tech Stack

- **Angular 21** — standalone components, signals, OnPush change detection
- **`@angular/forms/signals`** — sidebar forms (signal-backed `form()`, per-field `debounce()`)
- **ng-diagram** — diagram rendering, viewport management, selection, edge routing
- **html-to-image** — PNG capture (DXF has no library dependency, written as ASCII directly)
- **Prettier** — code formatting

## Known ng-diagram Issues

- **Port reorder doesn't refresh `measuredPorts`** ([#644](https://github.com/synergycodes/ng-diagram/issues/644)). Edges stay attached to the old port positions until something else triggers a `ResizeObserver` tick. Worked around in `diagram/node/device-node.component.html` with a 1px `[style.height]` parity toggle on `.port-shape`. Remove the workaround once the upstream fix lands.

## ng-diagram Documentation

For comprehensive ng-diagram documentation, examples, and API reference, visit: **[ngdiagram.dev/docs](https://www.ngdiagram.dev/docs)**

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/synergycodes/ng-diagram-av-schematic/issues)
- **Discussions**: [GitHub Discussions](https://github.com/synergycodes/ng-diagram-av-schematic/discussions)
- **ng-diagram Discussions**: [GitHub Discussions](https://github.com/synergycodes/ng-diagram/discussions), [Discord](https://discord.gg/FDMjRuarFb)
- **ng-diagram Documentation**: [ngdiagram.dev/docs](https://www.ngdiagram.dev/docs)

---

Built by the [Synergy Codes](https://www.synergycodes.com/) team
