# ng-diagram AV Schematic Template

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/licenses/MIT)

_Live demo: TBD_

Interactive AV (audio/video) schematic diagram built with Angular 21 and [ng-diagram](https://www.npmjs.com/package/ng-diagram). Use this project as a starting point for building your own schematic, signal-flow, or device-wiring diagram. Minimal dependencies: only Angular and ng-diagram, with no opinionated third-party UI libraries.

Features:

- Custom `DeviceNode` template with header (deviceId / manufacturer / model) and per-side input/output port columns
- Custom `WireEdge` template with orthogonal routing and dual wire-id labels (near both ends)
- **Manual edge routing** — drag bend handles to reshape selected wires; midpoint ghost handles insert L-shaped detours; right-click drops segments; "Reset routing" in the sidebar restores ng-diagram's auto-routed Z-shape. Endpoints follow connected-node moves while keeping interior bends; honours the diagram's node-drag snap config for grid alignment. See [`docs/edge-reshaping.md`](docs/edge-reshaping.md) for the full behaviour and architecture.
- Per-port double-click to smoothly pan to the node connected on the other side
- Connector-type display per port (XLR, HDMI, Speakon, …)
- Selection and edge-highlighted states
- Minimap with zoom controls
- Properties sidebar with editable device and wire fields (live updates, debounced text inputs)
- Inline ports editor (add/remove/reorder ports, toggle direction, choose connector type from a list)
- Drag-and-drop **device library** sidebar — collapsible left panel with a curated set of templates (microphones, mixers, amplifiers, loudspeakers, displays, cameras, switchers, …) you drag onto the canvas to instantiate nodes
- Library **search** with debounced live filtering and match highlighting in manufacturer / model
- Add / edit / remove your own library templates (manufacturer, model, category, ports), with a save-or-discard buffer so partial edits don't pollute the library
- Auto-generated `deviceId` on drop, by category prefix (`MIC-1`, `CAM-1`, … `DEV-1` for unmapped/empty categories) — picks the smallest integer not already used by another device of the same prefix
- Editable category **combobox** (predefined list with free-text input — pick from the dictionary or type a custom category)
- Dark/light theme
- **Export to PNG** (raster, theme-aware) and **Export to DXF** (vector, for AutoCAD / BricsCAD / LibreCAD) from a top-navbar dropdown — see [`docs/export.md`](docs/export.md)

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

## Documentation

Deep-dive documentation lives in [`docs/`](docs/):

- [`docs/architecture.md`](docs/architecture.md) — service hierarchy, key patterns, project structure
- [`docs/edge-reshaping.md`](docs/edge-reshaping.md) — manual edge routing: gesture/command/logic layers and the ng-diagram porting target
- [`docs/export.md`](docs/export.md) — PNG and DXF export pipelines

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
| Model reads | `NgDiagramModelService` (`getNodeById`, `getEdgeById`, `getConnectedEdges`) | `properties-sidebar/element-mutation.service.ts`, `properties-sidebar/properties-sidebar.service.ts`, `diagram/port-focus.service.ts` |
| Model writes | `NgDiagramModelService` (`deleteNodes`, `deleteEdges`) | `properties-sidebar/element-mutation.service.ts` |
| Live data edits | `NgDiagramModelService` (`updateNodeData`, `updateEdgeData`) | `properties-sidebar/element-mutation.service.ts` |
| Atomic transactions | `NgDiagramService.transaction(..., { waitForMeasurements: true })` | `properties-sidebar/element-mutation.service.ts` |
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
    snapping: { gridSize: 40 },          // or { enabled: false } to turn snap off
  }),
]
```

`snapping.enabled` (default `true`) toggles grid snap for both node drag and manual edge bends — the bend snap rides on the same opt-in, see [`docs/edge-reshaping.md`](docs/edge-reshaping.md). `gridSize` (default `20`) sets the step in diagram units. Unspecified values keep their defaults. See `AvSchematicConfig` interface for all options.

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
- An explicit `position: { x, y }` (no automatic layout — see [`docs/edge-reshaping.md`](docs/edge-reshaping.md))
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
| `library-sidebar/components/library-list-item/*` | Each row wraps its content in `<ng-diagram-palette-item [item]="…">` with a custom `<ng-diagram-palette-item-preview>` ghost card. `<ng-diagram>` auto-handles the drop. Manufacturer / model render as `HighlightSegmentsPipe` segments so search matches stand out |
| `library-sidebar/components/library-search/*` | Search input above the list. 150 ms debounced; writes to `LibraryService.searchQuery`, which drives `filteredDevices` (case-insensitive match against `manufacturer` or `model`). Survives navigation into the detail view and back |
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

## Tech Stack

- **Angular 21** — standalone components, signals, OnPush change detection
- **`@angular/forms/signals`** — sidebar forms (signal-backed `form()`, per-field `debounce()`)
- **ng-diagram** — diagram rendering, viewport management, selection, edge routing
- **html-to-image** — PNG capture (DXF has no library dependency, written as ASCII directly)
- **Prettier** — code formatting

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
