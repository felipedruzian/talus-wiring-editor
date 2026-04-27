import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { type DeviceNodeData } from '../../../diagram/model/interfaces';
import { AutofocusDirective } from '../../../shared/autofocus/autofocus.directive';
import { FormFieldComponent } from '../form-field/form-field.component';
import { deviceDataToFormData } from './device-form.mappers';
import { DeviceFormService } from './device-form.service';

@Component({
  selector: 'app-device-form',
  imports: [FormField, FormFieldComponent, AutofocusDirective],
  templateUrl: './device-form.component.html',
  styleUrl: './device-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceFormComponent {
  private readonly formService = inject(DeviceFormService);

  readonly nodeId = input.required<string>();
  readonly nodeData = input.required<DeviceNodeData>();

  protected readonly fieldTree = this.formService.fieldTree;

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
