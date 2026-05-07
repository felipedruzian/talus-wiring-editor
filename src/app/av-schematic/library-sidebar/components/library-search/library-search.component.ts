import { ChangeDetectionStrategy, Component, inject, OnDestroy } from '@angular/core';
import { LibraryService } from '../../library.service';

const DEBOUNCE_MS = 150;

@Component({
  selector: 'app-library-search',
  templateUrl: './library-search.component.html',
  styleUrl: './library-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibrarySearchComponent implements OnDestroy {
  private readonly libraryService = inject(LibraryService);

  protected readonly initialValue = this.libraryService.searchQuery();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.libraryService.searchQuery.set(value);
      this.debounceTimer = null;
    }, DEBOUNCE_MS);
  }

  ngOnDestroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }
}
