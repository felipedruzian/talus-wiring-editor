import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type DeviceNodeData } from '../../../diagram/model/interfaces';
import { deviceIllustrationLabel, resolveDeviceIllustration } from './device-illustration';

@Component({
  selector: 'app-device-illustration',
  templateUrl: './device-illustration.component.html',
  styleUrl: './device-illustration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceIllustrationComponent {
  readonly device = input.required<DeviceNodeData>();
  readonly decorative = input(false);

  protected readonly illustration = computed(() => resolveDeviceIllustration(this.device()));
  protected readonly label = computed(() => {
    const illustration = this.illustration();
    return illustration ? deviceIllustrationLabel(illustration) : '';
  });
}
