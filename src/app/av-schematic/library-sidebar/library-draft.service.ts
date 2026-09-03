import { Injectable, signal } from '@angular/core';
import { type RasterArtworkAsset } from '../diagram/artwork/artwork-asset.store';
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
  readonly pendingAssets = signal<RasterArtworkAsset[]>([]);

  reset(template: DeviceNodeData): void {
    this.draft.set(structuredClone(template));
    this.pendingAssets.set([]);
  }

  applyChange(change: DeviceFieldChange): void {
    this.draft.update((current) => formDataToDeviceData(change.formData, current));
  }

  update(update: (current: DeviceNodeData) => DeviceNodeData): void {
    this.draft.update((current) => update(structuredClone(current)));
  }

  addAsset(asset: RasterArtworkAsset): void {
    this.pendingAssets.update((assets) =>
      assets.some((candidate) => candidate.hash === asset.hash) ? assets : [...assets, asset],
    );
  }
}
