import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DeviceFormComponent } from '../../../properties-sidebar/components/device-form/device-form.component';
import {
  formDataToDeviceData,
  ON_DEVICE_FIELD_CHANGE,
  type DeviceFieldChange,
} from '../../../properties-sidebar/components/device-form/device-form.mappers';
import { DeviceFormService } from '../../../properties-sidebar/components/device-form/device-form.service';
import { LibraryService } from '../../library.service';

@Component({
  selector: 'app-library-detail',
  imports: [DeviceFormComponent],
  templateUrl: './library-detail.component.html',
  styleUrl: './library-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    DeviceFormService,
    {
      provide: ON_DEVICE_FIELD_CHANGE,
      useFactory: () => {
        const lib = inject(LibraryService);
        return (change: DeviceFieldChange) => {
          const current = lib.devices().find((d) => d.libraryId === change.nodeId);
          if (!current) return;
          lib.updateDevice(change.nodeId, formDataToDeviceData(change.formData, current.template));
        };
      },
    },
  ],
})
export class LibraryDetailComponent {
  private readonly libraryService = inject(LibraryService);

  readonly libraryId = input.required<string>();

  protected readonly device = computed(() =>
    this.libraryService.devices().find((d) => d.libraryId === this.libraryId()) ?? null,
  );

  protected onBack(): void {
    this.libraryService.closeDetail();
  }

  protected onRemove(): void {
    this.libraryService.removeDevice(this.libraryId());
  }
}
