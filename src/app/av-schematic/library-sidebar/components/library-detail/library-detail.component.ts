import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { type DeviceNodeData } from '../../../diagram/model/interfaces';
import { DeviceFormComponent } from '../../../properties-sidebar/components/device-form/device-form.component';
import {
  ON_DEVICE_FIELD_CHANGE,
  type DeviceFieldChange,
  type DeviceFormData,
} from '../../../properties-sidebar/components/device-form/device-form.mappers';
import { DeviceFormService } from '../../../properties-sidebar/components/device-form/device-form.service';
import { LibraryDraftService } from '../../library-draft.service';
import { createBlankTemplate, LibraryService } from '../../library.service';

const HIDDEN_FIELDS: readonly (keyof DeviceFormData)[] = ['deviceId', 'location'];

@Component({
  selector: 'app-library-detail',
  imports: [DeviceFormComponent],
  templateUrl: './library-detail.component.html',
  styleUrl: './library-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    LibraryDraftService,
    DeviceFormService,
    {
      provide: ON_DEVICE_FIELD_CHANGE,
      useFactory: () => {
        const draft = inject(LibraryDraftService);
        return (change: DeviceFieldChange) => draft.applyChange(change);
      },
    },
  ],
})
export class LibraryDetailComponent {
  private readonly libraryService = inject(LibraryService);
  private readonly draftService = inject(LibraryDraftService);

  readonly libraryId = input.required<string>();

  protected readonly hiddenFields = HIDDEN_FIELDS;
  protected readonly mode = this.libraryService.editingMode;

  // Stable per editing session — only changes when libraryId/mode flip,
  // not on every keystroke. Bound to the form's `[nodeData]` so re-syncing
  // the form doesn't fight the user's typing.
  protected readonly initialTemplate = signal<DeviceNodeData>(createBlankTemplate());

  protected readonly title = computed(() =>
    this.mode() === 'create' ? 'New device' : 'Edit device',
  );

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

  protected onSave(): void {
    this.libraryService.commitDraft(this.libraryId(), this.draftService.draft());
  }

  protected onBack(): void {
    this.libraryService.closeDetail();
  }

  protected onRemove(): void {
    this.libraryService.removeDevice(this.libraryId());
  }
}
