import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { type FormValueControl } from '@angular/forms/signals';

/**
 * Editable combobox: typed text is kept as the value (no revert), and the
 * dropdown filters predefined options as the user types. Picking an option
 * sets the input to that option's text. Visual structure mirrors the
 * orgchart shared combobox so the look stays consistent across apps.
 */
@Component({
  selector: 'app-combobox',
  templateUrl: './combobox.component.html',
  styleUrl: './combobox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComboboxComponent implements FormValueControl<string> {
  private readonly elRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly value = model<string>('');
  readonly options = input<readonly string[]>([]);
  readonly placeholder = input<string>('');
  readonly inputId = input<string>();

  protected readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('comboboxInput');
  private readonly optionElements = viewChildren<ElementRef<HTMLElement>>('optionEl');

  protected readonly isOpen = signal(false);
  protected readonly focusedIndex = signal(-1);
  // Separate from `value` so opening the panel shows ALL options (you can pick
  // a different one), and only typing narrows the list. Reset on open/select.
  private readonly filterText = signal('');

  protected readonly displayedOptions = computed<readonly string[]>(() => {
    const filter = this.filterText().trim().toLowerCase();
    if (!filter) return this.options();
    return this.options().filter((option) => option.toLowerCase().includes(filter));
  });

  private removeDocumentClick: (() => void) | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.removeDocumentClick?.());
  }

  protected onTriggerClick(): void {
    this.inputEl()?.nativeElement.focus();
    if (!this.isOpen()) this.openPanel();
  }

  protected onChevronClick(): void {
    if (this.isOpen()) {
      this.closePanel();
    } else {
      this.openPanel();
      this.inputEl()?.nativeElement.focus();
    }
  }

  protected onFocus(): void {
    if (!this.isOpen()) this.openPanel();
  }

  protected onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.value.set(raw);
    this.filterText.set(raw);
    if (!this.isOpen()) this.openPanel();
    this.focusedIndex.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Tab':
        // Free-text combobox: Tab keeps whatever was typed rather than
        // committing the focused option. The typed value is already in
        // `value` (set on each input event), so just close the panel and
        // let Tab move focus normally.
        if (this.isOpen()) this.closePanel();
        return;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.closePanel();
          this.inputEl()?.nativeElement.focus();
        }
        return;
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) this.openPanel();
        else this.moveFocus(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (!this.isOpen()) this.openPanel();
        else this.moveFocus(-1);
        return;
      case 'Enter':
        if (this.isOpen()) {
          event.preventDefault();
          this.selectFocused();
        }
        return;
    }
  }

  protected select(option: string): void {
    this.value.set(option);
    this.filterText.set('');
    this.closePanel();
  }

  protected isSelected(option: string): boolean {
    return option === this.value();
  }

  private openPanel(): void {
    this.filterText.set('');
    this.isOpen.set(true);
    this.initFocusedIndex();
    this.removeDocumentClick?.();
    this.removeDocumentClick = this.listenForOutsideClicks();
  }

  private closePanel(): void {
    this.removeDocumentClick?.();
    this.removeDocumentClick = null;
    this.isOpen.set(false);
    this.focusedIndex.set(-1);
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

  private initFocusedIndex(): void {
    const value = this.value();
    const index = this.displayedOptions().findIndex((option) => option === value);
    this.focusedIndex.set(index === -1 ? 0 : index);
    this.scrollFocusedIntoView();
  }

  private moveFocus(delta: number): void {
    const length = this.displayedOptions().length;
    if (length === 0) return;
    const next = Math.max(0, Math.min(this.focusedIndex() + delta, length - 1));
    this.focusedIndex.set(next);
    this.scrollFocusedIntoView();
  }

  private scrollFocusedIntoView(): void {
    requestAnimationFrame(() => {
      this.optionElements()
        .at(this.focusedIndex())
        ?.nativeElement.scrollIntoView({ block: 'nearest' });
    });
  }

  private selectFocused(): void {
    const option = this.displayedOptions().at(this.focusedIndex());
    if (option !== undefined) this.select(option);
  }
}
