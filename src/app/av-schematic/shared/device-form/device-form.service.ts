import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { debounce, form } from '@angular/forms/signals';
import {
  DEVICE_FORM_HIDDEN_FIELDS,
  EMPTY_DEVICE_FORM,
  ON_DEVICE_FIELD_CHANGE,
  type DeviceFormData,
} from './device-form.mappers';

const DEBOUNCE_TIME_MS = 300;
const ALL_FIELDS: readonly (keyof DeviceFormData)[] = [
  'deviceId',
  'manufacturer',
  'model',
  'category',
  'location',
  'ports',
];

@Injectable()
export class DeviceFormService {
  private readonly onFieldChange = inject(ON_DEVICE_FIELD_CHANGE);
  private readonly hiddenFields = inject(DEVICE_FORM_HIDDEN_FIELDS);

  private readonly visibleFields: readonly (keyof DeviceFormData)[] = ALL_FIELDS.filter(
    (f) => !this.hiddenFields.includes(f),
  );

  readonly formModel = signal<DeviceFormData>({ ...EMPTY_DEVICE_FORM });

  readonly fieldTree = form(this.formModel, (s) => {
    if (!this.hiddenFields.includes('deviceId')) debounce(s.deviceId, DEBOUNCE_TIME_MS);
    if (!this.hiddenFields.includes('manufacturer')) debounce(s.manufacturer, DEBOUNCE_TIME_MS);
    if (!this.hiddenFields.includes('model')) debounce(s.model, DEBOUNCE_TIME_MS);
    if (!this.hiddenFields.includes('category')) debounce(s.category, DEBOUNCE_TIME_MS);
    if (!this.hiddenFields.includes('location')) debounce(s.location, DEBOUNCE_TIME_MS);
    if (!this.hiddenFields.includes('ports')) debounce(s.ports, DEBOUNCE_TIME_MS);
  });

  private lastEmittedModel: DeviceFormData = { ...EMPTY_DEVICE_FORM };
  private currentEntityId: string | null = null;

  constructor() {
    this.watchForChanges();
  }

  loadFormData(entityId: string, data: DeviceFormData): void {
    this.flush();

    this.currentEntityId = entityId;
    this.lastEmittedModel = { ...data };
    this.formModel.set(data);
    this.fieldTree().reset();
  }

  flush(): void {
    this.visibleFields.forEach((fieldName) => {
      this.fieldTree[fieldName]().markAsTouched();
    });
  }

  private watchForChanges(): void {
    effect(() => {
      const model = this.formModel();

      untracked(() => {
        if (this.fieldTree().dirty()) {
          const diffs = this.getDiffs(model);
          this.lastEmittedModel = { ...model };
          this.emitChange(diffs, model);
        }
      });
    });
  }

  private emitChange(diffs: (keyof DeviceFormData)[], formData: DeviceFormData): void {
    if (this.currentEntityId && diffs.length) {
      this.onFieldChange({ entityId: this.currentEntityId, fields: diffs, formData });
    }
  }

  private getDiffs(model: DeviceFormData): (keyof DeviceFormData)[] {
    return this.visibleFields.filter((key) => model[key] !== this.lastEmittedModel[key]);
  }
}
