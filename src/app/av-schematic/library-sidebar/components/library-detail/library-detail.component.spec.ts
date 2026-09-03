import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtworkAssetStore } from '../../../diagram/artwork/artwork-asset.store';
import { LibraryService } from '../../library.service';
import { type LibraryDevice } from '../../seed-library';
import { LibraryDetailComponent } from './library-detail.component';

describe('LibraryDetailComponent dialog', () => {
  let service: LibraryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LibraryDetailComponent],
      providers: [ArtworkAssetStore, LibraryService],
    });
    service = TestBed.inject(LibraryService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('opens as an accessible wide dialog and enables physical creation', () => {
    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected editing id');
    const fixture = TestBed.createComponent(LibraryDetailComponent);
    fixture.componentRef.setInput('libraryId', libraryId);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    const createButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Criar footprint físico'),
    );
    createButton?.click();
    fixture.detectChanges();

    expect(host.textContent).toContain('Pré-visualização');
    expect(host.textContent).toContain('Células ocupadas pelo corpo');
  });

  it('places initial focus inside and traps Tab inside the dialog', async () => {
    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected editing id');
    const fixture = TestBed.createComponent(LibraryDetailComponent);
    fixture.componentRef.setInput('libraryId', libraryId);
    document.body.append(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    await Promise.resolve();

    const host = fixture.nativeElement as HTMLElement;
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = [
      ...(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input, select') ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) throw new Error('Expected focusable dialog controls');
    expect(dialog?.contains(document.activeElement)).toBe(true);

    last.focus();
    last.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);
  });

  it('keeps the current generic and physical ports synchronized across mode changes', async () => {
    const device: LibraryDevice = {
      libraryId: 'lib-port-sync',
      template: {
        type: 'device',
        deviceId: '',
        manufacturer: 'Talus',
        model: 'Sync',
        ports: [{ id: 'in', label: 'Entrada', direction: 'input' }],
      },
    };
    service.devices.set([device]);
    await service.beginEdit(device.libraryId);
    const fixture = TestBed.createComponent(LibraryDetailComponent);
    fixture.componentRef.setInput('libraryId', device.libraryId);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const portLabel = host.querySelector<HTMLInputElement>('.port-label');
    if (!portLabel) throw new Error('Expected generic port editor');
    portLabel.value = 'Entrada atualizada';
    portLabel.dispatchEvent(new Event('input', { bubbles: true }));

    const createButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Criar footprint físico'),
    );
    createButton?.click();
    fixture.detectChanges();

    expect(host.querySelectorAll('.physical-ports-list li')).toHaveLength(1);
    expect(host.querySelector('.physical-ports-list')?.textContent).toContain('Entrada atualizada');

    const addPin = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Adicionar terminal'),
    );
    addPin?.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.physical-ports-list li')).toHaveLength(2);

    const disableButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Tornar genérico'),
    );
    disableButton?.click();
    fixture.detectChanges();

    expect(host.querySelectorAll('.port-row')).toHaveLength(2);
    expect(host.querySelector<HTMLInputElement>('.port-label')?.value).toBe('Entrada atualizada');
  });

  it('closes on Escape and restores focus to the opener', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected editing id');
    const fixture = TestBed.createComponent(LibraryDetailComponent);
    fixture.componentRef.setInput('libraryId', libraryId);
    document.body.append(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.editingDeviceId()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('closes only when the backdrop itself is clicked', () => {
    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected editing id');
    const fixture = TestBed.createComponent(LibraryDetailComponent);
    fixture.componentRef.setInput('libraryId', libraryId);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const dialog = host.querySelector<HTMLElement>('.editor-dialog');
    const backdrop = host.querySelector<HTMLElement>('.editor-backdrop');

    dialog?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(service.editingDeviceId()).toBe(libraryId);
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(service.editingDeviceId()).toBeNull();
  });
});
