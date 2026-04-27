# ng-diagram AV Schematic Template

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/licenses/MIT)

_Live demo: TBD_

Interactive AV (audio/video) schematic diagram built with Angular 21 and [ng-diagram](https://www.npmjs.com/package/ng-diagram). Use this project as a starting point for building your own schematic, signal-flow, or device-wiring diagram. Minimal dependencies: only Angular and ng-diagram, with no opinionated third-party UI libraries.

Features:

- Custom `DeviceNode` template with header (deviceId / manufacturer / model) and per-side input/output port columns
- Custom `WireEdge` template with orthogonal routing and dual wire-id labels (near both ends)
- Per-port double-click to focus the node connected on the other side
- Connector-type display per port (XLR, HDMI, Speakon, …)
- Selection and edge-highlighted states
- Minimap with zoom controls
- Properties sidebar
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
| Edge routing | `NgDiagramConfig.edgeRouting` (`orthogonal` with `firstLastSegmentLength`, `maxCornerRadius`) | `diagram/diagram.component.ts` |
| Linking | `NgDiagramConfig.linking.finalEdgeDataBuilder` (assigns wire type and generates a wireId) | `diagram/diagram.component.ts` |
| Model init | `initializeModel()` | `diagram/diagram.component.ts` |
| Model reads | `NgDiagramModelService` (`getNodeById`, `getEdgeById`, `getConnectedEdges`) | `diagram/port-focus.service.ts`, `diagram/model/model-apply.service.ts` |
| Model writes | `NgDiagramModelService` (`addNodes`, `addEdges`, `deleteNodes`, `deleteEdges`, `updateNodes`, `updateEdges`) | `diagram/model/model-apply.service.ts` |
| Atomic transactions | `NgDiagramService.transaction(..., { waitForMeasurements: true })` | `diagram/model/model-apply.service.ts` |
| Template-output event payloads | `DiagramInitEvent`, `SelectionGestureEndedEvent` | `diagram/diagram.component.ts` |
| Viewport state | `NgDiagramViewportService` (`scale()`, `viewport()`, `canZoomIn`, `canZoomOut`) | `minimap-panel/minimap-panel.component.ts` |
| Viewport actions | `NgDiagramViewportService` (`zoomToFit`, `zoom`, `centerOnNode`) | `diagram/diagram.component.ts`, `diagram/port-focus.service.ts`, `minimap-panel/minimap-panel.component.ts` |
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
| `category` | Optional metadata (not displayed yet) |
| `location` | Optional metadata (not displayed yet) |
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
| `wireId` | Rendered as label near both ends of the edge |
| `wireType` | Optional metadata (not displayed yet) |

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
  ├── Visibility: NodeVisibilityConfigService
  ├── Navigation: PortFocusService
  └── DiagramComponent
```

### Key Patterns

- **Compute-then-apply mutations** — services build a `ModelChanges` accumulator (partial data patches allowed); `ModelApplyService` resolves patches against current state and commits in a single `NgDiagramService.transaction(..., { waitForMeasurements: true })`.
- **Diagram-as-model** — there is no separate device/wire domain layer; the ng-diagram `Node<DeviceNodeData>` and `Edge<WireEdgeData>` are the source of truth.
- **Viewport overlays** — `appViewportBounds` / `appViewportOverlay` directives register UI elements that obscure the diagram so visibility / zoom-to-fit calculations account for them.
- **Per-row port positioning** — each `.port-row` is `position: relative`, so each `<ng-diagram-port>`'s absolute positioning anchors to its own row, not the whole node. Side-specific transforms push the port shape entirely outside the card edge.

## Project Structure

```
src/app/av-schematic/
├── av-schematic.config.ts                # Central configuration
├── pages/                                # Page container with providers
├── diagram/
│   ├── diagram.component.ts              # Main diagram component
│   ├── wire-edge.component.ts            # Wire edge template
│   ├── port-focus.service.ts             # Pan viewport to connected node
│   ├── data.ts                           # Seed data
│   ├── model/                            # Domain types & services
│   │   ├── interfaces.ts                 # DeviceNodeData, WireEdgeData, DevicePort
│   │   ├── guards.ts                     # Type guards
│   │   ├── model-changes.ts              # Change accumulator
│   │   └── model-apply.service.ts        # Atomic apply
│   ├── node/                             # DeviceNode template
│   └── node-visibility/                  # Viewport-aware overlay registration
├── properties-sidebar/                   # Node properties panel
│   └── components/                       # Header, placeholder
├── top-navbar/                           # Navigation bar + theme toggle
├── toolbar/                              # Placeholder toolbar
└── minimap-panel/                        # Minimap with zoom controls
```

## Tech Stack

- **Angular 21** — standalone components, signals, OnPush change detection
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
