import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NgDiagramPaletteItemComponent,
  NgDiagramPaletteItemPreviewComponent,
} from 'ng-diagram';
import { HighlightSegmentsPipe } from '../../../shared/highlight-segments/highlight-segments.pipe';
import { LibraryService } from '../../library.service';
import { type LibraryDevice } from '../../seed-library';
import { asDevicePaletteItem } from './palette-item-cast';

@Component({
  selector: 'app-library-list-item',
  imports: [
    NgDiagramPaletteItemComponent,
    NgDiagramPaletteItemPreviewComponent,
    HighlightSegmentsPipe,
  ],
  templateUrl: './library-list-item.component.html',
  styleUrl: './library-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryListItemComponent {
  private readonly libraryService = inject(LibraryService);

  readonly device = input.required<LibraryDevice>();

  protected readonly paletteItem = computed(() => asDevicePaletteItem(this.device().template));

  protected readonly searchQuery = this.libraryService.searchQuery;

  protected readonly categoryLabel = computed(() => {
    const c = this.device().template.category?.trim();
    return c ? c.replace(/-/g, ' ') : '';
  });

  protected onOpenDetail(): void {
    this.libraryService.beginEdit(this.device().libraryId);
  }
}
