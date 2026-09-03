import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const COMPONENT_ASSET_DIR = new URL('../src/assets/components/', import.meta.url);

const ASSETS = [
  {
    file: 'arduino-nano-classic.svg',
    artworkId: 'arduino-nano-classic',
    viewBox: '-1.5 -0.5 17 7',
    size: ['17', '7'],
    primaryPin: 'd1',
    pins: [
      ...[
        'd13',
        '3v3',
        'aref',
        'a0',
        'a1',
        'a2',
        'a3',
        'a4',
        'a5',
        'a6',
        'a7',
        '5v',
        'rst',
        'gnd',
        'vin',
      ].map((id, x) => [id, x, 0]),
      ...[
        'd12',
        'd11',
        'd10',
        'd9',
        'd8',
        'd7',
        'd6',
        'd5',
        'd4',
        'd3',
        'd2',
        'gnd-2',
        'rst-2',
        'd0',
        'd1',
      ].map((id, x) => [id, x, 6]),
    ],
  },
  {
    file: 'gy-521-mpu6050.svg',
    artworkId: 'gy-521-mpu6050',
    viewBox: '-0.5 -0.5 8 6.1',
    size: ['8', '6.1'],
    primaryPin: 'vcc',
    pins: ['vcc', 'gnd', 'scl', 'sda', 'xda', 'xcl', 'ad0', 'int'].map((id, x) => [id, x, 0]),
  },
  {
    file: 'tb6612fng-talus.svg',
    artworkId: 'tb6612fng-talus',
    viewBox: '-0.5 -0.5 8 7',
    size: ['8', '7'],
    primaryPin: 'vm',
    pins: [
      ...['vm', 'vcc', 'gnd', 'ao1', 'ao2', 'bo2', 'bo1', 'gnd-2'].map((id, x) => [id, x, 0]),
      ...['pwma', 'ain2', 'ain1', 'stby', 'bin1', 'bin2', 'pwmb', 'gnd-3'].map((id, x) => [
        id,
        x,
        6,
      ]),
    ],
  },
  {
    file: 'buzzer-active-12mm.svg',
    artworkId: 'buzzer-active-12mm',
    viewBox: '-0.86 -2.36 4.72 4.72',
    size: ['4.72', '4.72'],
    primaryPin: 'plus',
    pins: [
      ['plus', 0, 0],
      ['minus', 3, 0],
    ],
    rootAttributes: {
      'data-body-diameter-pitch': '4.72',
      'data-terminal-span-pitch': '3',
      'data-polarized': 'true',
    },
  },
  {
    file: 'capacitor-electrolytic-470uf-25v.svg',
    artworkId: 'capacitor-electrolytic-470uf-25v',
    viewBox: '-0.97 -1.97 3.94 3.94',
    size: ['3.94', '3.94'],
    primaryPin: 'plus',
    pins: [
      ['plus', 0, 0],
      ['minus', 2, 0],
    ],
    rootAttributes: {
      'data-body-diameter-pitch': '3.94',
      'data-terminal-span-pitch': '2',
      'data-polarized': 'true',
    },
  },
  {
    file: 'capacitor-electrolytic-470uf-16v-lead-formed.svg',
    artworkId: 'capacitor-electrolytic-470uf-16v-lead-formed',
    viewBox: '-0.575 -1.575 3.15 3.15',
    size: ['3.15', '3.15'],
    primaryPin: 'plus',
    pins: [
      ['plus', 0, 0],
      ['minus', 2, 0],
    ],
    rootAttributes: {
      'data-body-diameter-pitch': '3.15',
      'data-body-dimension-status': 'provisional',
      'data-native-terminal-pitch': '1.38',
      'data-terminal-span-pitch': '2',
      'data-lead-form': 'manual',
      'data-polarized': 'true',
    },
  },
  {
    file: 'capacitor-ceramic-100nf.svg',
    artworkId: 'capacitor-ceramic-100nf',
    viewBox: '-0.25 -0.85 2.5 1.7',
    size: ['2.5', '1.7'],
    primaryPin: null,
    pins: [
      ['a', 0, 0],
      ['b', 2, 0],
    ],
    rootAttributes: {
      'data-body-width-pitch': '1.57',
      'data-body-height-pitch': '1.57',
      'data-terminal-span-pitch': '2',
      'data-polarized': 'false',
    },
    bodyRect: ['0.215', '-0.785', '1.57', '1.57'],
  },
  {
    file: 'resistor-axial-1k.svg',
    artworkId: 'resistor-axial-1k',
    viewBox: '-1.38 -0.59 2.76 1.18',
    size: ['2.76', '1.18'],
    primaryPin: null,
    pins: [],
    rootAttributes: {
      'data-body-width-pitch': '2.56',
      'data-body-height-pitch': '0.98',
      'data-body-anchor': 'midpoint',
      'data-terminal-axis': 'x',
      'data-terminal-model': 'renderer-adjustable',
      'data-band-code': 'brown-black-red-gold',
    },
    bodyRect: ['-1.28', '-0.49', '2.56', '0.98'],
    bandColors: ['brown', 'black', 'red', 'gold'],
  },
  {
    file: 'resistor-axial-1k8.svg',
    artworkId: 'resistor-axial-1k8',
    viewBox: '-1.38 -0.59 2.76 1.18',
    size: ['2.76', '1.18'],
    primaryPin: null,
    pins: [],
    rootAttributes: {
      'data-body-width-pitch': '2.56',
      'data-body-height-pitch': '0.98',
      'data-body-anchor': 'midpoint',
      'data-terminal-axis': 'x',
      'data-terminal-model': 'renderer-adjustable',
      'data-band-code': 'brown-gray-red-gold',
    },
    bodyRect: ['-1.28', '-0.49', '2.56', '0.98'],
    bandColors: ['brown', 'gray', 'red', 'gold'],
  },
];

