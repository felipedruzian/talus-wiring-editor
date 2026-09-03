import { describe, expect, it } from 'vitest';
import { deviceCategoryLabel } from '../diagram/model/device-categories';
import { trustedArtworkForFootprint } from '../diagram/artwork/trusted-component-artwork';
import { NodeTemplateType } from '../diagram/model/interfaces';
import { CONNECTOR_TYPES } from '../shared/ui/ports-editor/connector-types';
import { resolveDeviceIllustration } from '../shared/ui/device-illustration/device-illustration';
import { asDevicePaletteItem } from './components/library-list-item/palette-item-cast';
import { SEED_LIBRARY } from './seed-library';

const seed = (libraryId: string) => {
  const device = SEED_LIBRARY.find((candidate) => candidate.libraryId === libraryId);
  if (!device) throw new Error(`Missing seed ${libraryId}`);
  return device;
};

const portLabels = (libraryId: string) => seed(libraryId).template.ports.map((port) => port.label);

describe('Talus-Droid library catalog', () => {
  it('ships the requested module and passive catalog without generic physical cards', () => {
    expect(SEED_LIBRARY.map((device) => device.libraryId)).toEqual([
      'lib-arduino-nano',
      'lib-raspberry-pi-4',
      'lib-mpu6050-gy521',
      'lib-tb6612fng',
      'lib-buzzer-active-12mm',
      'lib-resistor-1k',
      'lib-resistor-1k8',
      'lib-capacitor-electrolytic-470uf',
      'lib-capacitor-electrolytic-470uf-16v',
      'lib-capacitor-ceramic-100nf',
      'lib-lm2596s',
      'lib-hall-a3144-lm393',
    ]);
    expect(
      SEED_LIBRARY.filter((device) => !device.template.footprint).every((device) =>
        resolveDeviceIllustration(device.template),
      ),
    ).toBe(true);
  });

  it('ships buzzer, resistors and capacitors as complete physical palette components', () => {
    const expected = [
      ['lib-buzzer-active-12mm', 1, 4, 2],
      ['lib-resistor-1k', 1, 5, 2],
      ['lib-resistor-1k8', 1, 5, 2],
      ['lib-capacitor-electrolytic-470uf', 1, 3, 2],
      ['lib-capacitor-electrolytic-470uf-16v', 1, 3, 2],
      ['lib-capacitor-ceramic-100nf', 1, 3, 2],
    ] as const;

    for (const [libraryId, rows, cols, pinCount] of expected) {
      const template = seed(libraryId).template;
      expect(template.footprint).toMatchObject({
        id: template.footprintId,
        rows,
        cols,
      });
      expect(template.footprint?.pins).toHaveLength(pinCount);
      expect(template.footprint?.pins.map((pin) => pin.id)).toEqual(
        template.ports.map((candidate) => candidate.id),
      );
      expect(trustedArtworkForFootprint(template.footprintId)).toBeDefined();
      expect(asDevicePaletteItem(template).type).toBe(NodeTemplateType.FootprintNode);
    }
  });

  it('keeps passive spans and polarities explicit in the seed', () => {
    expect(seed('lib-resistor-1k').template.footprint).toMatchObject({ axialSpan: 4, cols: 5 });
    expect(seed('lib-resistor-1k8').template.footprint).toMatchObject({ axialSpan: 4, cols: 5 });
    expect(seed('lib-buzzer-active-12mm').template.footprint?.pins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'plus', cell: { row: 0, col: 0 }, primary: true }),
        expect.objectContaining({ id: 'minus', cell: { row: 0, col: 3 } }),
      ]),
    );
    expect(seed('lib-capacitor-electrolytic-470uf').template.footprint?.pins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'plus', cell: { row: 0, col: 0 }, primary: true }),
        expect.objectContaining({ id: 'minus', cell: { row: 0, col: 2 } }),
      ]),
    );
    expect(seed('lib-capacitor-electrolytic-470uf-16v').template.footprint?.pins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'plus', cell: { row: 0, col: 0 }, primary: true }),
        expect.objectContaining({ id: 'minus', cell: { row: 0, col: 2 } }),
      ]),
    );
    expect(
      seed('lib-capacitor-ceramic-100nf').template.footprint?.pins.some((pin) => pin.primary),
    ).toBe(false);
  });

  it('keeps the firmware-facing Nano and TB6612FNG pin labels and roles', () => {
    expect(portLabels('lib-arduino-nano')).toEqual(
      expect.arrayContaining([
        'D2 / HALL_L',
        'D3 / HALL_R',
        'D4 / STBY',
        'D5 / PWMA',
        'D6 / PWMB',
        'D7 / AIN1',
        'D8 / AIN2',
        'D9 / BIN1',
        'D10 / BIN2',
        'D11 / BUZZER',
        'A4 / SDA',
        'A5 / SCL',
      ]),
    );
    expect(portLabels('lib-tb6612fng')).toEqual(
      expect.arrayContaining([
        'VM',
        'VCC',
        'GND',
        'STBY',
        'PWMA',
        'PWMB',
        'AIN1',
        'AIN2',
        'BIN1',
        'BIN2',
        'AO1',
        'AO2',
        'BO1',
        'BO2',
      ]),
    );
    expect(
      seed('lib-tb6612fng')
        .template.ports.filter((port) => ['AO1', 'AO2', 'BO1', 'BO2'].includes(port.label))
        .every((port) => port.connectorType === 'Motor'),
    ).toBe(true);
  });

  it('ships Nano, GY-521 and TB6612FNG as complete physical palette modules', () => {
    const expected = [
      ['lib-arduino-nano', 7, 15, 30],
      ['lib-mpu6050-gy521', 6, 8, 8],
      ['lib-tb6612fng', 7, 8, 16],
    ] as const;

    for (const [libraryId, rows, cols, pinCount] of expected) {
      const template = seed(libraryId).template;
      const footprint = template.footprint;
      expect(footprint).toMatchObject({ id: template.footprintId, rows, cols });
      expect(footprint?.pins).toHaveLength(pinCount);
      expect(footprint?.pins.map((pin) => pin.id)).toEqual(
        template.ports.map((candidate) => candidate.id),
      );
      expect(trustedArtworkForFootprint(footprint?.id)).toBeDefined();
      expect(footprint?.artwork).toBeUndefined();
      expect(asDevicePaletteItem(template).type).toBe(NodeTemplateType.FootprintNode);
    }
  });

  it('preserves the Talus Nano ids while making D1 the physical primary pin', () => {
    const nano = seed('lib-arduino-nano').template;
    expect(nano.ports.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining([
        'vin',
        '5v',
        'gnd',
        'd2',
        'd3',
        'a4',
        'a5',
        'd0',
        'd4',
        'd5',
        'd6',
        'd7',
        'd8',
        'd9',
        'd10',
        'd11',
        'd1',
      ]),
    );
    expect(nano.footprint?.pins.filter((pin) => pin.primary).map((pin) => pin.id)).toEqual(['d1']);
  });

  it('models the exact module variants without conflating similar hardware', () => {
    const hall = seed('lib-hall-a3144-lm393').template;
    const converter = seed('lib-lm2596s').template;

    expect(hall.ports.map((port) => port.label)).toEqual(['VCC', 'GND', 'AO', 'DO']);
    expect(hall.model).toContain('provisório');
    expect(hall.notes).toContain('confirmar a serigrafia');
    expect(converter.model).toContain('LM2596S');
    expect(converter.model).not.toContain('XL4015');
    expect(converter.ports.map((port) => port.label)).toEqual(['IN+', 'IN-', 'OUT+', 'OUT-']);
  });

  it('offers every requested connector type to manual components', () => {
    expect(CONNECTOR_TYPES).toEqual(
      expect.arrayContaining(['Power', 'GPIO', 'I2C', 'PWM', 'UART', 'Motor', 'Lead']),
    );
    expect(CONNECTOR_TYPES.indexOf('TRS')).toBeLessThan(CONNECTOR_TYPES.indexOf('UART'));
    expect(CONNECTOR_TYPES.indexOf('UART')).toBeLessThan(CONNECTOR_TYPES.indexOf('USB'));
  });

  it('models Nano controller signals toward the MPU while keeping power pins as inputs', () => {
    const nanoPorts = seed('lib-arduino-nano').template.ports;
    const mpuPorts = seed('lib-mpu6050-gy521').template.ports;

    expect(nanoPorts.find((port) => port.id === 'a4')?.direction).toBe('output');
    expect(nanoPorts.find((port) => port.id === 'a5')?.direction).toBe('output');
    expect(nanoPorts.find((port) => port.id === '5v')?.direction).toBe('input');
    expect(nanoPorts.find((port) => port.id === 'gnd')?.direction).toBe('input');
    expect(mpuPorts.find((port) => port.id === 'sda')?.direction).toBe('input');
    expect(mpuPorts.find((port) => port.id === 'scl')?.direction).toBe('input');
  });

  it('localizes the Talus-Droid category labels explicitly', () => {
    expect(deviceCategoryLabel('microcontroller')).toBe('Microcontroladores');
    expect(deviceCategoryLabel('single-board-computer')).toBe('Computadores de placa única');
    expect(deviceCategoryLabel('imu')).toBe('Unidades de medição inercial');
    expect(deviceCategoryLabel('motor-driver')).toBe('Drivers de motor');
    expect(deviceCategoryLabel('voltage-regulator')).toBe('Reguladores de tensão');
    expect(deviceCategoryLabel('hall-sensor')).toBe('Sensores Hall');
    expect(deviceCategoryLabel('buzzer')).toBe('Buzzers');
    expect(deviceCategoryLabel('resistor')).toBe('Resistores');
    expect(deviceCategoryLabel('capacitor')).toBe('Capacitores');
  });

  it('uses stable category IDs instead of legacy category strings in every template', () => {
    expect(SEED_LIBRARY.every((device) => device.template.categoryId.length > 0)).toBe(true);
    expect(SEED_LIBRARY.every((device) => device.template.category === undefined)).toBe(true);
  });

  it('clones a catalog template into a draggable palette item', () => {
    const template = seed('lib-mpu6050-gy521').template;
    const paletteItem = asDevicePaletteItem(template) as unknown as { data: typeof template };

    expect(paletteItem.data).toEqual(template);
    expect(paletteItem.data).not.toBe(template);
  });

  it('creates physical palette entries as detached FootprintNode instances', () => {
    const footprint = {
      id: 'custom-module',
      label: 'Módulo',
      rows: 1,
      cols: 2,
      pins: [{ id: 'signal', label: 'SIGNAL', cell: { row: 0, col: 0 } }],
      shapes: [],
      bodyCells: [{ row: 0, col: 0 }],
    };
    const template = {
      ...seed('lib-mpu6050-gy521').template,
      footprintId: footprint.id,
      footprint,
    };

    const paletteItem = asDevicePaletteItem(template) as unknown as {
      type: NodeTemplateType;
      data: typeof template & { footprintPitch?: number; footprintRotation?: number };
    };

    expect(paletteItem.type).toBe(NodeTemplateType.FootprintNode);
    expect(paletteItem.data.footprint).toEqual(footprint);
    expect(paletteItem.data.footprint).not.toBe(footprint);
    expect(paletteItem.data.footprint.pins).not.toBe(footprint.pins);
    expect(paletteItem.data.footprintRotation).toBe(0);
    expect(paletteItem.data.footprintPitch).toBe(20);
    expect(paletteItem.data.boardId).toBeUndefined();
    expect(paletteItem.data.placement).toBeUndefined();
  });
});
