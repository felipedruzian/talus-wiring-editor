# ng-diagram AV Schematic Template

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/licenses/MIT)

_Live demo: TBD_

Interactive AV (audio/video) schematic diagram built with Angular 21 and [ng-diagram](https://www.npmjs.com/package/ng-diagram). Use this project as a starting point for building your own schematic, signal-flow, or device-wiring diagram. Minimal dependencies: only Angular and ng-diagram, with no opinionated third-party UI libraries.

Features:

- Custom `DeviceNode` template with header (deviceId / manufacturer / model) and per-side input/output port columns
- Custom `WireEdge` template with orthogonal routing and dual wire-id labels (near both ends)
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
| Palette items | `<ng-diagram-palette-item>` (`NgDiagramPaletteItemComponent`), `<ng-diagram-palette-item-preview>` (`NgDiagramPaletteItemPreviewComponent`), `NgDiagramPaletteItem` (defaults to `BasePaletteItemData` which requires a `label` — we cast at the boundary since our nodes have no label) | `library-sidebar/components/library-list-item/*` |
| Palette drop | `paletteItemDropped` output, `PaletteItemDroppedEvent` (used to auto-fill missing `deviceId`) | `diagram/diagram.component.ts` |
| Edge routing | `NgDiagramConfig.edgeRouting` (`orthogonal` with `firstLastSegmentLength`, `maxCornerRadius`) | `diagram/diagram.component.ts` |
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

### Layout

No automatic layout is included. Device positions are explicit in `data.ts`. Wire routing is delegated to ng-diagram's built-in orthogonal routing, configured in `diagram/diagram.component.ts`:

```ts
edgeRouting: {
  defaultRouting: 'orthogonal',
  orthogonal: {
    firstLastSegmentLength: 80,
    maxCornerRadius: 4,
  },
},
```

`firstLastSegmentLength` guarantees enough straight horizontal space at each end of the wire to fit the label. Automatic node layout (e.g., ELK or a custom signal-flow layout) is a likely future addition.

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
  └── DiagramComponent
```

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
│   ├── wire-edge.component.ts            # Wire edge template
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
│   ├── node/                             # DeviceNode template
│   └── node-visibility/                  # Viewport-aware overlay registration
├── properties-sidebar/                   # Right panel: edit selected device/wire (live updates)
│   ├── element-mutation.service.ts       # Removal + live field updates
│   └── components/
│       ├── sidebar-header/               # Generic toggle header (title/icon inputs — reused by library)
│       ├── sidebar-placeholder/          # Empty / multi states
│       └── wire-form/                    # Wire fields (signals form)
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
├── top-navbar/                           # Navigation bar + theme toggle
├── toolbar/                              # Placeholder toolbar
└── minimap-panel/                        # Minimap with zoom controls
```

## Tech Stack

- **Angular 21** — standalone components, signals, OnPush change detection
- **`@angular/forms/signals`** — sidebar forms (signal-backed `form()`, per-field `debounce()`)
- **ng-diagram** — diagram rendering, viewport management, selection, edge routing
- **Prettier** — code formatting

## Known ng-diagram Issues

_None to call out yet for this template. Will be updated as we hit any._

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
