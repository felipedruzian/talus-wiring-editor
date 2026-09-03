import { ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgDiagramModelService } from 'ng-diagram';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARDUINO_NANO_ARTWORK,
  RESISTOR_AXIAL_1K_ARTWORK,
} from '../diagram/artwork/trusted-component-artwork';
import { DiagramExportService } from './diagram-export.service';
import { MAX_SVG_EXPORT_DIMENSION } from './raster-svg';

const { toCanvas } = vi.hoisted(() => ({ toCanvas: vi.fn() }));

vi.mock('html-to-image', () => ({ toCanvas }));

describe('DiagramExportService SVG preflight', () => {
  let service: DiagramExportService;
  let bounds: { x: number; y: number; width: number; height: number };
  let canvas: HTMLElement;

  beforeEach(() => {
    toCanvas.mockReset();
    bounds = {
      x: 0,
      y: 0,
      width: MAX_SVG_EXPORT_DIMENSION + 1,
      height: 20,
    };
    TestBed.configureTestingModule({
      providers: [
        DiagramExportService,
        {
          provide: NgDiagramModelService,
          useValue: {
            nodes: signal([{ id: 'node-1' }]),
            edges: signal([]),
            computePartsBounds: () => bounds,
          },
        },
      ],
    });
    service = TestBed.inject(DiagramExportService);

    const host = document.createElement('div');
    canvas = document.createElement('ng-diagram-canvas');
    host.append(canvas);
    service.setDiagramElement(new ElementRef(host));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('rejects an oversized region before calling html-to-image', async () => {
    await expect(service.exportSvg()).rejects.toThrow(/dimension limit/);
    expect(toCanvas).not.toHaveBeenCalled();
  });

  it('captures the same fixed and adjustable trusted figure subtrees for PNG and SVG exports', async () => {
    bounds = { x: 10, y: 20, width: 340, height: 150 };
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('href', ARDUINO_NANO_ARTWORK.href);
    image.setAttribute('data-artwork-id', ARDUINO_NANO_ARTWORK.id);
    canvas.append(image);

    const resistor = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    resistor.setAttribute('data-axial-span', '10');
    const lead = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lead.setAttribute('x1', '0');
    lead.setAttribute('x2', '10');
    const resistorImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    resistorImage.setAttribute('href', RESISTOR_AXIAL_1K_ARTWORK.href);
    resistorImage.setAttribute('data-artwork-id', RESISTOR_AXIAL_1K_ARTWORK.id);
    resistor.append(lead, resistorImage);
    canvas.append(resistor);
    toCanvas.mockResolvedValue({
      toDataURL: () => 'data:image/png;base64,AA==',
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:trusted-module-test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    await service.exportPng();
    await service.exportSvg();

    expect(toCanvas).toHaveBeenCalledTimes(2);
    for (const [source] of toCanvas.mock.calls) {
      expect(source).toBe(canvas);
      expect((source as HTMLElement).querySelector('image')?.getAttribute('href')).toBe(
        ARDUINO_NANO_ARTWORK.href,
      );
      expect((source as HTMLElement).querySelector('image')?.getAttribute('data-artwork-id')).toBe(
        ARDUINO_NANO_ARTWORK.id,
      );
      const exportedResistor = (source as HTMLElement).querySelector('[data-axial-span="10"]');
      expect(exportedResistor?.querySelector('line')?.getAttribute('x2')).toBe('10');
      expect(exportedResistor?.querySelector('image')?.getAttribute('href')).toBe(
        RESISTOR_AXIAL_1K_ARTWORK.href,
      );
      expect(exportedResistor?.querySelector('image')?.getAttribute('data-artwork-id')).toBe(
        RESISTOR_AXIAL_1K_ARTWORK.id,
      );
    }
  });
});
