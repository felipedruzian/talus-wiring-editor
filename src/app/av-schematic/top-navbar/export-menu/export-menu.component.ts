import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { DiagramExportService } from '../../export/diagram-export.service';

@Component({
  selector: 'app-export-menu',
  templateUrl: './export-menu.component.html',
  styleUrl: './export-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class ExportMenuComponent {
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly exportService = inject(DiagramExportService);

  protected readonly isOpen = signal(false);
  protected readonly isExporting = signal(false);
  protected readonly canExport = this.exportService.canExport;

  private removeDocumentClick: (() => void) | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.removeDocumentClick?.());
  }

  protected toggle(): void {
    if (this.isOpen()) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.isOpen()) {
      event.preventDefault();
      this.closePanel();
    }
  }

  protected async exportPng(): Promise<void> {
    if (!this.canExport() || this.isExporting()) return;
    this.closePanel();
    this.isExporting.set(true);
    try {
      await this.exportService.exportPng();
    } finally {
      this.isExporting.set(false);
    }
  }

  protected exportDxf(): void {
    if (!this.canExport() || this.isExporting()) return;
    this.closePanel();
    this.exportService.exportDxf();
  }

  private openPanel(): void {
    this.isOpen.set(true);
    this.removeDocumentClick?.();
    this.removeDocumentClick = this.listenForOutsideClicks();
  }

  private closePanel(): void {
    this.removeDocumentClick?.();
    this.removeDocumentClick = null;
    this.isOpen.set(false);
  }

  private listenForOutsideClicks(): () => void {
    const handler = (event: MouseEvent) => {
      if (!this.elRef.nativeElement.contains(event.target as Node)) {
        this.closePanel();
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }
}
