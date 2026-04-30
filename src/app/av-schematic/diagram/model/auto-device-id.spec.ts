import { describe, expect, it } from 'vitest';
import { type Node } from 'ng-diagram';
import { generateDeviceId } from './auto-device-id';
import { type DeviceNodeData } from './interfaces';

const deviceNode = (id: string, deviceId: string, category?: string): Node<DeviceNodeData> => ({
  id,
  type: 'deviceNode',
  position: { x: 0, y: 0 },
  data: {
    type: 'device',
    deviceId,
    manufacturer: '',
    model: '',
    category,
    ports: [],
  },
});

describe('generateDeviceId', () => {
  it('starts at 1 when no devices exist for the category', () => {
    expect(generateDeviceId('microphone', [])).toBe('MIC-1');
  });

  it('returns the smallest unused integer for the prefix', () => {
    const nodes = [
      deviceNode('a', 'MIC-1', 'microphone'),
      deviceNode('b', 'MIC-3', 'microphone'),
    ];
    expect(generateDeviceId('microphone', nodes)).toBe('MIC-2');
  });

  it('ignores devices that share an id but a different prefix', () => {
    const nodes = [deviceNode('a', 'CAM-1', 'camera')];
    expect(generateDeviceId('microphone', nodes)).toBe('MIC-1');
  });

  it('normalizes the category lookup case-insensitively', () => {
    expect(generateDeviceId('Microphone', [])).toBe('MIC-1');
    expect(generateDeviceId('  MICROPHONE  ', [])).toBe('MIC-1');
  });

  it('falls back to DEV for unmapped or empty categories', () => {
    expect(generateDeviceId(undefined, [])).toBe('DEV-1');
    expect(generateDeviceId('', [])).toBe('DEV-1');
    expect(generateDeviceId('made-up', [])).toBe('DEV-1');
  });

  it('skips non-device nodes when scanning existing ids', () => {
    const stranger = {
      id: 'x',
      type: 'group',
      position: { x: 0, y: 0 },
      data: { kind: 'not-a-device' },
    } as unknown as Node;
    expect(generateDeviceId('microphone', [stranger])).toBe('MIC-1');
  });
});
