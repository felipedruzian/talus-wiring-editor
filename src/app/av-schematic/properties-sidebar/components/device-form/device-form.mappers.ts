import { InjectionToken } from '@angular/core';
import { type DeviceNodeData } from '../../../diagram/model/interfaces';

export interface DeviceFormData {
  deviceId: string;
  manufacturer: string;
  model: string;
  category: string;
  location: string;
}

export interface DeviceFieldChange {
  nodeId: string;
  fields: (keyof DeviceFormData)[];
  formData: DeviceFormData;
}

export const ON_DEVICE_FIELD_CHANGE = new InjectionToken<(change: DeviceFieldChange) => void>(
  'ON_DEVICE_FIELD_CHANGE',
);

export const EMPTY_DEVICE_FORM: DeviceFormData = {
  deviceId: '',
  manufacturer: '',
  model: '',
  category: '',
  location: '',
};

export function deviceDataToFormData(data: DeviceNodeData): DeviceFormData {
  return {
    deviceId: data.deviceId,
    manufacturer: data.manufacturer,
    model: data.model,
    category: data.category ?? '',
    location: data.location ?? '',
  };
}

export function formDataToDeviceData(
  formData: DeviceFormData,
  existingData: DeviceNodeData,
): DeviceNodeData {
  return {
    ...existingData,
    deviceId: formData.deviceId,
    manufacturer: formData.manufacturer,
    model: formData.model,
    category: formData.category || undefined,
    location: formData.location || undefined,
  };
}
