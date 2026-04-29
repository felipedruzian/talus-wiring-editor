import { ElementRef, Injectable, computed, signal } from '@angular/core';
import { toCanvas } from 'html-to-image';
import { NgDiagramModelService } from 'ng-diagram';
import { buildAvDxfConfig } from './dxf-av-schematic/av-dxf-config';
import { DxfExporter } from './dxf/dxf-exporter';
import { DxfWriter } from './dxf/dxf-writer';

const EXPORT_PADDING = 50;
const PNG_PIXEL_RATIO = 2;
const DIAGRAM_CANVAS_SELECTOR = 'ng-diagram-canvas';

export interface DiagramExportRef {
  element: ElementRef<HTMLElement>;
  modelService: NgDiagramModelService;
}

/**
 * Coordinates exporting the diagram to PNG (and DXF, added in phase 2).
 *
 * The diagram component registers a ref on init: its host ElementRef plus
 * the diagram-scoped services it needs. Export actions triggered from
 * elsewhere in the UI (e.g. the top-navbar export menu) can then capture
 * the registered diagram without prop-drilling.
 *
 * `canExport` reactively tracks whether the current model has any nodes,
 * so menu items can disable themselves automatically.
 */
@Injectable({ providedIn: 'root' })
export class DiagramExportService {
  private readonly ref = signal<DiagramExportRef | null>(null);

  readonly canExport = computed(() => {
    const ref = this.ref();
    return ref ? ref.modelService.nodes().length > 0 : false;
  });

  register(ref: DiagramExportRef): void {
    this.ref.set(ref);
  }

  unregister(): void {
    this.ref.set(null);
  }

  async exportPng(): Promise<void> {
    const ref = this.ref();
    if (!ref) return;

    const canvasEl = this.getDiagramCanvasEl(ref);
    if (!canvasEl) return;

    const region = this.computeExportRegion(ref);
    if (!region) return;

    const backgroundColor = this.resolveBackgroundColor(canvasEl);

    const canvas = await toCanvas(canvasEl, {
      backgroundColor,
      width: region.width,
      height: region.height,
      pixelRatio: PNG_PIXEL_RATIO,
      cacheBust: false,
      style: {
        transform: `translate(${-region.x}px, ${-region.y}px) scale(1)`,
        transformOrigin: 'top left',
      },
    });

    this.downloadDataUrl(canvas.toDataURL('image/png'), 'av-schematic.png');
  }

  exportDxf(): void {
    const ref = this.ref();
    if (!ref) return;

    const nodes = ref.modelService.nodes();
    if (nodes.length === 0) return;
    const edges = ref.modelService.edges();
    const bounds = ref.modelService.computePartsBounds(nodes, edges);

    const doc = new DxfExporter(buildAvDxfConfig()).export(nodes, edges, bounds);
    const content = new DxfWriter().serialize(doc);

    this.downloadText(content, 'av-schematic.dxf', 'application/dxf');
  }

  private getDiagramCanvasEl(ref: DiagramExportRef): HTMLElement | null {
    return ref.element.nativeElement.querySelector(DIAGRAM_CANVAS_SELECTOR);
  }

  /**
   * The ng-diagram canvas itself is transparent — the visible diagram
   * background is the page background painted on `<html>` per active theme
   * (see styles.css). Walk up the DOM to find the first element with a
   * non-transparent computed background, falling back to white.
   */
  private resolveBackgroundColor(start: HTMLElement): string {
    let el: HTMLElement | null = start;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'transparent' && !bg.startsWith('rgba(0, 0, 0, 0')) {
        return bg;
      }
      el = el.parentElement;
    }
    return '#ffffff';
  }

  private computeExportRegion(ref: DiagramExportRef) {
    const nodes = ref.modelService.nodes();
    if (nodes.length === 0) return null;

    const edges = ref.modelService.edges();
    const bounds = ref.modelService.computePartsBounds(nodes, edges);

    return {
      x: bounds.x - EXPORT_PADDING,
      y: bounds.y - EXPORT_PADDING,
      width: bounds.width + EXPORT_PADDING * 2,
      height: bounds.height + EXPORT_PADDING * 2,
    };
  }

  private downloadDataUrl(dataUrl: string, filename: string): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  private downloadText(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }
}
