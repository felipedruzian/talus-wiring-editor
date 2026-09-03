import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent } from 'ng-diagram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trustedArtworkForFootprint } from '../../../diagram/artwork/trusted-component-artwork';
import { LibraryService } from '../../library.service';
import { SEED_LIBRARY } from '../../seed-library';
import { LibraryListItemComponent } from './library-list-item.component';

@Component({
  // Third-party selector retained so the list template can be tested without
  // mounting an entire ng-diagram palette.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'ng-diagram-palette-item',
  template: '<ng-content />',
})
class PaletteItemStubComponent {
  readonly item = input<unknown>();
}

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'ng-diagram-palette-item-preview',
  template: '<ng-content />',
})
class PalettePreviewStubComponent {}

const libraryStub = {
  searchQuery: signal(''),
  beginEdit: vi.fn(),
};

afterEach(() => {
  libraryStub.beginEdit.mockReset();
  TestBed.resetTestingModule();
});

describe('LibraryListItemComponent physical previews', () => {
  it.each([
    'lib-arduino-nano',
    'lib-mpu6050-gy521',
    'lib-tb6612fng',
    'lib-buzzer-active-12mm',
    'lib-resistor-1k',
    'lib-resistor-1k8',
    'lib-capacitor-electrolytic-470uf',
    'lib-capacitor-ceramic-100nf',
  ])('uses the integral trusted figure for %s in the row and drag preview', (libraryId) => {
    const device = SEED_LIBRARY.find((candidate) => candidate.libraryId === libraryId);
    if (!device) throw new Error(`Missing seed ${libraryId}`);
    const trusted = trustedArtworkForFootprint(device.template.footprintId);
    if (!trusted) throw new Error(`Missing trusted artwork for ${libraryId}`);

    TestBed.configureTestingModule({
      imports: [LibraryListItemComponent],
      providers: [{ provide: LibraryService, useValue: libraryStub }],
    });
    TestBed.overrideComponent(LibraryListItemComponent, {
      remove: {
        imports: [NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent],
      },
      add: { imports: [PaletteItemStubComponent, PalettePreviewStubComponent] },
    });
    const fixture = TestBed.createComponent(LibraryListItemComponent);
    fixture.componentRef.setInput('device', device);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.device-row__illustration image')?.getAttribute('href')).toBe(
      trusted.href,
    );
    expect(
      host.querySelector('.physical-device-preview__illustration image')?.getAttribute('href'),
    ).toBe(trusted.href);
    expect(host.querySelector('.device-preview')).toBeNull();
  });

  it('renders the adjustable resistor leads around the rigid body in both previews', () => {
    const device = SEED_LIBRARY.find((candidate) => candidate.libraryId === 'lib-resistor-1k');
    if (!device) throw new Error('Missing resistor seed');

    TestBed.configureTestingModule({
      imports: [LibraryListItemComponent],
      providers: [{ provide: LibraryService, useValue: libraryStub }],
    });
    TestBed.overrideComponent(LibraryListItemComponent, {
      remove: { imports: [NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent] },
      add: { imports: [PaletteItemStubComponent, PalettePreviewStubComponent] },
    });
    const fixture = TestBed.createComponent(LibraryListItemComponent);
    fixture.componentRef.setInput('device', device);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(
      [...host.querySelectorAll('.footprint-illustration line')].map((line) =>
        line.getAttribute('x2'),
      ),
    ).toEqual(['4', '4']);
    expect(
      [...host.querySelectorAll('.footprint-illustration image')].map((image) => ({
        width: image.getAttribute('width'),
        terminalModel: image.getAttribute('data-terminal-model'),
      })),
    ).toEqual([
      { width: '2.76', terminalModel: 'adjustable-axial' },
      { width: '2.76', terminalModel: 'adjustable-axial' },
    ]);
  });
});
