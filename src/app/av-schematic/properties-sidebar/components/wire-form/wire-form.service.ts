import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { debounce, form } from '@angular/forms/signals';
import { EMPTY_WIRE_FORM, ON_WIRE_FIELD_CHANGE, type WireFormData } from './wire-form.mappers';

const DEBOUNCE_TIME_MS = 300;
const DEBOUNCED_FIELDS: (keyof WireFormData)[] = ['wireId'];

@Injectable()
export class WireFormService {
  private readonly onFieldChange = inject(ON_WIRE_FIELD_CHANGE);

  readonly formModel = signal<WireFormData>({ ...EMPTY_WIRE_FORM });

  readonly fieldTree = form(this.formModel, (schemaPath) => {
    DEBOUNCED_FIELDS.forEach((fieldName) => {
      debounce(schemaPath[fieldName], DEBOUNCE_TIME_MS);
    });
  });

  private lastEmittedModel: WireFormData = { ...EMPTY_WIRE_FORM };
  private currentEdgeId: string | null = null;

  constructor() {
    this.watchForChanges();
  }

  loadFormData(edgeId: string, data: WireFormData): void {
    this.flush();

    this.currentEdgeId = edgeId;
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

  private emitChange(diffs: (keyof WireFormData)[], formData: WireFormData): void {
    if (this.currentEdgeId && diffs.length) {
      this.onFieldChange({ edgeId: this.currentEdgeId, fields: diffs, formData });
    }
  }

  private getDiffs(model: WireFormData): (keyof WireFormData)[] {
    return (Object.keys(model) as (keyof WireFormData)[]).filter(
      (key) => model[key] !== this.lastEmittedModel[key],
    );
  }
}
