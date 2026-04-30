import { InjectionToken } from '@angular/core';
import { type WireEdgeData } from '../../../diagram/model/interfaces';

export const WIRE_TYPES = [
  'audio',
  'video',
  'speaker',
  'ethernet',
  'power',
  'control',
  'usb',
  'fiber',
] as const;

export type WireType = (typeof WIRE_TYPES)[number];

export interface WireFormData {
  wireId: string;
  wireType: WireType | '';
}

export interface WireFieldChange {
  edgeId: string;
  fields: (keyof WireFormData)[];
  formData: WireFormData;
}

export const ON_WIRE_FIELD_CHANGE = new InjectionToken<(change: WireFieldChange) => void>(
  'ON_WIRE_FIELD_CHANGE',
);

export const EMPTY_WIRE_FORM: WireFormData = {
  wireId: '',
  wireType: '',
};

export function wireDataToFormData(data: WireEdgeData): WireFormData {
  return {
    wireId: data.wireId,
    wireType: isWireType(data.wireType) ? data.wireType : '',
  };
}

export function formDataToWireData(
  formData: WireFormData,
  existingData: WireEdgeData,
): WireEdgeData {
  return {
    ...existingData,
    wireId: formData.wireId,
    wireType: formData.wireType || undefined,
  };
}

function isWireType(value: string | undefined): value is WireType {
  return !!value && (WIRE_TYPES as readonly string[]).includes(value);
}
