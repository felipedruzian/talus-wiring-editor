import { inject, Injectable, Injector } from '@angular/core';
import { DebouncedFormController } from '../shared/forms/debounced-form-controller';
import {
  DEVICE_FORM_HIDDEN_FIELDS,
  EMPTY_DEVICE_FORM,
  ON_DEVICE_FIELD_CHANGE,
  type DeviceFormData,
} from './device-form.mappers';

const ALL_FIELDS = Object.keys(EMPTY_DEVICE_FORM) as (keyof DeviceFormData)[];

/** Form controller for the device sidebar; filters visible fields against the `DEVICE_FORM_HIDDEN_FIELDS` DI token so the library detail can hide instance-only fields. */
@Injectable()
export class DeviceFormService {
  private readonly hiddenFields = inject(DEVICE_FORM_HIDDEN_FIELDS);
  private readonly onFieldChange = inject(ON_DEVICE_FIELD_CHANGE);

  private readonly visibleFields: readonly (keyof DeviceFormData)[] = ALL_FIELDS.filter(
    (field) => !this.hiddenFields.includes(field),
  );

  private readonly controller = new DebouncedFormController<DeviceFormData>({
    empty: EMPTY_DEVICE_FORM,
    debouncedFields: this.visibleFields,
    trackedFields: this.visibleFields,
    onChange: (entityId, fields, formData) => {
      this.onFieldChange({ entityId, fields, formData });
    },
    injector: inject(Injector),
  });

  readonly formModel = this.controller.formModel;
  readonly fieldTree = this.controller.fieldTree;

  loadFormData(entityId: string, data: DeviceFormData): void {
    this.controller.loadFormData(entityId, data);
  }

  commitPendingEdits(): void {
    this.controller.commitPendingEdits();
  }
}
