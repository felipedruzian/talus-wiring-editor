import { Injectable, signal } from '@angular/core';
import { type DeviceNodeData } from '../diagram/model/interfaces';
import { formDataToDeviceData, type DeviceFieldChange } from '../device-form/device-form.mappers';
import { createBlankTemplate } from './seed-library';

/**
 * Holds the in-progress edit/create buffer for a single library detail session.
 * Edits stay here until Save commits them through `LibraryService.commitDraft`;
 * Back simply destroys the component and the draft along with it.
 */
@Injectable()
export class LibraryDraftService {
  readonly draft = signal<DeviceNodeData>(createBlankTemplate());

  reset(template: DeviceNodeData): void {
    this.draft.set(template);
  }

  applyChange(change: DeviceFieldChange): void {
    this.draft.update((current) => formDataToDeviceData(change.formData, current));
  }
}
