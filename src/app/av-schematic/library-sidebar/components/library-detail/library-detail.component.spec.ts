import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArtworkAssetStore } from '../../../diagram/artwork/artwork-asset.store';
import { LibraryService } from '../../library.service';
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

  it('closes on Escape and restores focus to the opener', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    service.beginCreate();
    const libraryId = service.editingDeviceId();
    if (!libraryId) throw new Error('Expected editing id');
    const fixture = TestBed.createComponent(LibraryDetailComponent);
    fixture.componentRef.setInput('libraryId', libraryId);
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
