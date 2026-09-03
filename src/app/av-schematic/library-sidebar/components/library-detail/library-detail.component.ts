import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { type DeviceNodeData } from '../../../diagram/model/interfaces';
import { DeviceFormComponent } from '../../../device-form/device-form.component';
import {
  DEVICE_FORM_HIDDEN_FIELDS,
  ON_DEVICE_FIELD_CHANGE,
  type DeviceFieldChange,
} from '../../../device-form/device-form.mappers';
import { DeviceFormService } from '../../../device-form/device-form.service';
import { TooltipDirective } from '../../../shared/directives/tooltip/tooltip.directive';
import { LibraryDraftService } from '../../library-draft.service';
import { LibraryService } from '../../library.service';
import { createBlankTemplate } from '../../seed-library';
import {
  PhysicalComponentEditorComponent,
  validatePhysicalDraft,
} from '../physical-component-editor/physical-component-editor.component';

@Component({
  selector: 'app-library-detail',
  imports: [DeviceFormComponent, PhysicalComponentEditorComponent, TooltipDirective],
  templateUrl: './library-detail.component.html',
  styleUrl: './library-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    LibraryDraftService,
    DeviceFormService,
    { provide: DEVICE_FORM_HIDDEN_FIELDS, useValue: ['deviceId', 'location'] },
    {
      provide: ON_DEVICE_FIELD_CHANGE,
      useFactory: () => {
        const draft = inject(LibraryDraftService);
        return (change: DeviceFieldChange) => {
          draft.applyChange(change);
        };
      },
    },
  ],
})
export class LibraryDetailComponent implements AfterViewInit {
  private readonly libraryService = inject(LibraryService);
  private readonly draftService = inject(LibraryDraftService);
  private readonly formService = inject(DeviceFormService);

  readonly libraryId = input.required<string>();

  protected readonly mode = this.libraryService.editingMode;
  protected readonly storageError = this.libraryService.storageError;
  protected readonly draft = this.draftService.draft;
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  // Stable per editing session — only changes when libraryId/mode flip,
  // not on every keystroke. Bound to the form's `[nodeData]` so re-syncing
  // the form doesn't fight the user's typing.
  protected readonly initialTemplate = signal<DeviceNodeData>(createBlankTemplate());

  protected readonly title = computed(() =>
    this.mode() === 'create' ? 'Novo componente' : 'Editar componente',
  );

  protected readonly canSave = computed(() => {
    const draft = this.draftService.draft();
    return (
      (draft.manufacturer.trim() !== '' || draft.model.trim() !== '') &&
      validatePhysicalDraft(draft) === null
    );
  });

  constructor() {
    effect(() => {
      const id = this.libraryId();
      const mode = this.libraryService.editingMode();
      untracked(() => {
        const initial =
          mode === 'edit'
            ? (this.libraryService.devices().find((d) => d.libraryId === id)?.template ??
              createBlankTemplate())
            : createBlankTemplate();
        this.initialTemplate.set(initial);
        this.draftService.reset(initial);
      });
    });
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      const dialog = this.dialog()?.nativeElement;
      if (
        this.mode() !== null &&
        dialog &&
        !dialog.contains(document.activeElement) &&
        this.closeButton()?.nativeElement.isConnected
      ) {
        this.closeButton()?.nativeElement.focus();
      }
    });
  }

  protected onSave(): void {
    this.formService.commitPendingEdits();
    if (!this.canSave()) return;
    this.libraryService.commitDraft(
      this.libraryId(),
      this.draftService.draft(),
      this.draftService.pendingAssets(),
    );
  }

  protected onBack(): void {
    this.libraryService.closeDetail();
  }

  protected onRemove(): void {
    this.libraryService.removeDevice(this.libraryId());
  }

  protected onBackdropActivate(event: Event): void {
    if (event.target !== event.currentTarget) return;
    if (event instanceof KeyboardEvent) event.preventDefault();
    this.onBack();
  }

  protected dismissStorageError(): void {
    this.libraryService.dismissStorageError();
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: Event): void {
    if (this.mode() === null) return;
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Escape') {
      keyboardEvent.preventDefault();
      this.onBack();
      return;
    }
    if (keyboardEvent.key !== 'Tab') return;
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      (element) => !element.hasAttribute('disabled') && element.tabIndex >= 0,
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      keyboardEvent.preventDefault();
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    if (keyboardEvent.shiftKey && (active === first || !dialog.contains(active))) {
      keyboardEvent.preventDefault();
      last.focus();
    } else if (!keyboardEvent.shiftKey && (active === last || !dialog.contains(active))) {
      keyboardEvent.preventDefault();
      first.focus();
    }
  }
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
