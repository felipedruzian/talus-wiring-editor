import { TestBed } from '@angular/core/testing';
import { provideNgDiagram } from 'ng-diagram';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtworkAssetStore } from '../../../diagram/artwork/artwork-asset.store';
import { LibraryService } from '../../library.service';
import { LibraryListComponent } from './library-list.component';

describe('LibraryListComponent category manager', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    TestBed.configureTestingModule({
      imports: [LibraryListComponent],
      providers: [provideNgDiagram(), ArtworkAssetStore, LibraryService],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('exposes a labelled CRUD region while keeping the fallback read-only', () => {
    const fixture = TestBed.createComponent(LibraryListComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const toggle = host.querySelector<HTMLButtonElement>('.category-manager__toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    toggle?.click();
    fixture.detectChanges();

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('#category-manager-title')?.textContent).toContain(
      'Categorias do catálogo',
    );
    expect(host.querySelector('form[aria-label="Criar categoria"]')).not.toBeNull();
    expect(host.querySelector('label[for="new-category-name"]')).not.toBeNull();
    const fallbackName = host.querySelector<HTMLInputElement>('#category-name-uncategorized');
    const fallbackPrefix = host.querySelector<HTMLInputElement>('#category-prefix-uncategorized');
    expect(fallbackName?.readOnly).toBe(true);
    expect(fallbackPrefix?.readOnly).toBe(true);
    expect(fallbackName?.closest('li')?.textContent).toContain('Categoria padrão fixa');
  });
});
