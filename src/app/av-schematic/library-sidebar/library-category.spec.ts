import { describe, expect, it } from 'vitest';
import { type DeviceNodeData } from '../diagram/model/interfaces';
import {
  deterministicLegacyCategoryId,
  migrateLegacyDeviceCategories,
  normalizeCategoryName,
  UNCATEGORIZED_CATEGORY_ID,
} from './library-category';

const legacyDevice = (libraryId: string, category?: string) => ({
  libraryId,
  template: {
    type: 'device' as const,
    deviceId: '',
    manufacturer: 'Talus',
    model: libraryId,
    category,
    ports: [],
  } satisfies DeviceNodeData,
});

describe('library categories', () => {
  it('normalizes names with pt-BR case, collapsed whitespace and no diacritics', () => {
    expect(normalizeCategoryName('  NÃO\t  Categórizado  ')).toBe('nao categorizado');
    expect(normalizeCategoryName('Acústica')).toBe(normalizeCategoryName(' acustica '));
  });

  it('migrates v1/v2 free-form categories deterministically to stable category IDs', () => {
    const legacy = [
      legacyDevice('known', '  MOTOR-DRIVER '),
      legacyDevice('custom-a', ' Sensór   Óptico '),
      legacyDevice('custom-b', 'sensor optico'),
      legacyDevice('fallback', '   '),
    ];

    const first = migrateLegacyDeviceCategories(legacy);
    const second = migrateLegacyDeviceCategories(structuredClone(legacy));
    const expectedCustomId = deterministicLegacyCategoryId('sensor optico');

    expect(first).toEqual(second);
    expect(first.devices.map((device) => device.template.categoryId)).toEqual([
      'motor-driver',
      expectedCustomId,
      expectedCustomId,
      UNCATEGORIZED_CATEGORY_ID,
    ]);
    expect(first.categories.filter(({ id }) => id === expectedCustomId)).toEqual([
      { id: expectedCustomId, name: 'Sensór Óptico', prefix: 'DEV' },
    ]);
    expect(first.devices.every((device) => device.template.category === undefined)).toBe(true);
  });
});
