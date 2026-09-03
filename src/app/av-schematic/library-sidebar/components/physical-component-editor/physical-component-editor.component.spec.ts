import { describe, expect, it } from 'vitest';
import { type DeviceNodeData } from '../../../diagram/model/interfaces';
import { resizeFootprintGrid, validatePhysicalDraft } from './physical-component-editor.component';

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

  it('rejects two physical terminals in the same cell before save', () => {
    const overlapping = physicalDraft();
    const footprint = overlapping.footprint;
    const secondPin = footprint?.pins[1];
    if (!secondPin) throw new Error('Expected second pin');
    secondPin.cell = { row: 0, col: 0 };

    expect(validatePhysicalDraft(overlapping)).toMatch(/mesma célula/);
  });

  it('rejects a grid reduction that would collapse two terminals', () => {
    const footprint = physicalDraft().footprint;
    if (!footprint) throw new Error('Expected physical footprint');

    expect(resizeFootprintGrid(footprint, 'cols', 1)).toEqual({
      ok: false,
      message: 'A redução colocaria dois terminais na mesma célula.',
    });
    expect(resizeFootprintGrid(footprint, 'cols', 3)).toMatchObject({
      ok: true,
      footprint: { cols: 3 },
    });
  });
});