function attribute(source, name) {
  return source.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
}

function pinMarkers(svg) {
  return [...svg.matchAll(/<g\b([^>]*\bdata-pin-id="[^"]+"[^>]*)>/g)].map((match) => {
    const attributes = match[1];
    return {
      id: attribute(attributes, 'data-pin-id'),
      x: Number(attribute(attributes, 'data-pin-x')),
      y: Number(attribute(attributes, 'data-pin-y')),
      primary: attribute(attributes, 'data-primary') === 'true',
    };
  });
}

function markedBodyRect(svg) {
  const attributes = svg.match(/<rect\b([^>]*\bdata-body-shape="true"[^>]*)>/)?.[1] ?? '';
  return ['x', 'y', 'width', 'height'].map((name) => attribute(attributes, name));
}

function bandColors(svg) {
  return [...svg.matchAll(/\bdata-band-color="([^"]+)"/g)].map((match) => match[1]);
}

describe('built-in physical component SVG assets', () => {
  it('keeps every component SVG covered by the integrity contract', async () => {
    const files = (await readdir(COMPONENT_ASSET_DIR))
      .filter((file) => file.endsWith('.svg'))
      .sort();
    expect(files).toEqual(ASSETS.map(({ file }) => file).sort());
  });

  for (const asset of ASSETS) {
    it(`${asset.file} is inert, transparent and calibrated in pitch units`, async () => {
      const path = fileURLToPath(new URL(asset.file, COMPONENT_ASSET_DIR));
      const svg = await readFile(path, 'utf8');
      const rootAttributes = svg.match(/<svg\b([^>]*)>/)?.[1] ?? '';

      expect(svg.trimStart().startsWith('<svg')).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      expect(attribute(rootAttributes, 'xmlns')).toBe('http://www.w3.org/2000/svg');
      expect(attribute(rootAttributes, 'viewBox')).toBe(asset.viewBox);
      expect([attribute(rootAttributes, 'width'), attribute(rootAttributes, 'height')]).toEqual(
        asset.size,
      );
      expect(attribute(rootAttributes, 'fill')).toBe('none');
      expect(attribute(rootAttributes, 'data-artwork-id')).toBe(asset.artworkId);
      expect(attribute(rootAttributes, 'data-asset-revision')).toBe('2026-09-03');
      expect(attribute(rootAttributes, 'data-asset-license')).toBe('MIT');
      expect(attribute(rootAttributes, 'data-pitch-unit')).toBe('1');
      for (const [name, value] of Object.entries(asset.rootAttributes ?? {})) {
        expect(attribute(rootAttributes, name)).toBe(value);
      }

      expect(svg).not.toMatch(
        /<\/?(?:script|foreignObject|iframe|object|embed|image|use|style)\b|\s(?:href|xlink:href)\s*=|\son[a-z]+\s*=|url\s*\(|@import|<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i,
      );

      const markers = pinMarkers(svg);
      expect(markers.map(({ id, x, y }) => [id, x, y])).toEqual(asset.pins);
      expect(new Set(markers.map(({ id }) => id)).size).toBe(asset.pins.length);
      expect(markers.filter(({ primary }) => primary).map(({ id }) => id)).toEqual(
        asset.primaryPin === null ? [] : [asset.primaryPin],
      );
      if (asset.bodyRect) expect(markedBodyRect(svg)).toEqual(asset.bodyRect);
      if (asset.bandColors) expect(bandColors(svg)).toEqual(asset.bandColors);
    });
  }
});
