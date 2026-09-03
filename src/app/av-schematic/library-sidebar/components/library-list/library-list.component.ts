import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TooltipDirective } from '../../../shared/directives/tooltip/tooltip.directive';
import { UNCATEGORIZED_CATEGORY_ID, type LibraryCategory } from '../../library-category';
import { LibraryService } from '../../library.service';
import { type LibraryDevice } from '../../seed-library';
import { LibraryListItemComponent } from '../library-list-item/library-list-item.component';
import { LibrarySearchComponent } from '../library-search/library-search.component';

interface DeviceGroup {
  key: string;
  label: string;
  devices: LibraryDevice[];
}

@Component({
  selector: 'app-library-list',
  imports: [LibraryListItemComponent, LibrarySearchComponent, TooltipDirective],
  templateUrl: './library-list.component.html',
  styleUrl: './library-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryListComponent {
  private readonly libraryService = inject(LibraryService);

  protected readonly devices = this.libraryService.devices;
  protected readonly filteredDevices = this.libraryService.filteredDevices;
  protected readonly searchQuery = this.libraryService.searchQuery;
  protected readonly storageError = this.libraryService.storageError;
  protected readonly categories = this.libraryService.categories;
  protected readonly isPersisting = this.libraryService.isPersisting;
  protected readonly categoryManagerOpen = signal(false);
  protected readonly pendingCategoryDeletion = signal<string | null>(null);

  protected readonly groupedDevices = computed<DeviceGroup[]>(() =>
    groupDevicesByCategory(this.devices(), this.categories()),
  );

  private readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  protected isGroupOpen(key: string): boolean {
    return !this.collapsedGroups().has(key);
  }

  protected onGroupToggle(key: string, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    this.collapsedGroups.update((set) => {
      const next = new Set(set);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected groupTooltip(group: DeviceGroup): string {
    return this.isGroupOpen(group.key) ? `Recolher ${group.label}` : `Expandir ${group.label}`;
  }

  protected onAddDevice(): void {
    this.libraryService.beginCreate();
  }

  protected async onRestoreDefaults(): Promise<void> {
    await this.libraryService.restoreDefaults();
  }

  protected toggleCategoryManager(): void {
    this.categoryManagerOpen.update((open) => !open);
    this.pendingCategoryDeletion.set(null);
  }

  protected async onCreateCategory(
    event: Event,
    nameInput: HTMLInputElement,
    prefixInput: HTMLInputElement,
  ): Promise<void> {
    event.preventDefault();
    if (await this.libraryService.createCategory(nameInput.value, prefixInput.value)) {
      nameInput.value = '';
      prefixInput.value = 'DEV';
      nameInput.focus();
    }
  }

  protected async onRenameCategory(
    category: LibraryCategory,
    nameInput: HTMLInputElement,
    prefixInput: HTMLInputElement,
  ): Promise<void> {
    await this.libraryService.renameCategory(category.id, nameInput.value, prefixInput.value);
  }

  protected requestCategoryDeletion(categoryId: string): void {
    this.pendingCategoryDeletion.set(categoryId);
  }

  protected cancelCategoryDeletion(): void {
    this.pendingCategoryDeletion.set(null);
  }

  protected async confirmCategoryDeletion(categoryId: string): Promise<void> {
    if (await this.libraryService.deleteCategory(categoryId)) {
      this.pendingCategoryDeletion.set(null);
    }
  }

  protected isFallbackCategory(categoryId: string): boolean {
    return categoryId === UNCATEGORIZED_CATEGORY_ID;
  }

  protected dismissStorageError(): void {
    this.libraryService.dismissStorageError();
  }
}

export const groupDevicesByCategory = (
  devices: readonly LibraryDevice[],
  categories: readonly LibraryCategory[],
): DeviceGroup[] => {
  const buckets = new Map<string, LibraryDevice[]>();
  for (const device of devices) {
    const key = device.template.categoryId;
    const list = buckets.get(key) ?? [];
    list.push(device);
    buckets.set(key, list);
  }
  const ordered: DeviceGroup[] = [];
  for (const category of categories) {
    const list = buckets.get(category.id);
    if (list && list.length > 0) {
      ordered.push({ key: category.id, label: category.name, devices: list });
      buckets.delete(category.id);
    }
  }
  for (const [key, list] of buckets) {
    ordered.push({ key, label: 'Não categorizado', devices: list });
  }
  return ordered;
};
