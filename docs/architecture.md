# Architecture

> **Tracer bullet da issue #1.** O diagrama semeado, o modelo de node e o
> formato canônico de projeto descritos aqui foram estendidos (não
> substituídos) para também representar uma placa física + nets importadas
> do WireViz no mesmo canvas, além de persistência via Salvar/Abrir contra
> um serviço local. Ver
> [`docs/wiring-tracer-bullet.md`](wiring-tracer-bullet.md) para a decisão
> de integração, [`docs/wireviz-import-limits.md`](wireviz-import-limits.md)
> para o pipeline de importação, [`docs/license-matrix.md`](license-matrix.md)
> para o status de licenciamento de cada peça reaproveitada, e
> [`docs/local-service.md`](local-service.md) para o serviço local e sua
> API.

## Service Hierarchy

All services are provided at the page component level (`AvSchematicPageComponent`), no `providedIn: 'root'`.

```
AvSchematicPageComponent (providers)
  ├── ng-diagram: provideNgDiagram()
  ├── UI: PropertiesSidebarService → ElementMutationService
  ├── Library: LibraryService (left palette state, draft mode)
  ├── Visibility: NodeVisibilityConfigService
  ├── Navigation: PortFocusService → ViewportAnimationService
  ├── Export: DiagramExportService
  ├── Persistência de projeto: ProjectStorageService
  ├── Edge reshaping:
  │     ├── EdgeReshapeLifecycleEmitter   (subscribe for toolbar / telemetry hooks)
  │     ├── EdgeReshapeCommandDispatcher  (routes commands to executors)
  │     ├── EdgeReshapeEventHandler       (gesture → command translation)
  │     └── EdgeEndpointSyncService       (reflows endpoints on node moves)
  └── DiagramComponent
```

The page constructor calls `bootstrapEdgeEndpointSync()` to eagerly instantiate `EdgeEndpointSyncService` — its constructor sets up the `effect()`s that watch the model, so the service has to be alive even though nothing reads it directly. The bootstrap helper is exported from the service file to keep the wiring next to the code that needs it.

The page component subscribes to `EdgeReshapeLifecycleEmitter` and `console.log`s
`edgeReshapeStarted` / `edgeReshapeEnded` as a wiring example — replace the
log with a toolbar status, telemetry call, or undo-stack push as needed.

## Key Patterns

