# Performance Analysis and Recommendations

This document captures the high-impact performance findings from a deep audit of `ng-diagram-av-schematic`. The audit covered change detection, signal usage, bundle composition, drag and drop performance, and stress behavior.

The application has solid fundamentals. OnPush change detection is applied universally. Signals and computed memoization are used consistently. Subscriptions and event listeners are cleaned up correctly. There are no memory leaks. The pure logic in `diagram/edge-reshaping/logic/` runs in O(N) with bounded iterations.

This file lists only the items worth fixing. Smaller observations from the audit are intentionally omitted.

## Priority Definitions

- **P1 High.** Should ship before promoting the template. Real impact when adopters scale beyond the demo.
- **P2 Medium.** Visible UX or bundle size cost. Easy to fix.
- **P3 Low.** Niche edge cases. Polish.

For zoneless change detection (a major performance opportunity), see [TEMPLATE_READINESS.md](TEMPLATE_READINESS.md) P1.1. It is already tracked there and not duplicated here.

## P1.1 Lazy Load the Export Service Dependencies

**Problem.** [diagram-export.service.ts:1-6](src/app/av-schematic/export/diagram-export.service.ts#L1-L6) imports `html-to-image` (~80kB), `DxfExporter`, and `DxfWriter` (~30kB combined) at the top of the file. The service is provided in [av-schematic-page.component.ts:47](src/app/av-schematic/pages/av-schematic-page.component.ts#L47), so the entire export stack ships in the initial bundle even when the user never clicks Export.

**Why It Matters.** Production initial bundle budget per [angular.json](angular.json) is 500kB warning, 1MB error. With Angular 21 (~200kB) plus ng-diagram (~150-200kB) plus this template's own code, the budget is already tight. Roughly 100kB of export code in eager imports is pure waste for the typical session.

**Action.** Convert to dynamic imports inside the methods that actually need them.

```typescript
async exportPng(): Promise<void> {
  const { toCanvas } = await import('html-to-image');
  const canvasEl = this.getDiagramCanvasEl();
  if (!canvasEl) return;
  // ... rest unchanged
}

async exportDxf(): Promise<void> {
  const [{ DxfExporter }, { DxfWriter }] = await Promise.all([
    import('./dxf/dxf-exporter'),
    import('./dxf/dxf-writer'),
  ]);
  // ... rest unchanged
}
```

The export menu shows a brief loading state during the dynamic import, which is fine UX-wise (and helps with P2.1 below).

**Effort.** 30 minutes including bundle measurement before and after.

## P1.2 Add Virtual Scrolling to the Library List

**Problem.** [library-list.component.html](src/app/av-schematic/library-sidebar/components/library-list/library-list.component.html) renders all devices via `@for` without virtualization. The seed has 21 items, so the demo is fine. But the library is editable and adopters of an AV schematic editor will plausibly load catalogs of hundreds or thousands of devices (real AV equipment catalogs reach into thousands of SKUs).

**Why It Matters.** Beyond about 500 list items, DOM operations start to slow scrolling. Beyond about 5000, the page hangs on initial render. The template should not silently fail under realistic load.

**Action.**

1. Install `@angular/cdk`.
2. Refactor `LibraryListComponent` to use `cdk-virtual-scroll-viewport`:

   ```html
   <cdk-virtual-scroll-viewport itemSize="56" class="device-list-viewport">
     <app-library-list-item
       *cdkVirtualFor="let device of devices(); trackBy: trackByLibraryId"
       [device]="device"
     />
   </cdk-virtual-scroll-viewport>
   ```

3. Add a fixed `itemSize` matching the actual `library-list-item` rendered height. If item heights vary, use `autosize` strategy (slower but correct).
4. If a search filter is added later, debounce input (300ms), filter into a computed signal, and let virtual scroll handle the rest.

**Effort.** 2 hours including styling adjustments to make the viewport fit the sidebar.

## P2.1 Add Progress Feedback to PNG Export

**Problem.** [diagram-export.service.ts:43-64](src/app/av-schematic/export/diagram-export.service.ts#L43-L64) calls `toCanvas` from html-to-image. For a small diagram (50 nodes) it completes in about 200ms, invisible. For larger diagrams (1000+ nodes) it can take several seconds. The user clicks Export and gets no feedback. No spinner, no disabled button, no progress indicator. The first attempt at exporting a real diagram looks broken.

**Why It Matters.** This is a UX bug that becomes a perceived performance bug. Users assume the export failed and click again, queuing duplicate work.

**Action.**

1. Add an `isExporting` signal to `DiagramExportService` if not already present (it appears [export-menu.component.ts:22](src/app/av-schematic/top-navbar/export-menu/export-menu.component.ts#L22) expects one).
2. Wrap the export work in a try/finally that toggles the signal:

   ```typescript
   async exportPng(): Promise<void> {
     this.isExporting.set(true);
     try {
       const { toCanvas } = await import('html-to-image');
       const canvas = await toCanvas(canvasEl, { /* ... */ });
       this.downloadDataUrl(canvas.toDataURL('image/png'), 'av-schematic.png');
     } finally {
       this.isExporting.set(false);
     }
   }
   ```

3. In `ExportMenuComponent`, bind `[disabled]="exportService.isExporting()"` on the export buttons and show a spinner or "Exporting..." label.
4. Add `aria-busy="true"` while exporting for screen reader users.

**Effort.** 1 hour including a basic spinner.

## P2.2 Fix Track Key in Device Node Ports

**Problem.** [device-node.component.html:18,37](src/app/av-schematic/diagram/node/device-node.component.html#L18) uses `track port.id + '@' + $index`. The `port.id` is already stable (generated by `generatePortId()`). Adding `$index` to the key means that when ports are reordered (a real operation in `PortsEditor`), every element gets a new key and Angular destroys and recreates the DOM nodes instead of just reordering them.

**Why It Matters.** Reordering ports during edit triggers full DOM teardown and rebuild for every port instead of cheap reorder. For a device with 10 ports, that is 10 destroy plus 10 create per reorder operation. For a device with 30 ports it becomes visible jank.

This is also a code smell that suggests the author was unsure whether `port.id` was stable and added `$index` defensively. The defensive code does the opposite of what was intended.

**Action.** Replace both occurrences:

```html
@for (port of inputPorts(); track port.id; let last = $last) {
  <!-- ... -->
}

@for (port of outputPorts(); track port.id; let last = $last) {
  <!-- ... -->
}
```

`$last` is a separate loop variable and continues to work as before.

**Effort.** 5 minutes.

## P3.1 Throttle Pointer Move During Edge Reshape

**Problem.** [edge-reshape.directive.ts](src/app/av-schematic/diagram/edge-reshaping/directives/edge-reshape.directive.ts) emits `reshapeContinue` on every `pointermove`. At 60Hz mouse polling, that is 60 emits per second. Each emit runs through `EdgeReshapeEventHandler` which calls `dispatcher.dispatch(reshapeEdge)`, which runs `snapToGrid` (O(N) where N is points on the edge), and writes to the model.

For a typical 5-point edge that is 5 iterations 60 times per second. Invisible. For a 30-point edge with 100 such edges in a complex drag scenario, it becomes 180000 iterations per second. Still cheap on modern desktops, potentially noticeable on weaker hardware.

**Why It Matters.** This is the only place in the codebase where high-frequency input meets non-trivial work. Adding requestAnimationFrame throttling makes the work bounded by screen refresh rate (typically 60 or 120 fps) instead of pointer poll rate.

**Action.** Coalesce pointer moves through `requestAnimationFrame`:

```typescript
private rafId: number | null = null;
private lastEvent: PointerEvent | null = null;

private readonly onDocumentPointerMove = (event: PointerEvent): void => {
  if (event.pointerId !== this.activePointerId) return;
  this.lastEvent = event;
  if (this.rafId !== null) return;
  this.rafId = requestAnimationFrame(() => {
    if (this.lastEvent) this.reshapeContinue.emit(this.toEvent(this.lastEvent));
    this.rafId = null;
  });
};
```

Add `cancelAnimationFrame(this.rafId)` to the existing `ngOnDestroy` cleanup.

**Effort.** 30 minutes including a manual smoke test of the drag interaction.

## Summary Checklist

### High (ship before promotion)

- [ ] P1.1 Lazy load the export service dependencies
- [ ] P1.2 Add virtual scrolling to the library list

### Medium (ship soon after promotion)

- [ ] P2.1 Add progress feedback to PNG export
- [ ] P2.2 Fix track key in device node ports

### Low (polish)

- [ ] P3.1 Throttle pointer move during edge reshape

### Cross-reference

- See [TEMPLATE_READINESS.md](TEMPLATE_READINESS.md) P1.1 for zoneless change detection. The application is signal-first, OnPush everywhere, ideal for zoneless mode but not yet opted in.

## Estimated Total Effort

About 4 hours of focused work for all five items.

## What Was Looked At and Found Acceptable

For transparency, here is what the audit checked and found nothing worth changing:

- Change detection strategy. OnPush in 21 of 21 components.
- Signal computed memoization. Consistent across all components and services.
- Pure logic complexity. All edge reshape algorithms are O(N) with `MAX_SAFE_ITERATIONS = 3` upper bound.
- Subscription and listener cleanup. No memory leaks found.
- Effects with `untracked()` boundaries. No cascading effect issues.
- Model apply transactions. `ModelApplyService` correctly batches via `diagramService.transaction()`.
- DebouncedFormController. Clean signal-based debounce, correct destroy semantics.
- Lazy loading of routes. Page-level component is lazy via `loadComponent`.

These are mentioned only to make clear that the absence of items here is by design, not by oversight.
