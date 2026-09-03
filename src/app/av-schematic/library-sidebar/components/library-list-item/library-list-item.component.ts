import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent } from 'ng-diagram';
import { ArtworkAssetStore } from '../../../diagram/artwork/artwork-asset.store';
import {
  trustedArtworkForFootprint,
  trustedArtworkForFootprintDefinition,
} from '../../../diagram/artwork/trusted-component-artwork';
import { deviceCategoryLabel } from '../../../diagram/model/device-categories';
import { HighlightSegmentsPipe } from '../../../shared/ui/highlight-segments/highlight-segments.pipe';
import { DeviceIllustrationComponent } from '../../../shared/ui/device-illustration/device-illustration.component';
import { LibraryService } from '../../library.service';
import { type LibraryDevice } from '../../seed-library';
import { asDevicePaletteItem } from './palette-item-cast';

@Component({
  selector: 'app-library-list-item',
  imports: [
    NgDiagramPaletteItemComponent,
    NgDiagramPaletteItemPreviewComponent,
    DeviceIllustrationComponent,
    HighlightSegmentsPipe,
  ],
  templateUrl: './library-list-item.component.html',
  styleUrl: './library-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryListItemComponent {
  private readonly libraryService = inject(LibraryService);
  private readonly artworkAssets = inject(ArtworkAssetStore);

  readonly device = input.required<LibraryDevice>();

  protected readonly paletteItem = computed(() => asDevicePaletteItem(this.device().template));

  protected readonly searchQuery = this.libraryService.searchQuery;
  protected readonly trustedArtwork = computed(() => {
    const template = this.device().template;
    if (template.footprint?.artwork) return null;
    return (
      (template.footprint
        ? trustedArtworkForFootprintDefinition(template.footprint)
        : trustedArtworkForFootprint(template.footprintId)) ?? null
    );
  });
  protected readonly artworkUrl = computed(() => {
    const rasterHash = this.device().template.footprint?.artwork?.assetHash;
    return this.artworkAssets.asset(rasterHash)?.dataUrl ?? this.trustedArtwork()?.href ?? null;
  });

  protected readonly categoryLabel = computed(() => {
    const c = this.device().template.category?.trim();
    return c ? deviceCategoryLabel(c) : '';
  });

  protected onOpenDetail(): void {
    void this.libraryService.beginEdit(this.device().libraryId);
  }
}
