import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NgDiagramPaletteItemComponent,
  NgDiagramPaletteItemPreviewComponent,
  type NgDiagramPaletteItem,
} from 'ng-diagram';
import { NodeTemplateType } from '../../../diagram/model/interfaces';
import { LibraryService } from '../../library.service';
import { type LibraryDevice } from '../../seed-library';

@Component({
  selector: 'app-library-list-item',
  imports: [NgDiagramPaletteItemComponent, NgDiagramPaletteItemPreviewComponent],
  templateUrl: './library-list-item.component.html',
  styleUrl: './library-list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryListItemComponent {
  private readonly libraryService = inject(LibraryService);

  readonly device = input.required<LibraryDevice>();

  // ng-diagram's `NgDiagramPaletteItem` defaults to `BasePaletteItemData` which requires a
  // `label: string`. DeviceNodeData has no label — we render our own preview, so the field
  // is moot. Cast at the library boundary instead of polluting node data with a vestigial
  // label that would survive every drop and edit.
  protected readonly paletteItem = computed<NgDiagramPaletteItem>(
    () =>
      ({
        type: NodeTemplateType.DeviceNode,
        data: structuredClone(this.device().template),
      }) as unknown as NgDiagramPaletteItem,
  );

  protected readonly categoryLabel = computed(() => {
    const c = this.device().template.category?.trim();
    return c ? c.replace(/-/g, ' ') : '';
  });

  protected onOpenDetail(): void {
    this.libraryService.beginEdit(this.device().libraryId);
  }
}
