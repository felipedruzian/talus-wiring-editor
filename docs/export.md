# Export (PNG and DXF)

`src/app/av-schematic/export/` houses both formats. The trigger is a primary **Export** button in the top navbar (`top-navbar/export-menu/`), placed to the right of the theme toggle with a vertical separator — disabled until the diagram has at least one node.

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

## Adding a renderer for a new node or edge type

1. Write a renderer function in `dxf-av-schematic/` matching the `DxfNodeRenderer` / `DxfEdgeRenderer` signature from `dxf/dxf-types.ts`. Use `ctx.mapper.mapPoint` / `mapLength` to convert diagram coordinates to DXF mm, and `ctx.doc.addEntity(...)` to emit `DxfLwPolyline` or `DxfText` records on the appropriate layer.
2. Register it in `av-dxf-config.ts` under the matching `node.type` / `edge.type` key.

`DxfExporter` will dispatch automatically — no changes are needed in `dxf/`. `device-node-renderer.ts` and `wire-edge-renderer.ts` are the reference implementations to copy from.
