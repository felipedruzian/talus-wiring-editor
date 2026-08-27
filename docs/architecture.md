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
  ├── Intercâmbio WireViz: WireVizExchangeService
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
- **Live field edits bypass the transaction wrapper** — sidebar form changes call `NgDiagramModelService.updateNodeData` / `updateEdgeData` directly so each keystroke (after `debounce`) flips the model without a structural batch.
- **Signals-based sidebar forms** — cada entidade (`device-form`, `wire-form`, `junction-form`) possui um serviço de formulário baseado em signals. Campos de texto são atualizados com `debounce`; cada alteração suja emite pelo token `ON_*_FIELD_CHANGE` para `ElementMutationService`. Trocar a seleção confirma edições pendentes antes de recarregar o formulário.
- **Form reuse via injection-token override** — `DeviceFormComponent` is decoupled from the diagram model: it only depends on the `ON_DEVICE_FIELD_CHANGE` token. The properties sidebar provides a handler that calls `ElementMutationService` (live diagram update); the library detail provides a handler that writes to a `LibraryDraftService` instead. Same form, two destinations.
- **Library save-or-discard buffer** — `LibraryDraftService` is provided per `LibraryDetailComponent` instance and holds the in-progress edit. Clicking **Save** commits via `LibraryService.commitDraft` (append for create, replace for edit). Clicking **Back** just closes the detail; the component (and its draft) is destroyed. No live writes to the library while editing.
- **Palette → diagram via `paletteItemDropped`** — `<ng-diagram>` auto-instantiates the dropped node from the palette item's `data`. The diagram listens to the event only to fill in a missing `deviceId` based on the dropped category and the IDs already in use.
- **Canvas + inventário como modelo vivo** — nodes e edges do `ng-diagram` são a fonte dos elementos visuais e condutores conectados. `ProjectStorageService` mantém, no mesmo escopo da página, o inventário de cabos sem aresta para que cabos desconectados e posições não usadas não desapareçam ao salvar.
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
│   │   ├── interfaces.ts                 # Dispositivos, placas, junções, portas e fios
│   │   ├── guards.ts                     # Type guards de node/edge
│   │   ├── board-geometry.ts             # Geometria pura da grade de furos (holeLocalPoint, boardSize, allHoles)
│   │   ├── canonical-project.ts          # CanonicalProjectV2 <-> Node/Edge; elétrica separada do layout
│   │   ├── canonical-project-parse.ts    # Validação v2 e migração de snapshots v1
│   │   ├── net-grouping.ts               # Nets determinísticas derivadas da conectividade
│   │   ├── electrical-equivalence.ts     # Comparação elétrica independente da ordem textual
│   │   ├── wire-colors.ts                # Códigos WireViz e RGB exato para modelo/renderização
│   │   ├── wireviz-schema-keys.ts        # Chaves canônicas/perigosas compartilhadas por import/export
│   │   ├── device-categories.ts          # Category → ID-prefix dictionary, used by combobox + auto-id
│   │   └── auto-device-id.ts             # generateDeviceId(category, existingNodes) → <PREFIX>-<N>
│   ├── edge-reshaping/                   # Manual edge routing — three layers, designed to port into ng-diagram
│   │   ├── directives/                   # UI / gesture detection (per-handle pointer state machine)
│   │   ├── handlers/                     # Gesture → command translation (holds in-flight drag state)
│   │   ├── commands/                     # reshapeEdge data + lifecycle signals + dispatcher
│   │   ├── middleware/                   # Endpoint-sync (node-move reflow) + lifecycle event emitters
│   │   └── logic/                        # Pure orthogonal-path math (segment orientation, simplify, snap, etc.)
│   ├── node/                             # Templates DeviceNode, BoardNode e JunctionNode
│   └── node-visibility/                  # Viewport-aware overlay registration
├── wireviz-import/                       # Importador clean-room de um subconjunto YAML do WireViz (ver docs/wireviz-import-limits.md)
│   ├── wireviz-yaml.ts                   # Parser genérico de valor de um subconjunto de YAML (sem conhecimento de WireViz)
│   ├── wireviz-model.ts                  # Valida + tipa o subconjunto connectors/cables/connections do WireViz
│   ├── wireviz-colors.ts                 # Vocabulário compartilhado de cores WireViz/CSS
│   ├── wireviz-to-diagram.ts             # WireVizDocument + placement -> CanonicalElectrical
│   ├── import-wireviz.ts                 # YAML -> elétrica + relatório de compatibilidade
│   ├── export-wireviz.ts                 # Elétrica -> YAML + relatório de compatibilidade
│   ├── wireviz-yaml-emit.ts              # Emissor do subconjunto YAML relido pelo importador
│   ├── wireviz-exchange.service.ts       # Importa/substitui o projeto e exporta/baixa YAML pela UI
│   ├── wireviz-tools.component.*         # Ações da barra superior + relatório global
│   └── fixtures/                         # Fixtures clean-room das issues #1 e #2
├── project-storage/                      # Cliente de persistência de projeto (ver docs/local-service.md)
│   ├── project-storage.service.ts        # GET/PUT em /api/projects/:id; serializa via canonical-project.ts
│   └── project-storage-menu.component.ts # Controles Salvar/Abrir no top navbar (id de projeto + status)
├── properties-sidebar/                   # Painel direito: edita dispositivo, junção ou fio selecionado
│   ├── element-mutation.service.ts       # Remoção + updates; redistribui taps quando o trilho muda
│   └── components/
│       ├── sidebar-header/               # Generic toggle header (title/icon inputs — reused by library)
│       ├── sidebar-placeholder/          # Empty / multi states
│       ├── junction-form/                # Nome, tipo, taps, notas e inspeção elétrica
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
