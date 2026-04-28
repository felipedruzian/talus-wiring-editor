import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { type DeviceNodeData } from '../../../diagram/model/interfaces';
import { AutofocusDirective } from '../../../shared/autofocus/autofocus.directive';
import { PortsEditorComponent } from '../../../shared/ports-editor/ports-editor.component';
import { FormFieldComponent } from '../form-field/form-field.component';
import { deviceDataToFormData, type DeviceFormData } from './device-form.mappers';
import { DeviceFormService } from './device-form.service';

@Component({
  selector: 'app-device-form',
  imports: [FormField, FormFieldComponent, AutofocusDirective, PortsEditorComponent],
  templateUrl: './device-form.component.html',
  styleUrl: './device-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceFormComponent {
  private readonly formService = inject(DeviceFormService);

  readonly nodeId = input.required<string>();
  readonly nodeData = input.required<DeviceNodeData>();
  readonly hiddenFields = input<readonly (keyof DeviceFormData)[]>([]);

  protected readonly fieldTree = this.formService.fieldTree;
  protected readonly showDeviceId = computed(() => !this.hiddenFields().includes('deviceId'));
  protected readonly showLocation = computed(() => !this.hiddenFields().includes('location'));
  protected readonly autofocusManufacturer = computed(() =>
    this.showDeviceId() ? null : this.nodeId(),
  );

  constructor() {
    this.syncFormWithInputs();

    inject(DestroyRef).onDestroy(() => {
      this.formService.flush();
    });
  }

  private syncFormWithInputs(): void {
    effect(() => {
      const nodeId = this.nodeId();
      const nodeData = this.nodeData();

      untracked(() => {
        this.formService.loadFormData(nodeId, deviceDataToFormData(nodeData));
      });
    });
  }
}
