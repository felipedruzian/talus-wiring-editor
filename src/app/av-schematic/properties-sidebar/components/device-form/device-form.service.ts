import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { debounce, form } from '@angular/forms/signals';
import {
  EMPTY_DEVICE_FORM,
  ON_DEVICE_FIELD_CHANGE,
  type DeviceFormData,
} from './device-form.mappers';

const DEBOUNCE_TIME_MS = 300;
const DEBOUNCED_FIELDS: (keyof DeviceFormData)[] = [
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

  readonly formModel = signal<DeviceFormData>({ ...EMPTY_DEVICE_FORM });

  readonly fieldTree = form(this.formModel, (schemaPath) => {
    debounce(schemaPath.deviceId, DEBOUNCE_TIME_MS);
    debounce(schemaPath.manufacturer, DEBOUNCE_TIME_MS);
    debounce(schemaPath.model, DEBOUNCE_TIME_MS);
    debounce(schemaPath.category, DEBOUNCE_TIME_MS);
    debounce(schemaPath.location, DEBOUNCE_TIME_MS);
    debounce(schemaPath.ports, DEBOUNCE_TIME_MS);
  });

  private lastEmittedModel: DeviceFormData = { ...EMPTY_DEVICE_FORM };
  private currentNodeId: string | null = null;

  constructor() {
    this.watchForChanges();
  }

  loadFormData(nodeId: string, data: DeviceFormData): void {
    this.flush();

    this.currentNodeId = nodeId;
    this.lastEmittedModel = { ...data };
    this.formModel.set(data);
    this.fieldTree().reset();
  }

  flush(): void {
    DEBOUNCED_FIELDS.forEach((fieldName) => {
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
    if (this.currentNodeId && diffs.length) {
      this.onFieldChange({ nodeId: this.currentNodeId, fields: diffs, formData });
    }
  }

  private getDiffs(model: DeviceFormData): (keyof DeviceFormData)[] {
    return (Object.keys(model) as (keyof DeviceFormData)[]).filter(
      (key) => model[key] !== this.lastEmittedModel[key],
    );
  }
}
