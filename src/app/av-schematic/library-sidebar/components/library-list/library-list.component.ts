import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LibraryService } from '../../library.service';
import { LibraryListItemComponent } from '../library-list-item/library-list-item.component';

@Component({
  selector: 'app-library-list',
  imports: [LibraryListItemComponent],
  templateUrl: './library-list.component.html',
  styleUrl: './library-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryListComponent {
  private readonly libraryService = inject(LibraryService);

  protected readonly devices = this.libraryService.devices;

  protected onAddDevice(): void {
    this.libraryService.beginCreate();
  }
}
