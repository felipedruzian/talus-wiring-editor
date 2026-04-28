import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SidebarHeaderComponent } from '../properties-sidebar/components/sidebar-header/sidebar-header.component';
import { LibraryDetailComponent } from './components/library-detail/library-detail.component';
import { LibraryListComponent } from './components/library-list/library-list.component';
import { LibraryService } from './library.service';

@Component({
  selector: 'app-library-sidebar',
  imports: [SidebarHeaderComponent, LibraryListComponent, LibraryDetailComponent],
  templateUrl: './library-sidebar.component.html',
  styleUrl: './library-sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.expanded]': 'isExpanded()' },
})
export class LibrarySidebarComponent {
  private readonly libraryService = inject(LibraryService);

  protected readonly isExpanded = this.libraryService.isExpanded;
  protected readonly editingDeviceId = this.libraryService.editingDeviceId;

  protected onHeaderToggle(): void {
    this.libraryService.toggleVisibility();
  }
}
