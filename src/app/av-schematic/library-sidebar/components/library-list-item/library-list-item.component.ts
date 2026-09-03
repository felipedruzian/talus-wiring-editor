import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent } from 'ng-diagram';
import { ArtworkAssetStore } from '../../../diagram/artwork/artwork-asset.store';
import { trustedArtworkForFootprintDefinition } from '../../../diagram/artwork/trusted-component-artwork';
import { resolveFootprint } from '../../../diagram/model/footprint';
import { FootprintIllustrationComponent } from '../../../diagram/node/footprint-illustration.component';
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
    FootprintIllustrationComponent,
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
  protected readonly trustedFootprint = computed(() => {
    const footprint = resolveFootprint(this.device().template);
    if (!footprint || footprint.artwork) return null;
    return trustedArtworkForFootprintDefinition(footprint) ? footprint : null;
  });
  protected readonly trustedArtwork = computed(() => {
    const footprint = this.trustedFootprint();
    return footprint ? (trustedArtworkForFootprintDefinition(footprint) ?? null) : null;
  });
  protected readonly artworkUrl = computed(() => {
    const rasterHash = this.device().template.footprint?.artwork?.assetHash;
    return this.artworkAssets.asset(rasterHash)?.dataUrl ?? this.trustedArtwork()?.href ?? null;
  });

  protected readonly categoryLabel = computed(() => {
    return this.libraryService.category(this.device().template.categoryId).name;
  });

  protected onOpenDetail(): void {
    void this.libraryService.beginEdit(this.device().libraryId);
  }
}