- **Atomic structural mutations** — multi-step structural ops (e.g., node update + orphaned-edge delete in one go) wrap `NgDiagramService.transaction(..., { waitForMeasurements: true })` so the model commits in one batch and layout settles before any follow-up reads. See `ElementMutationService.handleDeviceFieldChange`. Single-op deletions wrap `transaction` too to preserve the `waitForMeasurements` semantics for layout-dependent callers.
- **Live field edits bypass the transaction wrapper** — sidebar form changes call `NgDiagramModelService.updateNodeData` / `updateEdgeData` directly so each keystroke (after debounce) flips the model without a structural batch.
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
│   ├── model/                            # Domain types & helpers
│   │   ├── interfaces.ts                 # DeviceNodeData, BoardNodeData, WireEdgeData, DevicePort
│   │   ├── guards.ts                     # Type guards (isDeviceNode, isBoardNode, ...)
│   │   ├── board-geometry.ts             # Geometria pura da grade de furos (holeLocalPoint, boardSize, allHoles)
│   │   ├── canonical-project.ts          # Round trip CanonicalProjectV1 <-> Node/Edge do ng-diagram (ver docs/wiring-tracer-bullet.md)
│   │   ├── device-categories.ts          # Category → ID-prefix dictionary, used by combobox + auto-id
│   │   └── auto-device-id.ts             # generateDeviceId(category, existingNodes) → <PREFIX>-<N>
│   ├── edge-reshaping/                   # Manual edge routing — three layers, designed to port into ng-diagram
│   │   ├── directives/                   # UI / gesture detection (per-handle pointer state machine)
│   │   ├── handlers/                     # Gesture → command translation (holds in-flight drag state)
│   │   ├── commands/                     # reshapeEdge data + lifecycle signals + dispatcher
│   │   ├── middleware/                   # Endpoint-sync (node-move reflow) + lifecycle event emitters
│   │   └── logic/                        # Pure orthogonal-path math (segment orientation, simplify, snap, etc.)
│   ├── node/                             # Templates DeviceNode + BoardNode
│   └── node-visibility/                  # Viewport-aware overlay registration
├── wireviz-import/                       # Importador clean-room de um subconjunto YAML do WireViz (ver docs/wireviz-import-limits.md)
│   ├── wireviz-yaml.ts                   # Parser genérico de valor de um subconjunto de YAML (sem conhecimento de WireViz)
│   ├── wireviz-model.ts                  # Valida + tipa o subconjunto connectors/cables/connections do WireViz
│   ├── wireviz-colors.ts                 # Subconjunto de código de cor WireViz -> cor CSS
│   ├── wireviz-to-diagram.ts             # WireVizDocument + placement -> Edge<WireEdgeData>[]
│   ├── import-wireviz.ts                 # Composição de conveniência importWireViz(yamlText)
│   └── fixtures/                         # Fixtures escritos à mão (minimal-two-nets: o fixture de 2 nets da issue #1)
├── project-storage/                      # Cliente de persistência de projeto (ver docs/local-service.md)
│   ├── project-storage.service.ts        # GET/PUT em /api/projects/:id; serializa via canonical-project.ts
│   └── project-storage-menu.component.ts # Controles Salvar/Abrir no top navbar (id de projeto + status)
├── properties-sidebar/                   # Right panel: edit selected device/wire (live updates)
│   ├── element-mutation.service.ts       # Removal + live field updates (wraps transactions for structural ops)
│   └── components/
│       ├── sidebar-header/               # Generic toggle header (title/icon inputs — reused by library)
│       ├── sidebar-placeholder/          # Empty / multi states
│       └── wire-form/                    # Wire fields (signals form)
├── export/                               # PNG + DXF export (see docs/export.md)
│   ├── diagram-export.service.ts         # exportPng() + exportDxf() entry points
│   ├── dxf/                              # Generic, domain-free DXF library
│   └── dxf-av-schematic/                 # av-schematic-specific node/edge renderers
├── device-form/                          # Device fields (signals form). DEVICE_FORM_HIDDEN_FIELDS DI token controls visibility per-host
├── library-sidebar/                      # Left panel: drag-drop palette of device templates
│   ├── library.service.ts                # Devices, expand/collapse, editing mode (create/edit)
│   ├── library-draft.service.ts          # Per-detail-session draft buffer (Save commits; Back discards)
│   ├── seed-library.ts                   # Initial templates + createBlankTemplate factory
│   └── components/
│       ├── library-list/                 # Scrollable list + "Add device" button
│       ├── library-list-item/            # Draggable row wrapping <ng-diagram-palette-item>
│       ├── library-search/               # Debounced search input feeding LibraryService.searchQuery
│       └── library-detail/               # Reuses <app-device-form> with overridden ON_DEVICE_FIELD_CHANGE
├── shared/                               # Generic, reusable building blocks (no domain coupling)
│   ├── ui/                               # Visual building blocks
│   │   ├── combobox/                     # Editable combobox (FormValueControl<string>)
│   │   ├── form-field/                   # Label + projected input wrapper
│   │   ├── highlight-segments/           # Pipe that splits text into matched / unmatched segments for safe (no innerHTML) highlighting
│   │   └── ports-editor/                 # Tabbed (Inputs / Outputs) ports editor (FormValueControl<DevicePort[]>)
│   ├── directives/                       # Standalone behavioral directives
│   │   ├── autofocus/                    # Re-focus directive (used by library detail when entering create/edit)
│   │   └── tooltip/                      # Custom [appTooltip] (top/right/bottom/left placement, body-portaled)
│   ├── forms/                            # Form infrastructure
│   │   └── debounced-form-controller.ts
│   ├── styles/                           # SCSS partials shared across features
│   │   └── sidebar-shell/                # common :host / .sidebar / animation rules
│   └── utils/                            # Pure functions
│       └── random-short-id.ts
├── top-navbar/                           # Navigation bar + theme toggle + export menu + menu Salvar/Abrir (app-project-storage-menu, de ../project-storage/)
│   ├── theme-toggle/                     # Light/dark theme switcher
│   └── export-menu/                      # PNG/DXF export trigger
└── minimap-panel/                        # Minimap with zoom controls
```
