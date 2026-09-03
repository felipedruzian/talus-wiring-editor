import { describe, expect, it } from 'vitest';
import { type DeviceNodeData } from '../../../diagram/model/interfaces';
import { validatePhysicalDraft } from './physical-component-editor.component';

const physicalDraft = (): DeviceNodeData => ({
  type: 'device',
  deviceId: '',
  manufacturer: 'Talus',
  model: 'Modulo',
  footprintId: 'custom-module',
  footprint: {
    id: 'custom-module',
    label: 'Modulo',
    rows: 1,
    cols: 2,
    pins: [
      { id: 'vcc', label: 'VCC', cell: { row: 0, col: 0 } },
      { id: 'signal', label: 'Sinal', cell: { row: 0, col: 1 } },
    ],
    shapes: [],
  },
  ports: [
    { id: 'vcc', label: 'VCC', direction: 'input' },
    { id: 'signal', label: 'Sinal', direction: 'output' },
  ],
});

describe('physical component draft validation', () => {
  it('accepts one electrical port for every positioned physical terminal', () => {
    expect(validatePhysicalDraft(physicalDraft())).toBeNull();
  });

  it('rejects unmatched physical terminals and electrical ports', () => {
    const missingPort = physicalDraft();
    missingPort.ports.pop();
    expect(validatePhysicalDraft(missingPort)).toMatch(/terminal físico/);

    const missingPin = physicalDraft();
    missingPin.footprint?.pins.pop();
    expect(validatePhysicalDraft(missingPin)).toMatch(/posição física/);
  });
});
