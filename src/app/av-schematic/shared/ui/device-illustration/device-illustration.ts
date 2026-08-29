import { type DeviceNodeData } from '../../../diagram/model/interfaces';

export type DeviceIllustrationId =
  | 'arduino-nano'
  | 'raspberry-pi-4'
  | 'mpu6050'
  | 'tb6612fng'
  | 'lm2596s'
  | 'hall-a3144'
  | null;

export function resolveDeviceIllustration(data: DeviceNodeData): DeviceIllustrationId {
  const identity = `${data.manufacturer} ${data.model}`.toLowerCase();
  if (identity.includes('arduino') && identity.includes('nano')) return 'arduino-nano';
  if (identity.includes('raspberry pi') && identity.includes('4')) return 'raspberry-pi-4';
  if (identity.includes('mpu6050') || identity.includes('gy-521')) return 'mpu6050';
  if (identity.includes('tb6612fng')) return 'tb6612fng';
  if (identity.includes('lm2596s')) return 'lm2596s';
  if (identity.includes('a3144') || identity.includes('lm393')) return 'hall-a3144';
  return null;
}

export function deviceIllustrationLabel(id: Exclude<DeviceIllustrationId, null>): string {
  const labels: Record<Exclude<DeviceIllustrationId, null>, string> = {
    'arduino-nano': 'Ilustração original do Arduino Nano',
    'raspberry-pi-4': 'Ilustração original do Raspberry Pi 4',
    mpu6050: 'Ilustração original do MPU6050 GY-521',
    tb6612fng: 'Ilustração original do TB6612FNG',
    lm2596s: 'Ilustração original do LM2596S',
    'hall-a3144': 'Ilustração original do módulo Hall A3144 com LM393',
  };
  return labels[id];
}
