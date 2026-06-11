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
import { type WireEdgeData } from '../../../diagram/model/interfaces';
import { type WireEndpointInfo } from '../../properties-sidebar.service';
import { FormFieldComponent } from '../../../shared/ui/form-field/form-field.component';
import { wireDataToFormData, WIRE_TYPES } from './wire-form.mappers';
import { WireFormService } from './wire-form.service';

@Component({
  selector: 'app-wire-form',
  imports: [FormField, FormFieldComponent],
  templateUrl: './wire-form.component.html',
  styleUrl: './wire-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WireFormComponent {
  private readonly formService = inject(WireFormService);

  readonly edgeId = input.required<string>();
  readonly edgeData = input.required<WireEdgeData>();
  readonly source = input.required<WireEndpointInfo | null>();
  readonly target = input.required<WireEndpointInfo | null>();

  protected readonly fieldTree = this.formService.fieldTree;
  protected readonly wireTypes = WIRE_TYPES;

  constructor() {
    this.syncFormWithInputs();

    inject(DestroyRef).onDestroy(() => {
      this.formService.commitPendingEdits();
    });
  }

  private syncFormWithInputs(): void {
    effect(() => {
      const edgeId = this.edgeId();
      const edgeData = this.edgeData();

      untracked(() => {
        this.formService.loadFormData(edgeId, wireDataToFormData(edgeData));
      });
    });
  }
}
