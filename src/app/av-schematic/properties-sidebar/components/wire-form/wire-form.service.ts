import { inject, Injectable, Injector } from '@angular/core';
import { DebouncedFormController } from '../../../shared/forms/debounced-form-controller';
import {
  EMPTY_WIRE_FORM,
  ON_WIRE_FIELD_CHANGE,
  type WireFormData,
} from './wire-form.mappers';

const TRACKED_FIELDS = Object.keys(EMPTY_WIRE_FORM) as (keyof WireFormData)[];
const DEBOUNCED_FIELDS: readonly (keyof WireFormData)[] = ['wireId'];

/** Form controller for the wire properties sidebar; debounces `wireId` while emitting all other field changes immediately. */
@Injectable()
export class WireFormService {
  private readonly onFieldChange = inject(ON_WIRE_FIELD_CHANGE);

  private readonly controller = new DebouncedFormController<WireFormData>({
    empty: EMPTY_WIRE_FORM,
    debouncedFields: DEBOUNCED_FIELDS,
    trackedFields: TRACKED_FIELDS,
    onChange: (entityId, fields, formData) =>
      this.onFieldChange({ edgeId: entityId, fields, formData }),
    injector: inject(Injector),
  });

  readonly formModel = this.controller.formModel;
  readonly fieldTree = this.controller.fieldTree;

  loadFormData(edgeId: string, data: WireFormData): void {
    this.controller.loadFormData(edgeId, data);
  }

  commitPendingEdits(): void {
    this.controller.commitPendingEdits();
  }
}
