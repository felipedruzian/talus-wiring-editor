import { describe, expect, it } from 'vitest';
import { MINIMAL_TWO_NETS_WIREVIZ_YAML } from './fixtures/minimal-two-nets.fixture';
import { parseWireVizDocument, WireVizModelError } from './wireviz-model';
import { parseYamlSubset, type YamlValue } from './wireviz-yaml';

const parseFixture = () => parseWireVizDocument(parseYamlSubset(MINIMAL_TWO_NETS_WIREVIZ_YAML));

describe('parseWireVizDocument', () => {
  it('parses the two connectors declared in the fixture', () => {
    const doc = parseFixture();
    expect(doc.connectors.map((c) => c.name).sort()).toEqual(['NANO', 'TB6612FNG']);
  });

  it('parses exactly two nets (acceptance criterion: minimal fixture has exactly two nets)', () => {
    const doc = parseFixture();
    expect(doc.connections).toHaveLength(2);
  });

  it('links the correct pins for the PWM net', () => {
    const doc = parseFixture();
    const pwm = doc.connections.find((c) => c.cable.name === 'W1');
    expect(pwm).toMatchObject({
      source: { connector: 'NANO', pin: 'D9' },
      target: { connector: 'TB6612FNG', pin: 'PWMA' },
    });
  });

  it('links the correct pins for the direction net', () => {
    const doc = parseFixture();
    const dir = doc.connections.find((c) => c.cable.name === 'W2');
    expect(dir).toMatchObject({
      source: { connector: 'NANO', pin: 'D8' },
      target: { connector: 'TB6612FNG', pin: 'AIN1' },
    });
  });

  it('rejects a connection referencing an undeclared pin', () => {
    const doc: YamlValue = {
      connectors: { NANO: { pins: ['D9'] }, TB6612FNG: { pins: ['PWMA'] } },
      cables: { W1: { colors: ['YE'] } },
      connections: [[{ NANO: ['D2'] }, { W1: [1] }, { TB6612FNG: ['PWMA'] }]],
    };
    expect(() => parseWireVizDocument(doc)).toThrow(WireVizModelError);
  });

  it('rejects object values instead of coercing them into pin labels', () => {
    const doc: YamlValue = {
      connectors: { NANO: { pins: [{ unexpected: 'D9' }] } },
      cables: {},
      connections: [],
    };
    expect(() => parseWireVizDocument(doc)).toThrow(WireVizModelError);
  });

  it('rejects a connection set that is not exactly [connector, cable, connector]', () => {
    const doc: YamlValue = {
      connectors: { NANO: { pins: ['D9'] } },
      cables: { W1: { colors: ['YE'] } },
      connections: [[{ NANO: ['D9'] }, { W1: [1] }]],
    };
    expect(() => parseWireVizDocument(doc)).toThrow(WireVizModelError);
  });

  it('rejects a multi-drop pin reference (more than one pin per endpoint)', () => {
    const doc: YamlValue = {
      connectors: { NANO: { pins: ['D8', 'D9'] }, TB6612FNG: { pins: ['PWMA'] } },
      cables: { W1: { colors: ['YE'] } },
      connections: [[{ NANO: ['D8', 'D9'] }, { W1: [1] }, { TB6612FNG: ['PWMA'] }]],
    };
    expect(() => parseWireVizDocument(doc)).toThrow(WireVizModelError);
  });

  it('rejects a wire index out of range for the cable', () => {
    const doc: YamlValue = {
      connectors: { NANO: { pins: ['D9'] }, TB6612FNG: { pins: ['PWMA'] } },
      cables: { W1: { colors: ['YE'] } },
      connections: [[{ NANO: ['D9'] }, { W1: [2] }, { TB6612FNG: ['PWMA'] }]],
    };
    expect(() => parseWireVizDocument(doc)).toThrow(WireVizModelError);
  });
});
