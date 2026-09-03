// Structural validation for CanonicalProject JSON, mirrored from
// src/app/av-schematic/diagram/model/canonical-project-parse.ts.
//
// This server has no build step linking it to the Angular/TypeScript source
// (see docs/local-service.md: plain Node core modules only, no bundler), so
// validation remains plain JS. Allocation-sensitive limits come from the
// same small runtime module as the client; parity tests exercise both sides.

import { OPERATIONAL_LIMITS } from '../src/app/av-schematic/diagram/model/operational-limits.mjs';
import { normalizeOrthogonalPersistedRoute } from '../src/app/av-schematic/diagram/model/persisted-wire-route.mjs';
import {
  LibraryCatalogValidationError,
  parseRasterArtworkResource,
} from './library-catalog-validate.mjs';

export class CanonicalProjectValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanonicalProjectValidationError';
  }
}

const ALLOWED_ROUTING_MODES = ['manual'];
const ALLOWED_PORT_DIRECTIONS = ['input', 'output'];
const ALLOWED_JUNCTION_KINDS = ['junction', 'rail'];
const ALLOWED_ENDPOINT_KINDS = ['pin', 'junction'];
const ALLOWED_WIREVIZ_LINKS = ['--', '<--', '<-->', '-->'];
const WIREVIZ_COLOR_CODES = {
  BK: '#1a1a1a',
  WH: '#f5f5f5',
  GY: '#8c8c8c',
  PK: '#f4a6c6',
  RD: '#e2231a',
  OG: '#f2820d',
  YE: '#f7d417',
  OL: '#7d7f00',
  GN: '#2fa93c',
  TQ: '#2fb5a0',
  LB: '#8fc7ff',
  BU: '#1e6fd9',
  VT: '#8e3fc9',
  BN: '#7a4a1e',
  BG: '#d9c7a3',
  IV: '#fffff0',
  SL: '#708090',
  CU: '#b87333',
  SN: '#c0c0c0',
  SR: '#c9c9c9',
  GD: '#d4af37',
};
const ALLOWED_BOARD_ROTATIONS = [0, 90, 180, 270];
const ALLOWED_FOOTPRINT_PAINTS = ['none', 'body', 'body-alt', 'accent', 'lead', 'silk', 'polarity'];
const ALLOWED_TEXT_ANCHORS = ['start', 'middle', 'end'];
const DEFAULT_VISUAL_PLANES = Object.freeze({
  board: 0,
  component: 10,
  conductor: 20,
  junction: 30,
});
const MAX_PROJECT_ARTWORK_ASSETS = 64;
const MAX_PROJECT_ARTWORK_BYTES = 4 * 1024 * 1024;
const ARTWORK_HASH_PATTERN = /^[a-f0-9]{64}$/;
const CANONICAL_FORMAT_VERSION = 6;
const MAX_PROJECT_CATEGORIES = 512;
const CATEGORY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const CATEGORY_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{0,11}$/;
const UNCATEGORIZED_CATEGORY = Object.freeze({
  id: 'uncategorized',
  name: 'Não categorizado',
  prefix: 'DEV',
});
const SEED_CATEGORY_BY_ID = new Map(
  [
    UNCATEGORIZED_CATEGORY,
    ['microphone', 'Microfones', 'MIC'],
    ['wireless-mic', 'Microfones sem fio', 'WMIC'],
    ['media-player', 'Reprodutores de mídia', 'MEDIA'],
    ['mixer', 'Mesas de som', 'MIXER'],
    ['amplifier', 'Amplificadores', 'AMP'],
    ['loudspeaker', 'Alto-falantes', 'SPK'],
    ['display', 'Telas', 'DISPLAY'],
    ['camera', 'Câmeras', 'CAM'],
    ['switcher', 'Comutadores', 'SW'],
    ['microcontroller', 'Microcontroladores', 'MCU'],
    ['single-board-computer', 'Computadores de placa única', 'SBC'],
    ['imu', 'Unidades de medição inercial', 'IMU'],
    ['motor-driver', 'Drivers de motor', 'DRV'],
    ['voltage-regulator', 'Reguladores de tensão', 'REG'],
    ['hall-sensor', 'Sensores Hall', 'HALL'],
  ].map((value) => {
    const category = Array.isArray(value)
      ? { id: value[0], name: value[1], prefix: value[2] }
      : value;
    return [category.id, category];
  }),
);
// Keep these geometry constants aligned with board-geometry.ts and
// footprint-geometry.ts. The server stays dependency-free from Angular code.
const BOARD_MARGIN = 16;
const FOOTPRINT_PADDING_CELLS = 0.75;
const DANGEROUS_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const WIREVIZ_CONNECTOR_CANONICAL_KEYS = new Set([
  'type',
  'subtype',
  'pins',
  'pinlabels',
  'pincount',
  'loops',
  'notes',
  'color',
  'manufacturer',
  'mpn',
  'style',
  'show_name',
]);
const WIREVIZ_CABLE_CANONICAL_KEYS = new Set([
  'wirecount',
  'colors',
  'wirelabels',
  'gauge',
  'length',
  'notes',
  'color_code',
  'type',
  'manufacturer',
  'mpn',
]);

/** Parses and validates an untrusted canonical project. */
export function parseCanonicalProject(raw) {
  const root = expectRecord(raw, 'project');
  const version = root['formatVersion'];

  if (version === 1) return migrateV1(parseV1(root));
  if (version === 2) return parseV2(root, true, false, false, false);
  if (version === 3) return parseV2(root, false, false, false, false);
  if (version === 4) return parseV2(root, false, true, false, false);
  if (version === 5) return parseV2(root, false, true, true, false);
  if (version === 6) return parseV2(root, false, true, true, true);

  throw new CanonicalProjectValidationError(
    `project.formatVersion: expected 1, 2, 3, 4, 5 or 6, got ${JSON.stringify(version)}`,
  );
}

function parseV1(root) {
  preflightV1(root);
  const boards = expectArray(root['boards'], 'project.boards').map((b, i) =>
    parseBoard(b, `project.boards[${i}]`),
  );
  const components = expectArray(root['components'], 'project.components').map((c, i) =>
    parseLegacyComponent(c, `project.components[${i}]`),
  );
  const nets = expectArray(root['nets'], 'project.nets').map((n, i) =>
    parseLegacyNet(n, `project.nets[${i}]`),
  );

  const nodeIds = new Set();
  for (const board of boards) {
    if (nodeIds.has(board.id)) {
      throw new CanonicalProjectValidationError(`project.boards: duplicate id "${board.id}"`);
    }
    nodeIds.add(board.id);
  }

  const boardsById = new Map(boards.map((board) => [board.id, board]));

  const componentsById = new Map();
  for (const component of components) {
    if (nodeIds.has(component.id)) {
      throw new CanonicalProjectValidationError(
        `project.components: duplicate id "${component.id}"`,
      );
    }
    nodeIds.add(component.id);
    componentsById.set(component.id, component);

    if (component.boardId !== undefined && !boardsById.has(component.boardId)) {
      throw new CanonicalProjectValidationError(
        `component "${component.id}": boardId "${component.boardId}" does not match any board in the project`,
      );
    }

    for (const pin of component.pins) {
      if (pin.hole) {
        validateHoleBounds(
          pin.hole,
          component,
          boardsById,
          `component "${component.id}" pin "${pin.id}"`,
        );
      }
    }
  }

  const netIds = new Set();
  const cableColors = new Map();
  for (const net of nets) {
    if (netIds.has(net.id)) {
      throw new CanonicalProjectValidationError(`project.nets: duplicate id "${net.id}"`);
    }
    netIds.add(net.id);
    validateEndpoint(net.source, componentsById, `project.nets "${net.id}".source`);
    validateEndpoint(net.target, componentsById, `project.nets "${net.id}".target`);
    if (
      net.source.componentId === net.target.componentId &&
      net.source.pinId === net.target.pinId
    ) {
      throw new CanonicalProjectValidationError(
        `project.nets "${net.id}": both ends are the same endpoint`,
      );
    }
    if (net.wireId) {
      const color = net.colorCode ?? net.color;
      const current = cableColors.get(net.wireId);
      if (current && color && current !== color) {
        throw new CanonicalProjectValidationError(
          `project.nets: legacy cable "${net.wireId}" has conflicting colors ` +
            `("${current}" and "${color}")`,
        );
      }
      if (!current && color) cableColors.set(net.wireId, color);
    }
  }

  return { formatVersion: 1, boards, components, nets };
}

/** Mirrors the client v1 migration before the service writes a normalized snapshot. */
function migrateV1(legacy) {
  const electrical = {
    components: legacy.components.map((component) => ({
      id: component.id,
      deviceId: component.deviceId,
      manufacturer: component.manufacturer,
      model: component.model,
      categoryId: '',
      category: component.category,
      location: component.location,
      pins: component.pins.map((pin) => ({
        id: pin.id,
        label: pin.label,
        direction: pin.direction,
        connectorType: pin.connectorType,
      })),
    })),
    junctions: [],
    cables: legacyCables(legacy.nets),
    nets: buildLegacyNets(
      legacy.nets.map((net) => ({
        id: net.id,
        from: { kind: 'pin', componentId: net.source.componentId, pinId: net.source.pinId },
        to: { kind: 'pin', componentId: net.target.componentId, pinId: net.target.pinId },
        cable: net.wireId ? { name: net.wireId, wireIndex: 1 } : undefined,
        wireType: net.wireType,
        color: net.color,
        colorCode: net.colorCode,
        gauge: net.gauge,
        length: net.length,
        notes: net.note,
      })),
      new Map(legacy.nets.map((net) => [net.id, net.netId]).filter(([, name]) => !!name)),
    ),
  };
  const layout = {
    boards: legacy.boards,
    components: legacy.components.map((component) => {
      const pinHoles = component.pins
        .filter((pin) => pin.hole !== undefined)
        .map((pin) => ({ pinId: pin.id, hole: pin.hole }));
      return {
        componentId: component.id,
        position: component.position,
        visualPlane: DEFAULT_VISUAL_PLANES.component,
        boardId: component.boardId,
        pinHoles: pinHoles.length > 0 ? pinHoles : undefined,
      };
    }),
    junctions: [],
    conductors: legacy.nets.map((net) => {
      const normalized = net.points ? normalizeOrthogonalPersistedRoute(net.points) : null;
      const points = normalized && normalized.length >= 2 ? normalized : undefined;
      return {
        conductorId: net.id,
        visualPlane: DEFAULT_VISUAL_PLANES.conductor,
        routingMode: points ? 'manual' : undefined,
        points,
      };
    }),
  };
  const categorized = migrateProjectCategories(electrical, emptyResources());
  const project = {
    formatVersion: CANONICAL_FORMAT_VERSION,
    electrical: categorized.electrical,
    layout,
    resources: categorized.resources,
  };
  validateV2Project(project);
  return project;
}

function legacyCables(nets) {
  const cables = new Map();
  for (const net of [...nets].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!net.wireId) continue;
    const color = net.colorCode ?? net.color;
    const existing = cables.get(net.wireId);
    if (existing) {
      const current = existing.colors[0];
      if (current && color && current !== color) {
        throw new CanonicalProjectValidationError(
          `project.nets: legacy cable "${net.wireId}" has conflicting colors`,
        );
      }
      if (!current && color) existing.colors[0] = color;
    } else {
      cables.set(net.wireId, { name: net.wireId, wireCount: 1, colors: [color ?? ''] });
    }
  }
  return [...cables.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildLegacyNets(conductors, nameHints) {
  const parent = new Map();
  const endpoints = new Map();
  const find = (key) => {
    if (!parent.has(key)) parent.set(key, key);
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    parent.set(key, root);
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const conductor of conductors) {
    const from = v2EndpointKey(conductor.from);
    const to = v2EndpointKey(conductor.to);
    endpoints.set(from, conductor.from);
    endpoints.set(to, conductor.to);
    union(from, to);
  }
  const groups = new Map();
  for (const conductor of conductors) {
    const root = find(v2EndpointKey(conductor.from));
    const group = groups.get(root) ?? [];
    group.push(conductor);
    groups.set(root, group);
  }
  return [...groups.values()]
    .map((group) => {
      const keys = [
        ...new Set(group.flatMap((item) => [v2EndpointKey(item.from), v2EndpointKey(item.to)])),
      ].sort();
      const hints = group
        .map((item) => nameHints.get(item.id))
        .filter(Boolean)
        .sort();
      const id = `net-${keys[0]}`;
      return {
        id,
        name: hints[0] ?? id,
        endpoints: keys.map((key) => endpoints.get(key)),
        conductors: [...group].sort((a, b) => a.id.localeCompare(b.id)),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function parseV2(root, migrateVisualPlanes, readBoardJumpers, readResources, readCategories) {
  const electricalRaw = expectRecord(root['electrical'], 'project.electrical');
  const layoutRaw = expectRecord(root['layout'], 'project.layout');
  preflightV2(electricalRaw, layoutRaw);

  const electrical = {
    components: expectArray(electricalRaw['components'], 'project.electrical.components').map(
      (value, index) =>
        parseV2Component(value, `project.electrical.components[${index}]`, readCategories),
    ),
    junctions: expectArray(electricalRaw['junctions'], 'project.electrical.junctions').map(
      (value, index) => parseV2Junction(value, `project.electrical.junctions[${index}]`),
    ),
    cables: expectArray(electricalRaw['cables'], 'project.electrical.cables').map((value, index) =>
      parseV2Cable(value, `project.electrical.cables[${index}]`),
    ),
    nets: expectArray(electricalRaw['nets'], 'project.electrical.nets').map((value, index) =>
      parseV2Net(value, `project.electrical.nets[${index}]`),
    ),
  };

  const layout = {
    boards: expectArray(layoutRaw['boards'], 'project.layout.boards').map((value, index) =>
      parseBoard(
        value,
        `project.layout.boards[${index}]`,
        true,
        migrateVisualPlanes ? DEFAULT_VISUAL_PLANES.board : undefined,
      ),
    ),
    components: expectArray(layoutRaw['components'], 'project.layout.components').map(
      (value, index) =>
        parseV2ComponentLayout(
          value,
          `project.layout.components[${index}]`,
          migrateVisualPlanes ? DEFAULT_VISUAL_PLANES.component : undefined,
        ),
    ),
    junctions: expectArray(layoutRaw['junctions'], 'project.layout.junctions').map((value, index) =>
      parseV2JunctionLayout(
        value,
        `project.layout.junctions[${index}]`,
        migrateVisualPlanes ? DEFAULT_VISUAL_PLANES.junction : undefined,
      ),
    ),
    conductors: expectArray(layoutRaw['conductors'], 'project.layout.conductors').map(
      (value, index) =>
        parseV2ConductorLayout(
          value,
          `project.layout.conductors[${index}]`,
          migrateVisualPlanes ? DEFAULT_VISUAL_PLANES.conductor : undefined,
          readBoardJumpers,
        ),
    ),
  };

  const resources = readResources
    ? parseResources(root['resources'], readCategories)
    : emptyResources();
  const categorized = readCategories
    ? { electrical, resources }
    : migrateProjectCategories(electrical, resources);
  const project = {
    formatVersion: CANONICAL_FORMAT_VERSION,
    electrical: categorized.electrical,
    layout,
    resources: categorized.resources,
  };
  validateV2Project(project);
  return project;
}

function parseResources(raw, readCategories) {
  const resources = expectRecord(raw, 'project.resources');
  const artwork = expectRecord(resources['artworkAssets'], 'project.resources.artworkAssets');
  const entries = Object.entries(artwork);
  if (entries.length > MAX_PROJECT_ARTWORK_ASSETS) {
    throw new CanonicalProjectValidationError(
      `project.resources.artworkAssets: accepts at most ${MAX_PROJECT_ARTWORK_ASSETS} assets`,
    );
  }

  let decodedBytes = 0;
  const artworkAssets = {};
  for (const [hash, value] of entries) {
    const label = `project.resources.artworkAssets.${hash}`;
    try {
      const asset = parseRasterArtworkResource(hash, value, label);
      decodedBytes += asset.byteLength;
      if (decodedBytes > MAX_PROJECT_ARTWORK_BYTES) {
        throw new CanonicalProjectValidationError(
          'project.resources.artworkAssets: decoded bytes exceed 4 MiB',
        );
      }
      artworkAssets[hash] = asset;
    } catch (error) {
      if (error instanceof CanonicalProjectValidationError) throw error;
      if (error instanceof LibraryCatalogValidationError) {
        throw new CanonicalProjectValidationError(error.message);
      }
      throw error;
    }
  }
  return {
    artworkAssets,
    categories: readCategories ? parseCategoryResources(resources['categories']) : {},
  };
}

function emptyResources() {
  return { artworkAssets: {}, categories: {} };
}

function parseCategoryResources(raw) {
  const resources = expectRecord(raw, 'project.resources.categories');
  const entries = Object.entries(resources);
  if (entries.length > MAX_PROJECT_CATEGORIES) {
    throw new CanonicalProjectValidationError(
      `project.resources.categories: accepts at most ${MAX_PROJECT_CATEGORIES} categories`,
    );
  }
  const categories = {};
  const normalizedNames = new Set();
  for (const [id, value] of entries) {
    const label = `project.resources.categories.${id}`;
    const resource = expectRecord(value, label);
    const category = {
      id,
      name: expectString(resource['name'], `${label}.name`),
      prefix: expectString(resource['prefix'], `${label}.prefix`),
    };
    const normalizedName = normalizeCategoryName(category.name);
    if (
      !isCanonicalCategory(category) ||
      normalizedNames.has(normalizedName) ||
      (category.id === UNCATEGORIZED_CATEGORY.id &&
        (category.name !== UNCATEGORIZED_CATEGORY.name ||
          category.prefix !== UNCATEGORIZED_CATEGORY.prefix))
    ) {
      throw new CanonicalProjectValidationError(`${label}: invalid category definition`);
    }
    normalizedNames.add(normalizedName);
    categories[id] = { name: category.name, prefix: category.prefix };
  }
  return categories;
}

function isCanonicalCategory(category) {
  return (
    CATEGORY_ID_PATTERN.test(category.id) &&
    typeof category.name === 'string' &&
    category.name.length <= 65_536 &&
    category.name === collapseCategoryWhitespace(category.name) &&
    normalizeCategoryName(category.name) !== '' &&
    typeof category.prefix === 'string' &&
    category.prefix === category.prefix.trim().toLocaleUpperCase('pt-BR') &&
    CATEGORY_PREFIX_PATTERN.test(category.prefix)
  );
}

function collapseCategoryWhitespace(value) {
  return value.trim().replace(/\s+/gu, ' ');
}

function normalizeCategoryName(value) {
  return collapseCategoryWhitespace(value)
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function deterministicLegacyCategoryId(normalizedName) {
  const slug = normalizedName
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `legacy-${slug || 'category'}-${fnv1a(normalizedName)}`;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function migrateProjectCategories(electrical, resources) {
  const categoriesByNormalizedName = new Map(
    [...SEED_CATEGORY_BY_ID.values()].map((category) => [
      normalizeCategoryName(category.name),
      category,
    ]),
  );
  const categoriesByLegacyId = new Map(
    [...SEED_CATEGORY_BY_ID.values()].map((category) => [
      normalizeCategoryName(category.id),
      category,
    ]),
  );
  const categoriesById = new Map(SEED_CATEGORY_BY_ID);
  const components = electrical.components.map((component) => {
    const legacyName = collapseCategoryWhitespace(component.category ?? '');
    const normalizedName = normalizeCategoryName(legacyName);
    let category = normalizedName
      ? (categoriesByLegacyId.get(normalizedName) ?? categoriesByNormalizedName.get(normalizedName))
      : UNCATEGORIZED_CATEGORY;
    if (!category) {
      category = {
        id: deterministicLegacyCategoryId(normalizedName),
        name: legacyName,
        prefix: UNCATEGORIZED_CATEGORY.prefix,
      };
      categoriesByNormalizedName.set(normalizedName, category);
      categoriesById.set(category.id, category);
    }
    return { ...component, categoryId: category.id };
  });
  const referenced = new Set(components.map((component) => component.categoryId));
  const categories = Object.fromEntries(
    [...referenced].sort().map((id) => {
      const category = categoriesById.get(id) ?? UNCATEGORIZED_CATEGORY;
      return [id, { name: category.name, prefix: category.prefix }];
    }),
  );
  return { electrical: { ...electrical, components }, resources: { ...resources, categories } };
}

function preflightV1(root) {
  const boards = expectArray(root['boards'], 'project.boards');
  const components = expectArray(root['components'], 'project.components');
  const nets = expectArray(root['nets'], 'project.nets');
  const budget = new CanonicalEntityBudget();

  budget.add(boards.length, 'project.boards');
  // Match the client's normalized worst case: electrical + layout component
  // records, then conductor/layout, two endpoints, net, cable and wire slot
  // for every legacy net. The server stores v1 but enforces client parity.
  budget.add(components.length * 2, 'project.components');
  budget.add(nets.length * 7, 'project.nets');

  boards.forEach((raw, index) => {
    const label = `project.boards[${index}]`;
    const board = expectRecord(raw, label);
    if (board['holes'] !== undefined) {
      const holes = expectArray(board['holes'], `${label}.holes`);
      assertCollectionLimit(
        holes.length,
        OPERATIONAL_LIMITS.maxBoardHoles,
        `${label}.holes`,
        'hole count',
      );
      budget.add(holes.length, `${label}.holes`);
    }
    if (board['traces'] !== undefined) {
      const traces = expectArray(board['traces'], `${label}.traces`);
      let segmentCount = 0;
      assertCollectionLimit(
        traces.length,
        OPERATIONAL_LIMITS.maxBoardTraces,
        `${label}.traces`,
        'trace count',
      );
      budget.add(traces.length, `${label}.traces`);
      traces.forEach((traceRaw, traceIndex) => {
        const segmentsLabel = `${label}.traces[${traceIndex}].segments`;
        const segments = expectArray(
          expectRecord(traceRaw, `${label}.traces[${traceIndex}]`)['segments'],
          segmentsLabel,
        );
        assertCollectionLimit(
          segments.length,
          OPERATIONAL_LIMITS.maxTraceSegmentsPerBoard,
          segmentsLabel,
          'segment count',
        );
        segmentCount += segments.length;
        budget.add(segments.length, segmentsLabel);
      });
      assertCollectionLimit(
        segmentCount,
        OPERATIONAL_LIMITS.maxTraceSegmentsPerBoard,
        `${label}.traces`,
        'total segment count',
      );
    }
  });

  components.forEach((raw, index) => {
    const label = `project.components[${index}].pins`;
    const pins = expectArray(expectRecord(raw, `project.components[${index}]`)['pins'], label);
    assertCollectionLimit(pins.length, OPERATIONAL_LIMITS.maxPinsPerComponent, label, 'pin count');
    budget.add(pins.length, label);
    let placedPins = 0;
    pins.forEach((pin, pinIndex) => {
      if (
        expectRecord(pin, `project.components[${index}].pins[${pinIndex}]`)['hole'] !== undefined
      ) {
        placedPins++;
      }
    });
    budget.add(placedPins, `${label}.holes`);
  });

  nets.forEach((raw, index) => {
    const label = `project.nets[${index}].points`;
    const net = expectRecord(raw, `project.nets[${index}]`);
    if (net['points'] !== undefined) {
      budget.add(expectArray(net['points'], label).length, label);
    }
  });
}

function preflightV2(electricalRaw, layoutRaw) {
  const components = expectArray(electricalRaw['components'], 'project.electrical.components');
  const junctions = expectArray(electricalRaw['junctions'], 'project.electrical.junctions');
  const cables = expectArray(electricalRaw['cables'], 'project.electrical.cables');
  const nets = expectArray(electricalRaw['nets'], 'project.electrical.nets');
  const boards = expectArray(layoutRaw['boards'], 'project.layout.boards');
  const componentLayouts = expectArray(layoutRaw['components'], 'project.layout.components');
  const junctionLayouts = expectArray(layoutRaw['junctions'], 'project.layout.junctions');
  const conductorLayouts = expectArray(layoutRaw['conductors'], 'project.layout.conductors');
  const budget = new CanonicalEntityBudget();

  budget.add(boards.length, 'project.layout.boards');
  budget.add(components.length, 'project.electrical.components');
  budget.add(junctions.length, 'project.electrical.junctions');
  budget.add(cables.length, 'project.electrical.cables');
  budget.add(nets.length, 'project.electrical.nets');
  budget.add(componentLayouts.length, 'project.layout.components');
  budget.add(junctionLayouts.length, 'project.layout.junctions');
  budget.add(conductorLayouts.length, 'project.layout.conductors');

  boards.forEach((raw, index) => {
    const label = `project.layout.boards[${index}]`;
    const board = expectRecord(raw, label);
    if (board['holes'] !== undefined) {
      const holes = expectArray(board['holes'], `${label}.holes`);
      assertCollectionLimit(
        holes.length,
        OPERATIONAL_LIMITS.maxBoardHoles,
        `${label}.holes`,
        'hole count',
      );
      budget.add(holes.length, `${label}.holes`);
    }
    if (board['traces'] !== undefined) {
      const traces = expectArray(board['traces'], `${label}.traces`);
      let segmentCount = 0;
      assertCollectionLimit(
        traces.length,
        OPERATIONAL_LIMITS.maxBoardTraces,
        `${label}.traces`,
        'trace count',
      );
      budget.add(traces.length, `${label}.traces`);
      traces.forEach((traceRaw, traceIndex) => {
        const traceLabel = `${label}.traces[${traceIndex}].segments`;
        const segments = expectArray(expectRecord(traceRaw, traceLabel)['segments'], traceLabel);
        assertCollectionLimit(
          segments.length,
          OPERATIONAL_LIMITS.maxTraceSegmentsPerBoard,
          traceLabel,
          'segment count',
        );
        segmentCount += segments.length;
        budget.add(segments.length, traceLabel);
      });
      assertCollectionLimit(
        segmentCount,
        OPERATIONAL_LIMITS.maxTraceSegmentsPerBoard,
        `${label}.traces`,
        'total segment count',
      );
    }
  });

  components.forEach((raw, index) => {
    const label = `project.electrical.components[${index}].pins`;
    const pins = expectArray(
      expectRecord(raw, `project.electrical.components[${index}]`)['pins'],
      label,
    );
    assertCollectionLimit(pins.length, OPERATIONAL_LIMITS.maxPinsPerComponent, label, 'pin count');
    budget.add(pins.length, label);
  });

  cables.forEach((raw, index) => {
    const label = `project.electrical.cables[${index}].wireCount`;
    const cable = expectRecord(raw, `project.electrical.cables[${index}]`);
    const wireCount = expectBoundedPositiveInteger(
      cable['wireCount'],
      label,
      OPERATIONAL_LIMITS.maxWiresPerCable,
      'wire count',
    );
    const colorsLabel = `project.electrical.cables[${index}].colors`;
    const colors = expectArray(cable['colors'], colorsLabel);
    if (colors.length > wireCount) {
      throw new CanonicalProjectValidationError(
        `${colorsLabel}: has ${colors.length} entries but wireCount is ${wireCount}`,
      );
    }
    const wireLabelsLabel = `project.electrical.cables[${index}].wireLabels`;
    if (cable['wireLabels'] !== undefined) {
      const wireLabels = expectArray(cable['wireLabels'], wireLabelsLabel);
      if (wireLabels.length > wireCount) {
        throw new CanonicalProjectValidationError(
          `${wireLabelsLabel}: has ${wireLabels.length} entries but wireCount is ${wireCount}`,
        );
      }
      budget.add(wireLabels.length, wireLabelsLabel);
    }
    budget.add(wireCount, label);
  });

  nets.forEach((raw, index) => {
    const netLabel = `project.electrical.nets[${index}]`;
    const net = expectRecord(raw, netLabel);
    const endpointsLabel = `${netLabel}.endpoints`;
    const conductorsLabel = `${netLabel}.conductors`;
    budget.add(expectArray(net['endpoints'], endpointsLabel).length, endpointsLabel);
    budget.add(expectArray(net['conductors'], conductorsLabel).length, conductorsLabel);
  });

  componentLayouts.forEach((raw, index) => {
    const label = `project.layout.components[${index}].pinHoles`;
    const layout = expectRecord(raw, `project.layout.components[${index}]`);
    if (layout['pinHoles'] !== undefined) {
      budget.add(expectArray(layout['pinHoles'], label).length, label);
    }
    if (layout['footprint'] !== undefined) {
      const footprintLabel = `project.layout.components[${index}].footprint`;
      const footprint = expectRecord(layout['footprint'], footprintLabel);
      const pins = expectArray(footprint['pins'], `${footprintLabel}.pins`);
      assertCollectionLimit(
        pins.length,
        OPERATIONAL_LIMITS.maxPinsPerComponent,
        `${footprintLabel}.pins`,
        'pin count',
      );
      budget.add(pins.length, `${footprintLabel}.pins`);
      const shapes = expectArray(footprint['shapes'], `${footprintLabel}.shapes`);
      assertCollectionLimit(
        shapes.length,
        OPERATIONAL_LIMITS.maxFootprintShapes,
        `${footprintLabel}.shapes`,
        'shape count',
      );
      budget.add(shapes.length, `${footprintLabel}.shapes`);
      if (footprint['bodyCells'] !== undefined) {
        const cells = expectArray(footprint['bodyCells'], `${footprintLabel}.bodyCells`);
        assertCollectionLimit(
          cells.length,
          OPERATIONAL_LIMITS.maxBoardHoles,
          `${footprintLabel}.bodyCells`,
          'body cell count',
        );
        budget.add(cells.length, `${footprintLabel}.bodyCells`);
      }
    }
  });

  junctionLayouts.forEach((raw, index) => {
    const label = `project.layout.junctions[${index}].taps`;
    const layout = expectRecord(raw, `project.layout.junctions[${index}]`);
    expectBoundedPositiveInteger(
      layout['taps'],
      label,
      OPERATIONAL_LIMITS.maxJunctionTaps,
      'junction tap count',
    );
  });

  conductorLayouts.forEach((raw, index) => {
    const label = `project.layout.conductors[${index}].points`;
    const layout = expectRecord(raw, `project.layout.conductors[${index}]`);
    if (layout['points'] !== undefined) {
      budget.add(expectArray(layout['points'], label).length, label);
    }
    if (layout['boardJumper'] !== undefined) {
      const jumper = expectRecord(
        layout['boardJumper'],
        `project.layout.conductors[${index}].boardJumper`,
      );
      if (jumper['bends'] !== undefined) {
        const bendsLabel = `project.layout.conductors[${index}].boardJumper.bends`;
        budget.add(expectArray(jumper['bends'], bendsLabel).length, bendsLabel);
      }
    }
  });
}

function parseV2Component(raw, label, requireCategoryId) {
  const obj = expectRecord(raw, label);
  const pins = expectArray(obj['pins'], `${label}.pins`).map((value, index) =>
    parseV2Pin(value, `${label}.pins[${index}]`),
  );

  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    deviceId: expectString(obj['deviceId'], `${label}.deviceId`),
    manufacturer: expectString(obj['manufacturer'], `${label}.manufacturer`),
    model: expectString(obj['model'], `${label}.model`),
    categoryId: requireCategoryId
      ? expectNonEmptyString(obj['categoryId'], `${label}.categoryId`)
      : (expectOptionalString(obj['categoryId'], `${label}.categoryId`) ?? ''),
    category: expectOptionalString(obj['category'], `${label}.category`),
    location: expectOptionalString(obj['location'], `${label}.location`),
    wirevizName: expectOptionalString(obj['wirevizName'], `${label}.wirevizName`),
    wirevizType: expectOptionalString(obj['wirevizType'], `${label}.wirevizType`),
    wirevizSubtype: expectOptionalString(obj['wirevizSubtype'], `${label}.wirevizSubtype`),
    wirevizColor: expectOptionalString(obj['wirevizColor'], `${label}.wirevizColor`),
    wirevizManufacturer: expectOptionalString(
      obj['wirevizManufacturer'],
      `${label}.wirevizManufacturer`,
    ),
    wirevizMpn: expectOptionalString(obj['wirevizMpn'], `${label}.wirevizMpn`),
    wirevizStyle: expectOptionalString(obj['wirevizStyle'], `${label}.wirevizStyle`),
    wirevizShowName: expectOptionalBoolean(obj['wirevizShowName'], `${label}.wirevizShowName`),
    notes: expectOptionalString(obj['notes'], `${label}.notes`),
    wirevizExtras: expectOptionalJsonRecord(
      obj['wirevizExtras'],
      `${label}.wirevizExtras`,
      WIREVIZ_CONNECTOR_CANONICAL_KEYS,
    ),
    pins,
  };
}

function parseV2Pin(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    direction: expectOneOf(obj['direction'], ALLOWED_PORT_DIRECTIONS, `${label}.direction`),
    connectorType: expectOptionalString(obj['connectorType'], `${label}.connectorType`),
    wirevizDesignator: expectOptionalString(obj['wirevizDesignator'], `${label}.wirevizDesignator`),
    wirevizLabel: expectOptionalString(obj['wirevizLabel'], `${label}.wirevizLabel`),
  };
}

function parseV2Junction(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    kind: expectOneOf(obj['kind'], ALLOWED_JUNCTION_KINDS, `${label}.kind`),
    notes: expectOptionalString(obj['notes'], `${label}.notes`),
    wirevizName: expectOptionalString(obj['wirevizName'], `${label}.wirevizName`),
    wirevizType: expectOptionalString(obj['wirevizType'], `${label}.wirevizType`),
    wirevizSubtype: expectOptionalString(obj['wirevizSubtype'], `${label}.wirevizSubtype`),
    wirevizColor: expectOptionalString(obj['wirevizColor'], `${label}.wirevizColor`),
    wirevizManufacturer: expectOptionalString(
      obj['wirevizManufacturer'],
      `${label}.wirevizManufacturer`,
    ),
    wirevizMpn: expectOptionalString(obj['wirevizMpn'], `${label}.wirevizMpn`),
    wirevizStyle: expectOptionalString(obj['wirevizStyle'], `${label}.wirevizStyle`),
    wirevizShowName: expectOptionalBoolean(obj['wirevizShowName'], `${label}.wirevizShowName`),
    wirevizExtras: expectOptionalJsonRecord(
      obj['wirevizExtras'],
      `${label}.wirevizExtras`,
      WIREVIZ_CONNECTOR_CANONICAL_KEYS,
    ),
  };
}

function parseV2Cable(raw, label) {
  const obj = expectRecord(raw, label);
  const wireCount = expectBoundedPositiveInteger(
    obj['wireCount'],
    `${label}.wireCount`,
    OPERATIONAL_LIMITS.maxWiresPerCable,
    'wire count',
  );
  const colors = expectArray(obj['colors'], `${label}.colors`).map((value, index) =>
    expectString(value, `${label}.colors[${index}]`),
  );
  if (colors.length > wireCount) {
    throw new CanonicalProjectValidationError(
      `${label}.colors: has ${colors.length} entries but wireCount is ${wireCount}`,
    );
  }
  while (colors.length < wireCount) colors.push('');
  const wireLabels =
    obj['wireLabels'] === undefined
      ? undefined
      : expectArray(obj['wireLabels'], `${label}.wireLabels`).map((value, index) =>
          expectString(value, `${label}.wireLabels[${index}]`),
        );
  if (wireLabels && wireLabels.length > wireCount) {
    throw new CanonicalProjectValidationError(
      `${label}.wireLabels: has ${wireLabels.length} entries but wireCount is ${wireCount}`,
    );
  }
  if (wireLabels) while (wireLabels.length < wireCount) wireLabels.push('');

  return {
    name: expectNonEmptyString(obj['name'], `${label}.name`),
    wireCount,
    colors,
    wireLabels,
    gauge: expectOptionalString(obj['gauge'], `${label}.gauge`),
    length: expectOptionalString(obj['length'], `${label}.length`),
    notes: expectOptionalString(obj['notes'], `${label}.notes`),
    type: expectOptionalString(obj['type'], `${label}.type`),
    manufacturer: expectOptionalString(obj['manufacturer'], `${label}.manufacturer`),
    mpn: expectOptionalString(obj['mpn'], `${label}.mpn`),
    colorCode: expectOptionalString(obj['colorCode'], `${label}.colorCode`),
    wirevizExtras: expectOptionalJsonRecord(
      obj['wirevizExtras'],
      `${label}.wirevizExtras`,
      WIREVIZ_CABLE_CANONICAL_KEYS,
    ),
  };
}

function parseV2Net(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    name: expectString(obj['name'], `${label}.name`),
    endpoints: expectArray(obj['endpoints'], `${label}.endpoints`).map((value, index) =>
      parseV2Endpoint(value, `${label}.endpoints[${index}]`),
    ),
    conductors: expectArray(obj['conductors'], `${label}.conductors`).map((value, index) =>
      parseV2Conductor(value, `${label}.conductors[${index}]`),
    ),
  };
}

function parseV2Endpoint(raw, label) {
  const obj = expectRecord(raw, label);
  const kind = expectOneOf(obj['kind'], ALLOWED_ENDPOINT_KINDS, `${label}.kind`);
  if (kind === 'junction') {
    return { kind, junctionId: expectNonEmptyString(obj['junctionId'], `${label}.junctionId`) };
  }
  return {
    kind,
    componentId: expectNonEmptyString(obj['componentId'], `${label}.componentId`),
    pinId: expectNonEmptyString(obj['pinId'], `${label}.pinId`),
  };
}

function parseV2Conductor(raw, label) {
  const obj = expectRecord(raw, label);
  const color = expectOptionalString(obj['color'], `${label}.color`);
  const colorCode = expectOptionalString(obj['colorCode'], `${label}.colorCode`);
  validateWireColorPair(color, colorCode, label);
  let cable;
  if (obj['cable'] !== undefined) {
    const cableRaw = expectRecord(obj['cable'], `${label}.cable`);
    cable = {
      name: expectNonEmptyString(cableRaw['name'], `${label}.cable.name`),
      wireIndex: expectPositiveInteger(cableRaw['wireIndex'], `${label}.cable.wireIndex`),
    };
  }
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    from: parseV2Endpoint(obj['from'], `${label}.from`),
    to: parseV2Endpoint(obj['to'], `${label}.to`),
    cable,
    wireType: expectOptionalString(obj['wireType'], `${label}.wireType`),
    color,
    colorCode,
    gauge: expectOptionalString(obj['gauge'], `${label}.gauge`),
    length: expectOptionalString(obj['length'], `${label}.length`),
    notes: expectOptionalString(obj['notes'], `${label}.notes`),
    wirevizLink:
      obj['wirevizLink'] === undefined
        ? undefined
        : expectOneOf(obj['wirevizLink'], ALLOWED_WIREVIZ_LINKS, `${label}.wirevizLink`),
    wirevizLoop: expectOptionalBoolean(obj['wirevizLoop'], `${label}.wirevizLoop`),
  };
}

function parseV2ComponentLayout(raw, label, fallbackVisualPlane) {
  const obj = expectRecord(raw, label);
  return {
    componentId: expectNonEmptyString(obj['componentId'], `${label}.componentId`),
    position: expectPoint(obj['position'], `${label}.position`),
    visualPlane: parseVisualPlane(obj['visualPlane'], `${label}.visualPlane`, fallbackVisualPlane),
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
    footprintId: expectOptionalString(obj['footprintId'], `${label}.footprintId`),
    footprint:
      obj['footprint'] === undefined
        ? undefined
        : parseFootprint(obj['footprint'], `${label}.footprint`),
    placement:
      obj['placement'] === undefined
        ? undefined
        : parseDevicePlacement(obj['placement'], `${label}.placement`),
    footprintRotation:
      obj['footprintRotation'] === undefined
        ? undefined
        : parseBoardRotation(obj['footprintRotation'], `${label}.footprintRotation`),
    footprintPitch:
      obj['footprintPitch'] === undefined
        ? undefined
        : expectBoundedPositiveFiniteNumber(
            obj['footprintPitch'],
            `${label}.footprintPitch`,
            OPERATIONAL_LIMITS.maxBoardPitch,
            'pitch',
          ),
    pinHoles:
      obj['pinHoles'] === undefined
        ? undefined
        : expectArray(obj['pinHoles'], `${label}.pinHoles`).map((value, index) =>
            parseV2PinPlacement(value, `${label}.pinHoles[${index}]`),
          ),
  };
}

function parseV2PinPlacement(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    pinId: expectNonEmptyString(obj['pinId'], `${label}.pinId`),
    hole: expectHole(obj['hole'], `${label}.hole`),
  };
}

function parseV2JunctionLayout(raw, label, fallbackVisualPlane) {
  const obj = expectRecord(raw, label);
  return {
    junctionId: expectNonEmptyString(obj['junctionId'], `${label}.junctionId`),
    position: expectPoint(obj['position'], `${label}.position`),
    visualPlane: parseVisualPlane(obj['visualPlane'], `${label}.visualPlane`, fallbackVisualPlane),
    taps: expectBoundedPositiveInteger(
      obj['taps'],
      `${label}.taps`,
      OPERATIONAL_LIMITS.maxJunctionTaps,
      'junction tap count',
    ),
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
    hole: obj['hole'] === undefined ? undefined : expectHole(obj['hole'], `${label}.hole`),
    boardPort: expectOptionalString(obj['boardPort'], `${label}.boardPort`),
  };
}

function parseV2ConductorLayout(raw, label, fallbackVisualPlane, readBoardJumpers = true) {
  const obj = expectRecord(raw, label);
  const routingMode =
    obj['routingMode'] === undefined
      ? undefined
      : expectOneOf(obj['routingMode'], ALLOWED_ROUTING_MODES, `${label}.routingMode`);
  const parsedPoints =
    obj['points'] === undefined
      ? undefined
      : expectArray(obj['points'], `${label}.points`).map((value, index) =>
          expectPoint(value, `${label}.points[${index}]`),
        );
  const points = validateManualRoute(routingMode, parsedPoints, label);
  if (readBoardJumpers && obj['boardId'] !== undefined) {
    throw new CanonicalProjectValidationError(
      `${label}.boardId: use boardJumper.boardId for board-local conductors`,
    );
  }
  const boardJumper =
    readBoardJumpers && obj['boardJumper'] !== undefined
      ? parseBoardJumperLayout(obj['boardJumper'], `${label}.boardJumper`)
      : undefined;
  if (boardJumper && (routingMode !== undefined || points !== undefined)) {
    throw new CanonicalProjectValidationError(
      `${label}: boardJumper derives endpoints and cannot contain routingMode or points`,
    );
  }
  return {
    conductorId: expectNonEmptyString(obj['conductorId'], `${label}.conductorId`),
    visualPlane: parseVisualPlane(obj['visualPlane'], `${label}.visualPlane`, fallbackVisualPlane),
    boardJumper,
    routingMode,
    points,
    fromTap:
      obj['fromTap'] === undefined
        ? undefined
        : expectNonNegativeInteger(obj['fromTap'], `${label}.fromTap`),
    toTap:
      obj['toTap'] === undefined
        ? undefined
        : expectNonNegativeInteger(obj['toTap'], `${label}.toTap`),
    physicalBinding: expectOptionalBoolean(obj['physicalBinding'], `${label}.physicalBinding`),
  };
}

function parseBoardJumperLayout(raw, label) {
  const obj = expectRecord(raw, label);
  const bends =
    obj['bends'] === undefined
      ? undefined
      : expectArray(obj['bends'], `${label}.bends`).map((point, index) =>
          expectPoint(point, `${label}.bends[${index}]`),
        );
  return {
    boardId: expectNonEmptyString(obj['boardId'], `${label}.boardId`),
    bends: bends?.length ? bends : undefined,
  };
}

function validateManualRoute(routingMode, points, label) {
  if (routingMode === undefined) {
    if (points !== undefined) {
      throw new CanonicalProjectValidationError(
        `${label}.points: points require routingMode "manual"`,
      );
    }
    return undefined;
  }
  if (!points || points.length < 2) {
    throw new CanonicalProjectValidationError(
      `${label}: manual routing requires at least 2 points`,
    );
  }
  const normalized = normalizeOrthogonalPersistedRoute(points);
  if (!normalized || normalized.length < 2) {
    throw new CanonicalProjectValidationError(`${label}.points: route is not orthogonal`);
  }
  return normalized;
}

function validateV2Project(project) {
  const { components, junctions, cables, nets } = project.electrical;
  const { boards } = project.layout;
  const nodeIds = new Set();
  const claimNodeId = (id, label) => {
    if (nodeIds.has(id)) {
      throw new CanonicalProjectValidationError(`${label}: duplicate node id "${id}"`);
    }
    nodeIds.add(id);
  };

  const boardsById = new Map();
  for (const board of boards) {
    claimNodeId(board.id, 'project.layout.boards');
    validateV2Board(board);
    boardsById.set(board.id, board);
  }

  const componentsById = new Map();
  for (const component of components) {
    claimNodeId(component.id, 'project.electrical.components');
    componentsById.set(component.id, component);
    const pinIds = new Set();
    for (const pin of component.pins) {
      if (pinIds.has(pin.id)) {
        throw new CanonicalProjectValidationError(
          `project.electrical.components "${component.id}".pins: duplicate id "${pin.id}"`,
        );
      }
      pinIds.add(pin.id);
    }
  }

  const junctionsById = new Map();
  for (const junction of junctions) {
    claimNodeId(junction.id, 'project.electrical.junctions');
    junctionsById.set(junction.id, junction);
  }

  const cablesByName = new Map();
  for (const cable of cables) {
    if (cablesByName.has(cable.name)) {
      throw new CanonicalProjectValidationError(
        `project.electrical.cables: duplicate name "${cable.name}"`,
      );
    }
    cablesByName.set(cable.name, cable);
  }

  const netIds = new Set();
  const conductorIds = new Set();
  const endpointOwners = new Map();
  const conductorsById = new Map();

  for (const net of nets) {
    if (netIds.has(net.id)) {
      throw new CanonicalProjectValidationError(
        `project.electrical.nets: duplicate id "${net.id}"`,
      );
    }
    netIds.add(net.id);
    const label = `project.electrical.nets "${net.id}"`;
    if (net.conductors.length === 0) {
      throw new CanonicalProjectValidationError(`${label}: a net must have at least one conductor`);
    }

    const declared = new Set();
    for (const endpoint of net.endpoints) {
      const key = v2EndpointKey(endpoint);
      if (declared.has(key)) {
        throw new CanonicalProjectValidationError(
          `${label}.endpoints: duplicate endpoint "${key}"`,
        );
      }
      declared.add(key);
      resolveV2Endpoint(endpoint, componentsById, junctionsById, `${label}.endpoints`);
      const owner = endpointOwners.get(key);
      if (owner !== undefined && owner !== net.id) {
        throw new CanonicalProjectValidationError(
          `${label}.endpoints: "${key}" already belongs to net "${owner}"`,
        );
      }
      endpointOwners.set(key, net.id);
    }

    const touched = new Set();
    for (const conductor of net.conductors) {
      if (conductorIds.has(conductor.id)) {
        throw new CanonicalProjectValidationError(
          `project.electrical.nets: duplicate conductor id "${conductor.id}"`,
        );
      }
      conductorIds.add(conductor.id);
      conductorsById.set(conductor.id, conductor);

      const conductorLabel = `${label}.conductors "${conductor.id}"`;
      const fromKey = v2EndpointKey(conductor.from);
      const toKey = v2EndpointKey(conductor.to);
      if (fromKey === toKey) {
        throw new CanonicalProjectValidationError(
          `${conductorLabel}: both ends are the same endpoint`,
        );
      }
      for (const key of [fromKey, toKey]) {
        if (!declared.has(key)) {
          throw new CanonicalProjectValidationError(
            `${conductorLabel}: endpoint "${key}" is not listed in the net's endpoints`,
          );
        }
        touched.add(key);
      }

      if (conductor.cable) {
        if (conductor.wirevizLoop) {
          throw new CanonicalProjectValidationError(
            `${conductorLabel}: an internal WireViz loop cannot reference a cable`,
          );
        }
        if (conductor.wirevizLink !== undefined) {
          throw new CanonicalProjectValidationError(
            `${conductorLabel}: wirevizLink is only valid when the conductor has no cable`,
          );
        }
        const cable = cablesByName.get(conductor.cable.name);
        if (!cable) {
          throw new CanonicalProjectValidationError(
            `${conductorLabel}: no cable "${conductor.cable.name}" in project.electrical.cables`,
          );
        }
        if (conductor.cable.wireIndex > cable.wireCount) {
          throw new CanonicalProjectValidationError(
            `${conductorLabel}: wire index ${conductor.cable.wireIndex} is out of range`,
          );
        }
      }
      if (conductor.wirevizLoop) {
        if (conductor.wirevizLink !== undefined) {
          throw new CanonicalProjectValidationError(
            `${conductorLabel}: an internal WireViz loop cannot declare wirevizLink`,
          );
        }
        if (
          conductor.from.kind !== 'pin' ||
          conductor.to.kind !== 'pin' ||
          conductor.from.componentId !== conductor.to.componentId
        ) {
          throw new CanonicalProjectValidationError(
            `${conductorLabel}: an internal WireViz loop must join two pins of one component`,
          );
        }
      }
    }

    for (const key of declared) {
      if (!touched.has(key)) {
        throw new CanonicalProjectValidationError(
          `${label}.endpoints: "${key}" is declared but no conductor reaches it`,
        );
      }
    }
    if (v2ConnectedGroupCount(net.conductors) !== 1) {
      throw new CanonicalProjectValidationError(`${label}: conductors are not one connected group`);
    }
  }

  validateV2Layout(
    project,
    boardsById,
    componentsById,
    junctionsById,
    conductorIds,
    conductorsById,
  );
  validateArtworkResourceReferences(project);
  validateCategoryResourceReferences(project);
}

function validateArtworkResourceReferences(project) {
  const referenced = new Set(
    project.layout.components.flatMap((component) => {
      const hash = component.footprint?.artwork?.assetHash;
      return hash ? [hash] : [];
    }),
  );
  const available = new Set(Object.keys(project.resources.artworkAssets));
  for (const hash of referenced) {
    if (!available.has(hash)) {
      throw new CanonicalProjectValidationError(
        `project.resources.artworkAssets: missing artwork "${hash}" referenced by a footprint`,
      );
    }
  }
  for (const hash of available) {
    if (!referenced.has(hash)) {
      throw new CanonicalProjectValidationError(
        `project.resources.artworkAssets: unreferenced artwork "${hash}"`,
      );
    }
  }
}

function validateCategoryResourceReferences(project) {
  const referenced = new Set(
    project.electrical.components.map((component) => component.categoryId),
  );
  const available = new Set(Object.keys(project.resources.categories));
  for (const categoryId of referenced) {
    if (!available.has(categoryId)) {
      throw new CanonicalProjectValidationError(
        `project.resources.categories: missing category "${categoryId}" referenced by a component`,
      );
    }
  }
  for (const categoryId of available) {
    if (!referenced.has(categoryId)) {
      throw new CanonicalProjectValidationError(
        `project.resources.categories: unreferenced category "${categoryId}"`,
      );
    }
  }
}

function validateV2Layout(
  project,
  boardsById,
  componentsById,
  junctionsById,
  conductorIds,
  conductorsById,
) {
  const seenComponents = new Set();
  const physicalClaims = [];
  for (const layout of project.layout.components) {
    const label = `project.layout.components "${layout.componentId}"`;
    if (seenComponents.has(layout.componentId)) {
      throw new CanonicalProjectValidationError(`${label}: duplicate layout entry`);
    }
    seenComponents.add(layout.componentId);
    const component = componentsById.get(layout.componentId);
    if (!component) {
      throw new CanonicalProjectValidationError(
        `${label}: no such component in project.electrical`,
      );
    }
    if (layout.boardId !== undefined && !boardsById.has(layout.boardId)) {
      throw new CanonicalProjectValidationError(
        `${label}: boardId "${layout.boardId}" does not match any board in the project`,
      );
    }
    if (layout.footprintId !== undefined && layout.footprint === undefined) {
      throw new CanonicalProjectValidationError(
        `${label}: footprintId requires an embedded footprint definition`,
      );
    }
    if (layout.footprint !== undefined) {
      validateV2Footprint(layout.footprint, `${label}.footprint`);
      if (layout.footprintId === undefined) {
        throw new CanonicalProjectValidationError(`${label}: footprint requires footprintId`);
      }
      if (layout.footprint.id !== layout.footprintId) {
        throw new CanonicalProjectValidationError(
          `${label}: footprint id "${layout.footprint.id}" differs from footprintId "${layout.footprintId}"`,
        );
      }
      const footprintPinIds = new Set(layout.footprint.pins.map((pin) => pin.id));
      for (const pin of component.pins) {
        if (!footprintPinIds.has(pin.id)) {
          throw new CanonicalProjectValidationError(
            `${label}.footprint: no physical pin for electrical pin "${pin.id}"`,
          );
        }
      }
    }
    if (layout.placement !== undefined && layout.footprint === undefined) {
      throw new CanonicalProjectValidationError(`${label}: placement requires a footprint`);
    }
    if (
      (layout.footprintRotation !== undefined || layout.footprintPitch !== undefined) &&
      layout.footprint === undefined
    ) {
      throw new CanonicalProjectValidationError(
        `${label}: footprint display geometry requires a footprint`,
      );
    }
    if (
      layout.placement !== undefined &&
      (layout.footprintRotation !== undefined || layout.footprintPitch !== undefined)
    ) {
      throw new CanonicalProjectValidationError(
        `${label}: placement cannot be combined with footprint display geometry`,
      );
    }
    if (layout.placement && layout.footprint) {
      const board = boardsById.get(layout.placement.boardId);
      if (!board) {
        throw new CanonicalProjectValidationError(
          `${label}.placement: no board "${layout.placement.boardId}"`,
        );
      }
      if (layout.boardId !== undefined && layout.boardId !== layout.placement.boardId) {
        throw new CanonicalProjectValidationError(
          `${label}: boardId and placement.boardId must identify the same board`,
        );
      }
      const pinResolution = resolveFootprintPinHoles(layout.footprint, layout.placement, board);
      if (pinResolution.missingPinIds.length > 0) {
        throw new CanonicalProjectValidationError(
          `${label}.placement: rigid pin markers do not match board holes (${pinResolution.missingPinIds.join(', ')})`,
        );
      }
      const duplicateMarkerHole = duplicateResolvedMarkerHole(pinResolution.pins);
      if (duplicateMarkerHole) {
        throw new CanonicalProjectValidationError(
          `${label}.placement: rigid pin markers "${duplicateMarkerHole.firstPinId}" and ` +
            `"${duplicateMarkerHole.secondPinId}" resolve to the same board hole ` +
            `{row: ${duplicateMarkerHole.hole.row}, col: ${duplicateMarkerHole.hole.col}}`,
        );
      }
      if (!rigidArtworkFitsBoard(board, layout.footprint, layout.placement)) {
        throw new CanonicalProjectValidationError(
          `${label}.placement: rigid physical bounds extend beyond board "${board.id}"`,
        );
      }
      const occupied = footprintOccupiedHoles(layout.footprint, layout.placement, board);
      const unavailable = occupied.filter((hole) => !isBoardHoleAvailable(board, hole));
      if (unavailable.length > 0) {
        const first = unavailable[0];
        throw new CanonicalProjectValidationError(
          `${label}.placement: hole {row: ${first.row}, col: ${first.col}} is not available on board "${board.id}"`,
        );
      }
      layout.boardId = layout.placement.boardId;
      layout.position = placementNodePosition(board, layout.placement, layout.footprint);
      const footprintHoles = new Map(pinResolution.pins.map((pin) => [pin.pinId, pin.hole]));
      layout.pinHoles = component.pins.flatMap((pin) => {
        const hole = footprintHoles.get(pin.id);
        return hole ? [{ pinId: pin.id, hole: { ...hole } }] : [];
      });
      physicalClaims.push(
        ...occupied.map((hole) => ({ boardId: board.id, ownerId: layout.componentId, hole })),
      );
    }
    const seenPins = new Set();
    for (const placement of layout.pinHoles ?? []) {
      if (seenPins.has(placement.pinId)) {
        throw new CanonicalProjectValidationError(
          `${label}.pinHoles: duplicate pin "${placement.pinId}"`,
        );
      }
      seenPins.add(placement.pinId);
      if (!component.pins.some((pin) => pin.id === placement.pinId)) {
        throw new CanonicalProjectValidationError(`${label}.pinHoles: no pin "${placement.pinId}"`);
      }
      validateV2Hole(placement.hole, layout.boardId, boardsById, `${label}.pinHoles`);
      if (!layout.placement && layout.boardId) {
        physicalClaims.push({
          boardId: layout.boardId,
          ownerId: `${layout.componentId}:${placement.pinId}`,
          hole: placement.hole,
        });
      }
    }
  }

  const collisions = findHoleCollisions(physicalClaims);
  if (collisions.length > 0) {
    const first = collisions[0][0];
    throw new CanonicalProjectValidationError(
      `project.layout.components: board "${first.boardId}" hole ` +
        `{row: ${first.hole.row}, col: ${first.hole.col}} is occupied by ` +
        collisions[0].map((claim) => claim.ownerId).join(', '),
    );
  }

  const seenJunctions = new Set();
  const tapsByJunction = new Map();
  const boardPortsByJunction = new Map();
  for (const layout of project.layout.junctions) {
    const label = `project.layout.junctions "${layout.junctionId}"`;
    if (seenJunctions.has(layout.junctionId)) {
      throw new CanonicalProjectValidationError(`${label}: duplicate layout entry`);
    }
    seenJunctions.add(layout.junctionId);
    if (!junctionsById.has(layout.junctionId)) {
      throw new CanonicalProjectValidationError(`${label}: no such junction in project.electrical`);
    }
    if (layout.boardId !== undefined && !boardsById.has(layout.boardId)) {
      throw new CanonicalProjectValidationError(
        `${label}: boardId "${layout.boardId}" does not match any board in the project`,
      );
    }
    if (layout.hole) validateV2Hole(layout.hole, layout.boardId, boardsById, label);
    if (layout.boardPort !== undefined) {
      if (!layout.boardId) {
        throw new CanonicalProjectValidationError(`${label}.boardPort: requires boardId`);
      }
      const board = boardsById.get(layout.boardId);
      if (!board) {
        throw new CanonicalProjectValidationError(
          `${label}.boardPort: unknown board "${layout.boardId}"`,
        );
      }
      const hole = parseHolePortId(layout.boardPort);
      const traceId = parseTracePortId(layout.boardPort);
      if (!hole && !traceId) {
        throw new CanonicalProjectValidationError(`${label}.boardPort: invalid board port id`);
      }
      const trace = traceId
        ? board.traces?.find((candidate) => candidate.id === traceId)
        : undefined;
      if (traceId && !trace) {
        throw new CanonicalProjectValidationError(`${label}.boardPort: unknown trace "${traceId}"`);
      }
      if (hole && !isBoardHoleAvailable(board, hole)) {
        throw new CanonicalProjectValidationError(`${label}.boardPort: unavailable hole`);
      }
      if (hole && traceForHole(board, hole)) {
        throw new CanonicalProjectValidationError(
          `${label}.boardPort: a hole on a trace must use that trace port`,
        );
      }
      const holes = trace ? traceHoles(trace) : hole ? [hole] : [];
      if (holes.length === 0) {
        throw new CanonicalProjectValidationError(`${label}.boardPort: port has no physical hole`);
      }
      const expectedId = boardCopperJunctionId(layout.boardId, layout.boardPort);
      if (layout.junctionId !== expectedId) {
        throw new CanonicalProjectValidationError(
          `${label}: expected deterministic junction id "${expectedId}"`,
        );
      }
      const anchor = holes[0];
      const anchorPoint = holeLocalPoint(board, anchor);
      layout.hole = { ...anchor };
      layout.taps = holes.length;
      layout.position = {
        x: board.position.x + anchorPoint.x,
        y: board.position.y + anchorPoint.y,
      };
      boardPortsByJunction.set(layout.junctionId, {
        boardId: layout.boardId,
        portId: layout.boardPort,
        holes,
        netLabel: trace?.net,
        internal: trace?.internal === true,
      });
    }
    tapsByJunction.set(layout.junctionId, layout.taps);
  }

  validateV2CopperNetLabels(project, boardPortsByJunction);

  const seenConductors = new Set();
  for (const layout of project.layout.conductors) {
    const label = `project.layout.conductors "${layout.conductorId}"`;
    if (seenConductors.has(layout.conductorId)) {
      throw new CanonicalProjectValidationError(`${label}: duplicate layout entry`);
    }
    seenConductors.add(layout.conductorId);
    if (!conductorIds.has(layout.conductorId)) {
      throw new CanonicalProjectValidationError(
        `${label}: no such conductor in project.electrical`,
      );
    }
    const conductor = conductorsById.get(layout.conductorId);
    validateV2Tap(layout.fromTap, conductor?.from, tapsByJunction, `${label}.fromTap`);
    validateV2Tap(layout.toTap, conductor?.to, tapsByJunction, `${label}.toTap`);
    if (layout.physicalBinding) {
      if (!conductor) {
        throw new CanonicalProjectValidationError(`${label}: missing conductor`);
      }
      validateV2PhysicalBinding(
        layout,
        conductor,
        project.layout.components,
        boardsById,
        boardPortsByJunction,
        label,
      );
    }
    if (layout.boardJumper) {
      if (!conductor) {
        throw new CanonicalProjectValidationError(`${label}: missing conductor`);
      }
      validateV2BoardJumper(layout, conductor, boardsById, boardPortsByJunction, label);
    }
  }
  validateV2InternalCopperTaps(project, boardPortsByJunction);
  validateV2PhysicalBindingCoverage(project);
}

function validateV2BoardJumper(layout, conductor, boardsById, boardPortsByJunction, label) {
  const boardId = layout.boardJumper?.boardId;
  const board = boardId ? boardsById.get(boardId) : undefined;
  if (!board) {
    throw new CanonicalProjectValidationError(
      `${label}.boardJumper.boardId: no board "${boardId ?? ''}"`,
    );
  }
  if (board.surface !== 'breadboard') {
    throw new CanonicalProjectValidationError(
      `${label}.boardJumper.boardId: board "${board.id}" is not a breadboard`,
    );
  }
  if (layout.physicalBinding) {
    throw new CanonicalProjectValidationError(
      `${label}: a board jumper cannot be a physical binding`,
    );
  }
  if (layout.routingMode !== undefined || layout.points !== undefined) {
    throw new CanonicalProjectValidationError(
      `${label}: boardJumper derives endpoints and cannot contain routingMode or points`,
    );
  }
  if (layout.visualPlane <= board.visualPlane) {
    throw new CanonicalProjectValidationError(
      `${label}.visualPlane: a board jumper must be strictly above its board`,
    );
  }

  boardJumperEndpointHole(
    conductor.from,
    layout.fromTap,
    board,
    boardPortsByJunction,
    `${label}.from`,
  );
  boardJumperEndpointHole(conductor.to, layout.toTap, board, boardPortsByJunction, `${label}.to`);
}

function boardJumperEndpointHole(endpoint, tap, board, boardPortsByJunction, label) {
  if (endpoint.kind !== 'junction') {
    throw new CanonicalProjectValidationError(
      `${label}: a board jumper endpoint must be a board hole`,
    );
  }
  const resolved = boardPortsByJunction.get(endpoint.junctionId);
  if (!resolved || resolved.boardId !== board.id) {
    throw new CanonicalProjectValidationError(`${label}: endpoint is not on board "${board.id}"`);
  }
  if (resolved.holes.length > 1 && tap === undefined) {
    throw new CanonicalProjectValidationError(
      `${label}: endpoint must identify one hole with a tap index`,
    );
  }
  const hole = resolved.holes[tap ?? 0];
  if (!hole) {
    throw new CanonicalProjectValidationError(`${label}: endpoint hole cannot be resolved`);
  }
  return hole;
}

/**
 * Copper sealed inside a board body has no pad to land on: the board renderer
 * mints a `trace:<id>` port only for exposed copper, so a conductor that lands
 * on an internal group - a breadboard column clip or one of its buses - must
 * say which of the group's holes it lands on. Without the tap, reopening the
 * project would rebuild the edge pointing at a port that is never rendered.
 *
 * Physical bindings already pin the exact tap; this covers every ordinary
 * conductor, including one whose layout entry is missing entirely.
 */
function validateV2InternalCopperTaps(project, boardPortsByJunction) {
  const layoutsByConductor = new Map(
    project.layout.conductors.map((layout) => [layout.conductorId, layout]),
  );
  for (const net of project.electrical.nets) {
    for (const conductor of net.conductors) {
      const layout = layoutsByConductor.get(conductor.id);
      const label = `project.layout.conductors "${conductor.id}"`;
      requireV2InternalCopperTap(
        conductor.from,
        layout?.fromTap,
        boardPortsByJunction,
        `${label}.fromTap`,
      );
      requireV2InternalCopperTap(
        conductor.to,
        layout?.toTap,
        boardPortsByJunction,
        `${label}.toTap`,
      );
    }
  }
}

function requireV2InternalCopperTap(endpoint, tap, boardPortsByJunction, label) {
  if (endpoint.kind !== 'junction') return;
  if (!boardPortsByJunction.get(endpoint.junctionId)?.internal) return;
  if (tap !== undefined) return;
  throw new CanonicalProjectValidationError(
    `${label}: copper inside the board body has no landing pad, so this end must name the ` +
      `hole it lands on with a tap index`,
  );
}

function validateV2CopperNetLabels(project, boardPortsByJunction) {
  for (const net of project.electrical.nets) {
    const labels = [
      ...new Set(
        net.endpoints
          .filter((endpoint) => endpoint.kind === 'junction')
          .map((endpoint) => boardPortsByJunction.get(endpoint.junctionId)?.netLabel)
          .filter(Boolean),
      ),
    ].sort();
    if (labels.length > 1) {
      throw new CanonicalProjectValidationError(
        `project.electrical.nets "${net.id}": physically joins incompatible copper labels ` +
          labels.join(', '),
      );
    }
  }
}

function validateV2Board(board) {
  const label = `project.layout.boards "${board.id}"`;
  if (board.holeDiameter !== undefined && board.holeDiameter > board.pitch) {
    throw new CanonicalProjectValidationError(`${label}.holeDiameter: cannot exceed board pitch`);
  }
  validateBoardSurface(board, label);
  if (board.rowLabels !== undefined && board.rowLabels.length !== board.rows) {
    throw new CanonicalProjectValidationError(
      `${label}.rowLabels: ${board.rowLabels.length} entries for ${board.rows} rows`,
    );
  }
  if (board.holes === undefined && board.rows * board.cols > OPERATIONAL_LIMITS.maxBoardHoles) {
    throw new CanonicalProjectValidationError(
      `${label}: implicit hole count ${board.rows * board.cols} exceeds operational limit of ` +
        `${OPERATIONAL_LIMITS.maxBoardHoles}; use an explicit sparse holes list`,
    );
  }
  const holeKeys = new Set();
  for (const hole of board.holes ?? []) {
    const key = holeKey(hole);
    if (holeKeys.has(key)) {
      throw new CanonicalProjectValidationError(`${label}.holes: duplicate "${key}"`);
    }
    holeKeys.add(key);
    if (!isHoleInBounds(board, hole)) {
      throw new CanonicalProjectValidationError(
        `${label}.holes: "${key}" is outside the board grid`,
      );
    }
  }

  const traceIds = new Set();
  const tracesAtHole = new Map();
  for (const trace of board.traces ?? []) {
    if (traceIds.has(trace.id)) {
      throw new CanonicalProjectValidationError(`${label}.traces: duplicate id "${trace.id}"`);
    }
    traceIds.add(trace.id);
    if (trace.segments.length === 0) {
      throw new CanonicalProjectValidationError(
        `${label}.traces "${trace.id}": requires a segment`,
      );
    }
    trace.segments.forEach((segment, segmentIndex) => {
      if (segment.from.row !== segment.to.row && segment.from.col !== segment.to.col) {
        throw new CanonicalProjectValidationError(
          `${label}.traces "${trace.id}" segment ${segmentIndex}: diagonal`,
        );
      }
      for (const endpoint of [segment.from, segment.to]) {
        if (!isBoardHoleAvailable(board, endpoint)) {
          throw new CanonicalProjectValidationError(
            `${label}.traces "${trace.id}" segment ${segmentIndex}: unavailable hole ` +
              `{row: ${endpoint.row}, col: ${endpoint.col}}`,
          );
        }
      }
    });
    const holes = traceHoles(trace);
    if (holes.length > OPERATIONAL_LIMITS.maxJunctionTaps) {
      throw new CanonicalProjectValidationError(
        `${label}.traces "${trace.id}": ${holes.length} holes exceed junction tap limit ` +
          `${OPERATIONAL_LIMITS.maxJunctionTaps}`,
      );
    }
    for (const hole of holes) {
      if (!isBoardHoleAvailable(board, hole)) {
        throw new CanonicalProjectValidationError(
          `${label}.traces "${trace.id}": trace crosses an unavailable hole "${holeKey(hole)}"`,
        );
      }
      const key = holeKey(hole);
      const previous = tracesAtHole.get(key);
      if (previous && previous !== trace.id) {
        throw new CanonicalProjectValidationError(
          `${label}.traces: ${previous}, ${trace.id} overlap at ` +
            `{row: ${hole.row}, col: ${hole.col}}`,
        );
      }
      tracesAtHole.set(key, trace.id);
    }
  }
}

function validateV2Footprint(footprint, label) {
  if (footprint.axialSpan !== undefined && !isCoherentAxialFootprint(footprint)) {
    throw new CanonicalProjectValidationError(
      `${label}.axialSpan: expected an integer from 4 to 10 with pins at both endpoints`,
    );
  }
  const pinIds = new Set();
  const pinCells = new Set();
  const pinPoints = new Map();
  const rigid = isRigidFootprint(footprint);
  for (const pin of footprint.pins) {
    if (pinIds.has(pin.id)) {
      throw new CanonicalProjectValidationError(`${label}.pins: duplicate id "${pin.id}"`);
    }
    pinIds.add(pin.id);
    validateV2FootprintCell(pin.cell, footprint, `${label}.pins "${pin.id}".cell`);
    if (
      pin.artworkPoint !== undefined &&
      (!Number.isFinite(pin.artworkPoint.x) || !Number.isFinite(pin.artworkPoint.y))
    ) {
      throw new CanonicalProjectValidationError(
        `${label}.pins "${pin.id}".artworkPoint: expected finite coordinates`,
      );
    }
    const cellKey = holeKey(pin.cell);
    if (pinCells.has(cellKey)) {
      throw new CanonicalProjectValidationError(`${label}.pins: two pins occupy cell "${cellKey}"`);
    }
    pinCells.add(cellKey);
    if (rigid) {
      const point = footprintPinPoint(pin);
      const pointKey = `${point.x}:${point.y}`;
      const otherPinId = pinPoints.get(pointKey);
      if (otherPinId) {
        throw new CanonicalProjectValidationError(
          `${label}.pins: pins "${otherPinId}" and "${pin.id}" share physical marker "${pointKey}"`,
        );
      }
      pinPoints.set(pointKey, pin.id);
    }
  }
  const bodyCells = new Set();
  for (const cell of footprint.bodyCells ?? []) {
    validateV2FootprintCell(cell, footprint, `${label}.bodyCells`);
    const key = holeKey(cell);
    if (bodyCells.has(key)) {
      throw new CanonicalProjectValidationError(`${label}.bodyCells: duplicate cell "${key}"`);
    }
    bodyCells.add(key);
  }
}

function isCoherentAxialFootprint(footprint) {
  const span = footprint.axialSpan;
  if (
    !Number.isSafeInteger(span) ||
    span < 4 ||
    span > 10 ||
    footprint.rows !== 1 ||
    footprint.cols !== span + 1 ||
    footprint.pins.length !== 2
  ) {
    return false;
  }
  const endpoints = new Set(footprint.pins.map((pin) => `${pin.cell.row}:${pin.cell.col}`));
  return endpoints.size === 2 && endpoints.has('0:0') && endpoints.has(`0:${span}`);
}

function validateV2FootprintCell(cell, footprint, label) {
  if (cell.row >= footprint.rows || cell.col >= footprint.cols) {
    throw new CanonicalProjectValidationError(
      `${label}: {row: ${cell.row}, col: ${cell.col}} is outside ` +
        `${footprint.rows} x ${footprint.cols}`,
    );
  }
}

function validateV2PhysicalBinding(
  layout,
  conductor,
  componentLayouts,
  boardsById,
  boardPortsByJunction,
  label,
) {
  if (
    layout.routingMode !== undefined ||
    layout.points !== undefined ||
    layout.boardJumper !== undefined
  ) {
    throw new CanonicalProjectValidationError(
      `${label}: a physical binding cannot have a visible route`,
    );
  }
  const pin =
    conductor.from.kind === 'pin'
      ? conductor.from
      : conductor.to.kind === 'pin'
        ? conductor.to
        : null;
  const junction =
    conductor.from.kind === 'junction'
      ? conductor.from
      : conductor.to.kind === 'junction'
        ? conductor.to
        : null;
  if (!pin || !junction) {
    throw new CanonicalProjectValidationError(
      `${label}: a physical binding must join one pin to one junction`,
    );
  }
  const expectedId = physicalBindingConductorId(pin.componentId, pin.pinId);
  if (conductor.id !== expectedId) {
    throw new CanonicalProjectValidationError(
      `${label}: expected deterministic id "${expectedId}"`,
    );
  }
  const componentLayout = componentLayouts.find(
    (candidate) => candidate.componentId === pin.componentId,
  );
  if (!componentLayout) {
    throw new CanonicalProjectValidationError(`${label}: pin component has no layout`);
  }
  const physicalBoardId = componentLayout.placement?.boardId ?? componentLayout.boardId;
  const board = physicalBoardId ? boardsById.get(physicalBoardId) : undefined;
  const pinHole =
    componentLayout.placement && componentLayout.footprint
      ? footprintPinHoles(componentLayout.footprint, componentLayout.placement, board).find(
          (candidate) => candidate.pinId === pin.pinId,
        )?.hole
      : componentLayout.pinHoles?.find((candidate) => candidate.pinId === pin.pinId)?.hole;
  if (!pinHole || !board) {
    throw new CanonicalProjectValidationError(`${label}: cannot resolve the pin's board hole`);
  }
  const trace = traceForHole(board, pinHole);
  const expectedPort = trace ? `trace:${trace.id}` : `hole:${pinHole.row}:${pinHole.col}`;
  const expectedJunctionId = boardCopperJunctionId(board.id, expectedPort);
  if (junction.junctionId !== expectedJunctionId) {
    throw new CanonicalProjectValidationError(
      `${label}: pin resolves to junction "${expectedJunctionId}", not "${junction.junctionId}"`,
    );
  }
  const boardPort = boardPortsByJunction.get(junction.junctionId);
  if (!boardPort || boardPort.portId !== expectedPort) {
    throw new CanonicalProjectValidationError(
      `${label}: junction has no matching boardPort layout`,
    );
  }
  const expectedTap = trace
    ? traceHoles(trace).findIndex((hole) => hole.row === pinHole.row && hole.col === pinHole.col)
    : undefined;
  const actualTap = conductor.from.kind === 'junction' ? layout.fromTap : layout.toTap;
  if (actualTap !== expectedTap) {
    throw new CanonicalProjectValidationError(
      `${label}: expected copper tap ${String(expectedTap)}, got ${String(actualTap)}`,
    );
  }
}

function validateV2PhysicalBindingCoverage(project) {
  const bound = new Set(
    project.layout.conductors
      .filter((layout) => layout.physicalBinding)
      .map((layout) => layout.conductorId),
  );
  const componentsById = new Map(
    project.electrical.components.map((component) => [component.id, component]),
  );
  for (const layout of project.layout.components) {
    if (!layout.placement || !layout.footprint) continue;
    const component = componentsById.get(layout.componentId);
    if (!component) continue;
    for (const pin of component.pins) {
      const id = physicalBindingConductorId(component.id, pin.id);
      if (!bound.has(id)) {
        throw new CanonicalProjectValidationError(
          `project.layout.components "${component.id}": missing physical binding "${id}"`,
        );
      }
    }
  }
}

function holeKey(hole) {
  return `${hole.row}:${hole.col}`;
}

function holesEqual(a, b) {
  return a.row === b.row && a.col === b.col;
}

function isBoardHoleAvailable(board, hole) {
  return (
    isHoleInBounds(board, hole) &&
    (board.holes === undefined || board.holes.some((candidate) => holesEqual(candidate, hole)))
  );
}

function traceSegmentHoles(segment) {
  const holes = [];
  if (segment.from.row === segment.to.row) {
    const start = Math.min(segment.from.col, segment.to.col);
    const end = Math.max(segment.from.col, segment.to.col);
    for (let col = start; col <= end; col++) holes.push({ row: segment.from.row, col });
  } else if (segment.from.col === segment.to.col) {
    const start = Math.min(segment.from.row, segment.to.row);
    const end = Math.max(segment.from.row, segment.to.row);
    for (let row = start; row <= end; row++) holes.push({ row, col: segment.from.col });
  }
  return holes;
}

function traceHoles(trace) {
  const byKey = new Map();
  for (const segment of trace.segments) {
    for (const hole of traceSegmentHoles(segment)) byKey.set(holeKey(hole), hole);
  }
  return [...byKey.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}

function traceForHole(board, hole) {
  return board.traces?.find((trace) =>
    traceHoles(trace).some((candidate) => holesEqual(candidate, hole)),
  );
}

function rotateCell(cell, rotation, footprint) {
  switch (rotation) {
    case 0:
      return { ...cell };
    case 90:
      return { row: cell.col, col: footprint.rows - 1 - cell.row };
    case 180:
      return { row: footprint.rows - 1 - cell.row, col: footprint.cols - 1 - cell.col };
    case 270:
      return { row: footprint.cols - 1 - cell.col, col: cell.row };
    default:
      throw new CanonicalProjectValidationError(`invalid board rotation ${rotation}`);
  }
}

function cellToHole(cell, footprint, placement) {
  const rotated = rotateCell(cell, placement.rotation, footprint);
  return { row: placement.anchor.row + rotated.row, col: placement.anchor.col + rotated.col };
}

function isRigidFootprint(footprint) {
  return (
    footprint.physicalBounds !== undefined ||
    footprint.pins.some((pin) => pin.artworkPoint !== undefined)
  );
}

function footprintPinPoint(pin) {
  return pin.artworkPoint ?? { x: pin.cell.col, y: pin.cell.row };
}

function exactHoleAtPoint(board, point) {
  const col = Math.round((point.x - BOARD_MARGIN) / board.pitch);
  const tolerance = Math.max(1, board.pitch) * 1e-6;
  for (let row = 0; row < board.rows; row++) {
    const candidate = { row, col };
    if (!isBoardHoleAvailable(board, candidate)) continue;
    const actual = holeLocalPoint(board, candidate);
    if (Math.abs(actual.x - point.x) <= tolerance && Math.abs(actual.y - point.y) <= tolerance) {
      return candidate;
    }
  }
  return null;
}

function rigidPointOnBoard(board, footprint, placement, point) {
  const anchor = holeLocalPoint(board, placement.anchor);
  const rotated = rotateFootprintPoint(point.x, point.y, footprint, placement.rotation);
  return {
    x: anchor.x + rotated.x * board.pitch,
    y: anchor.y + rotated.y * board.pitch,
  };
}

function resolveFootprintPinHoles(footprint, placement, board) {
  if (!isRigidFootprint(footprint)) {
    return { pins: legacyFootprintPinHoles(footprint, placement), missingPinIds: [] };
  }
  const pins = [];
  const missingPinIds = [];
  for (const pin of footprint.pins) {
    const marker = footprintPinPoint(pin);
    const hole = exactHoleAtPoint(board, rigidPointOnBoard(board, footprint, placement, marker));
    if (!hole) {
      missingPinIds.push(pin.id);
      continue;
    }
    const rotated = rotateFootprintPoint(marker.x, marker.y, footprint, placement.rotation);
    pins.push({
      pinId: pin.id,
      label: pin.label,
      cell: { row: rotated.y, col: rotated.x },
      hole,
    });
  }
  return { pins, missingPinIds };
}

/** Keep this tolerance-aware board-hole dedupe in parity with the client parser. */
function duplicateResolvedMarkerHole(pins) {
  const firstPinByHole = new Map();
  for (const pin of pins) {
    const key = holeKey(pin.hole);
    const firstPinId = firstPinByHole.get(key);
    if (firstPinId !== undefined) {
      return { firstPinId, secondPinId: pin.pinId, hole: pin.hole };
    }
    firstPinByHole.set(key, pin.pinId);
  }
  return null;
}

function legacyFootprintPinHoles(footprint, placement) {
  return footprint.pins.map((pin) => {
    const cell = rotateCell(pin.cell, placement.rotation, footprint);
    return {
      pinId: pin.id,
      label: pin.label,
      cell,
      hole: { row: placement.anchor.row + cell.row, col: placement.anchor.col + cell.col },
    };
  });
}

function footprintPinHoles(footprint, placement, board) {
  return board
    ? resolveFootprintPinHoles(footprint, placement, board).pins
    : legacyFootprintPinHoles(footprint, placement);
}

function footprintOccupiedHoles(footprint, placement, board) {
  const bodyCells =
    footprint.bodyCells ??
    Array.from({ length: footprint.rows }, (_, row) =>
      Array.from({ length: footprint.cols }, (_, col) => ({ row, col })),
    ).flat();
  const byKey = new Map();
  if (board && isRigidFootprint(footprint)) {
    const include = (hole) => {
      if (hole) byKey.set(holeKey(hole), hole);
    };
    for (const cell of bodyCells) {
      include(
        exactHoleAtPoint(
          board,
          rigidPointOnBoard(board, footprint, placement, { x: cell.col, y: cell.row }),
        ),
      );
    }
    for (const pin of resolveFootprintPinHoles(footprint, placement, board).pins) {
      include(pin.hole);
    }
    const bounds = footprint.physicalBounds ?? footprint.artwork;
    if (bounds) {
      const points = footprintArtworkPoints(footprint, bounds, placement.rotation, null);
      const minX = Math.min(...points.map((point) => point.x)) - 1e-6;
      const maxX = Math.max(...points.map((point) => point.x)) + 1e-6;
      const minY = Math.min(...points.map((point) => point.y)) - 1e-6;
      const maxY = Math.max(...points.map((point) => point.y)) + 1e-6;
      const anchor = holeLocalPoint(board, placement.anchor);
      const available =
        board.holes ??
        Array.from({ length: board.rows }, (_, row) =>
          Array.from({ length: board.cols }, (_, col) => ({ row, col })),
        ).flat();
      for (const hole of available) {
        const point = holeLocalPoint(board, hole);
        const x = (point.x - anchor.x) / board.pitch;
        const y = (point.y - anchor.y) / board.pitch;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) include(hole);
      }
    }
    return [...byKey.values()];
  }
  for (const cell of [...bodyCells, ...footprint.pins.map((pin) => pin.cell)]) {
    const hole = cellToHole(cell, footprint, placement);
    byKey.set(holeKey(hole), hole);
  }
  return [...byKey.values()];
}

function rigidArtworkFitsBoard(board, footprint, placement) {
  if (!isRigidFootprint(footprint)) return true;
  const bounds = footprint.physicalBounds ?? footprint.artwork;
  if (!bounds) return true;
  const anchor = holeLocalPoint(board, placement.anchor);
  const points = footprintArtworkPoints(footprint, bounds, placement.rotation, null);
  const maxX = (board.cols - 1) * board.pitch + BOARD_MARGIN * 2;
  const maxY = (board.rows - 1) * board.pitch + (board.centerGap ?? 0) + BOARD_MARGIN * 2;
  const tolerance = board.pitch * 1e-6;
  return points.every((point) => {
    const x = anchor.x + point.x * board.pitch;
    const y = anchor.y + point.y * board.pitch;
    return x >= -tolerance && x <= maxX + tolerance && y >= -tolerance && y <= maxY + tolerance;
  });
}

function placementNodePosition(board, placement, footprint) {
  const anchor = holeLocalPoint(board, placement.anchor);
  const channel = footprintChannel(board, footprint, placement);
  const extent = footprintDrawnExtent(footprint, placement.rotation, channel);
  return {
    x: board.position.x + anchor.x + extent.left * board.pitch,
    y: board.position.y + anchor.y + extent.top * board.pitch,
  };
}

function rotatedFootprintBox(footprint, rotation) {
  return rotation === 90 || rotation === 270
    ? { rows: footprint.cols, cols: footprint.rows }
    : { rows: footprint.rows, cols: footprint.cols };
}

function rotateFootprintPoint(x, y, footprint, rotation) {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: footprint.rows - 1 - y, y: x };
    case 180:
      return { x: footprint.cols - 1 - x, y: footprint.rows - 1 - y };
    case 270:
      return { x: y, y: footprint.cols - 1 - x };
    default:
      throw new CanonicalProjectValidationError(`invalid board rotation ${rotation}`);
  }
}

function footprintChannel(board, footprint, placement) {
  if (isRigidFootprint(footprint)) return null;
  const gap = board.centerGap ?? 0;
  if (gap <= 0 || board.rows < 2 || board.pitch <= 0) return null;
  const split = Math.ceil(board.rows / 2);
  const box = rotatedFootprintBox(footprint, placement.rotation);
  const firstRow = placement.anchor.row;
  const lastRow = firstRow + box.rows - 1;
  if (firstRow >= split || lastRow < split) return null;
  return { cutY: split - firstRow - 0.5, gapCells: gap / board.pitch };
}

function applyFootprintChannel(y, channel) {
  return channel && y > channel.cutY ? y + channel.gapCells : y;
}

function footprintDrawPoint(x, y, footprint, rotation, channel) {
  const rotated = rotateFootprintPoint(x, y, footprint, rotation);
  return { x: rotated.x, y: applyFootprintChannel(rotated.y, channel) };
}

function footprintArtworkPoints(footprint, artwork, rotation, channel) {
  const center = rotateFootprintPoint(
    artwork.x + artwork.width / 2,
    artwork.y + artwork.height / 2,
    footprint,
    rotation,
  );
  const shift = channel && center.y > channel.cutY ? channel.gapCells : 0;
  const at = (x, y) => {
    const point = rotateFootprintPoint(x, y, footprint, rotation);
    return { x: point.x, y: point.y + shift };
  };
  return [
    at(artwork.x, artwork.y),
    at(artwork.x + artwork.width, artwork.y),
    at(artwork.x, artwork.y + artwork.height),
    at(artwork.x + artwork.width, artwork.y + artwork.height),
  ];
}

function footprintDrawnExtent(footprint, rotation, channel) {
  const box = rotatedFootprintBox(footprint, rotation);
  const extent = {
    top: -FOOTPRINT_PADDING_CELLS,
    bottom: applyFootprintChannel(box.rows - 1 + FOOTPRINT_PADDING_CELLS, channel),
    left: -FOOTPRINT_PADDING_CELLS,
    right: box.cols - 1 + FOOTPRINT_PADDING_CELLS,
  };
  const includePoints = (points, margin = 0) => {
    extent.top = Math.min(extent.top, ...points.map((point) => point.y - margin));
    extent.bottom = Math.max(extent.bottom, ...points.map((point) => point.y + margin));
    extent.left = Math.min(extent.left, ...points.map((point) => point.x - margin));
    extent.right = Math.max(extent.right, ...points.map((point) => point.x + margin));
  };
  for (const shape of footprint.shapes ?? []) {
    if (shape.kind === 'rect') {
      includePoints([
        footprintDrawPoint(shape.x, shape.y, footprint, rotation, channel),
        footprintDrawPoint(shape.x + shape.width, shape.y, footprint, rotation, channel),
        footprintDrawPoint(
          shape.x + shape.width,
          shape.y + shape.height,
          footprint,
          rotation,
          channel,
        ),
        footprintDrawPoint(shape.x, shape.y + shape.height, footprint, rotation, channel),
      ]);
    } else if (shape.kind === 'circle') {
      includePoints(
        [footprintDrawPoint(shape.cx, shape.cy, footprint, rotation, channel)],
        shape.r,
      );
    } else if (shape.kind === 'line') {
      includePoints(
        [
          footprintDrawPoint(shape.x1, shape.y1, footprint, rotation, channel),
          footprintDrawPoint(shape.x2, shape.y2, footprint, rotation, channel),
        ],
        (shape.width ?? 0.08) / 2,
      );
    } else {
      const size = shape.size ?? 0.42;
      const width = Math.max(size * 0.5, shape.text.length * size * 0.6);
      const left =
        shape.anchor === 'end'
          ? shape.x - width
          : shape.anchor === 'middle'
            ? shape.x - width / 2
            : shape.x;
      const rotatedAnchor = rotateFootprintPoint(shape.x, shape.y, footprint, rotation);
      const mappedAnchor = footprintDrawPoint(shape.x, shape.y, footprint, rotation, channel);
      const shiftY = mappedAnchor.y - rotatedAnchor.y;
      includePoints(
        [
          { x: left, y: shape.y - size / 2 },
          { x: left + width, y: shape.y - size / 2 },
          { x: left + width, y: shape.y + size / 2 },
          { x: left, y: shape.y + size / 2 },
        ].map((corner) => {
          const point = rotateFootprintPoint(corner.x, corner.y, footprint, rotation);
          return { x: point.x, y: point.y + shiftY };
        }),
      );
    }
  }
  for (const bounds of [footprint.physicalBounds, footprint.artwork]) {
    if (bounds) {
      includePoints(footprintArtworkPoints(footprint, bounds, rotation, channel));
    }
  }
  return extent;
}

function holeLocalPoint(board, hole) {
  const lowerHalfStart = Math.ceil(board.rows / 2);
  const gapOffset = hole.row >= lowerHalfStart ? (board.centerGap ?? 0) : 0;
  return {
    x: BOARD_MARGIN + hole.col * board.pitch,
    y: BOARD_MARGIN + hole.row * board.pitch + gapOffset,
  };
}

function findHoleCollisions(claims) {
  const grouped = new Map();
  for (const claim of claims) {
    const key = `${claim.boardId}:${holeKey(claim.hole)}`;
    const group = grouped.get(key) ?? [];
    group.push(claim);
    grouped.set(key, group);
  }
  return [...grouped.values()].filter(
    (group) => new Set(group.map((claim) => claim.ownerId)).size > 1,
  );
}

function parseHolePortId(portId) {
  const match = /^hole:(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(portId);
  if (!match) return null;
  const row = Number(match[1]);
  const col = Number(match[2]);
  return Number.isSafeInteger(row) && Number.isSafeInteger(col) ? { row, col } : null;
}

function parseTracePortId(portId) {
  return portId.startsWith('trace:') && portId.length > 6 ? portId.slice(6) : null;
}

function boardCopperJunctionId(boardId, portId) {
  return `copper:${encodeURIComponent(boardId)}/${encodeURIComponent(portId)}`;
}

function physicalBindingConductorId(componentId, pinId) {
  return `binding:${encodeURIComponent(componentId)}/${encodeURIComponent(pinId)}`;
}

function resolveV2Endpoint(endpoint, componentsById, junctionsById, label) {
  if (endpoint.kind === 'junction') {
    if (!junctionsById.has(endpoint.junctionId)) {
      throw new CanonicalProjectValidationError(`${label}: no junction "${endpoint.junctionId}"`);
    }
    return;
  }
  const component = componentsById.get(endpoint.componentId);
  if (!component) {
    throw new CanonicalProjectValidationError(`${label}: no component "${endpoint.componentId}"`);
  }
  if (!component.pins.some((pin) => pin.id === endpoint.pinId)) {
    throw new CanonicalProjectValidationError(
      `${label}: component "${endpoint.componentId}" has no pin "${endpoint.pinId}"`,
    );
  }
}

function validateV2Hole(hole, boardId, boardsById, label) {
  if (boardId === undefined) {
    throw new CanonicalProjectValidationError(`${label}.hole: a hole was given but no boardId`);
  }
  const board = boardsById.get(boardId);
  if (!board || !isBoardHoleAvailable(board, hole)) {
    throw new CanonicalProjectValidationError(
      `${label}.hole: {row: ${hole.row}, col: ${hole.col}} does not fit board "${boardId}"`,
    );
  }
}

function validateV2Tap(tap, endpoint, tapsByJunction, label) {
  if (tap === undefined) return;
  if (!endpoint || endpoint.kind !== 'junction') {
    throw new CanonicalProjectValidationError(`${label}: this end is not a junction`);
  }
  const tapCount = tapsByJunction.get(endpoint.junctionId) ?? 1;
  if (tap >= tapCount) {
    throw new CanonicalProjectValidationError(
      `${label}: tap ${tap} is out of range for junction "${endpoint.junctionId}"`,
    );
  }
}

function v2EndpointKey(endpoint) {
  return endpoint.kind === 'pin'
    ? `pin:${encodeURIComponent(endpoint.componentId)}/${encodeURIComponent(endpoint.pinId)}`
    : `junction:${encodeURIComponent(endpoint.junctionId)}`;
}

function v2ConnectedGroupCount(conductors) {
  const parent = new Map();
  const find = (key) => {
    let root = key;
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root);
    if (!parent.has(root)) parent.set(root, root);
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };
  for (const conductor of conductors) {
    union(v2EndpointKey(conductor.from), v2EndpointKey(conductor.to));
  }
  return new Set(conductors.map((conductor) => find(v2EndpointKey(conductor.from)))).size;
}

function validateEndpoint(endpoint, componentsById, label) {
  const component = componentsById.get(endpoint.componentId);
  if (!component) {
    throw new CanonicalProjectValidationError(`${label}: no component "${endpoint.componentId}"`);
  }
  if (!component.pins.some((pin) => pin.id === endpoint.pinId)) {
    throw new CanonicalProjectValidationError(
      `${label}: component "${endpoint.componentId}" has no pin "${endpoint.pinId}"`,
    );
  }
}

function isHoleInBounds(board, hole) {
  return hole.row >= 0 && hole.row < board.rows && hole.col >= 0 && hole.col < board.cols;
}

function validateHoleBounds(hole, component, boardsById, label) {
  if (component.boardId === undefined) {
    throw new CanonicalProjectValidationError(`${label}.hole: component has a hole but no boardId`);
  }
  const board = boardsById.get(component.boardId);
  if (!board || !isHoleInBounds(board, hole)) {
    throw new CanonicalProjectValidationError(
      `${label}.hole: {row: ${hole.row}, col: ${hole.col}} does not fit board "${component.boardId}"`,
    );
  }
}

function parseBoard(raw, label, currentFormat = false, fallbackVisualPlane) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    notes: expectOptionalString(obj['notes'], `${label}.notes`),
    surface:
      obj['surface'] === undefined
        ? undefined
        : parseBoardSurface(obj['surface'], `${label}.surface`),
    rows: expectBoundedPositiveInteger(
      obj['rows'],
      `${label}.rows`,
      OPERATIONAL_LIMITS.maxBoardRows,
      'row count',
    ),
    cols: expectBoundedPositiveInteger(
      obj['cols'],
      `${label}.cols`,
      OPERATIONAL_LIMITS.maxBoardCols,
      'column count',
    ),
    pitch: expectBoundedPositiveFiniteNumber(
      obj['pitch'],
      `${label}.pitch`,
      OPERATIONAL_LIMITS.maxBoardPitch,
      'pitch',
    ),
    centerGap:
      obj['centerGap'] === undefined
        ? undefined
        : expectBoundedPositiveFiniteNumber(
            obj['centerGap'],
            `${label}.centerGap`,
            OPERATIONAL_LIMITS.maxBoardPitch,
            'central gap',
          ),
    rowLabels:
      obj['rowLabels'] === undefined
        ? undefined
        : expectArray(obj['rowLabels'], `${label}.rowLabels`).map((rowLabel, index) =>
            expectString(rowLabel, `${label}.rowLabels[${index}]`),
          ),
    holes:
      obj['holes'] === undefined
        ? undefined
        : expectArray(obj['holes'], `${label}.holes`).map((hole, index) =>
            expectHole(hole, `${label}.holes[${index}]`),
          ),
    holeDiameter:
      obj['holeDiameter'] === undefined
        ? undefined
        : expectBoundedPositiveFiniteNumber(
            obj['holeDiameter'],
            `${label}.holeDiameter`,
            OPERATIONAL_LIMITS.maxBoardPitch,
            'hole diameter',
          ),
    traces:
      obj['traces'] === undefined
        ? undefined
        : expectArray(obj['traces'], `${label}.traces`).map((trace, index) =>
            parseBoardTrace(trace, `${label}.traces[${index}]`),
          ),
    position: expectPoint(obj['position'], `${label}.position`),
    ...(currentFormat
      ? {
          visualPlane: parseVisualPlane(
            obj['visualPlane'],
            `${label}.visualPlane`,
            fallbackVisualPlane,
          ),
        }
      : {}),
  };
}

/**
 * A closed set, deliberately: an unknown surface is rejected rather than
 * quietly falling back to `perfboard`. Kept literally in step with
 * `BOARD_SURFACES` in diagram/model/interfaces.ts - the two validators are
 * parallel implementations of one format, so a value one accepts the other
 * must accept too.
 */
const BOARD_SURFACES = ['perfboard', 'breadboard'];

function parseBoardSurface(raw, label) {
  if (typeof raw !== 'string' || !BOARD_SURFACES.includes(raw)) {
    throw new CanonicalProjectValidationError(
      `${label}: expected one of ${BOARD_SURFACES.join(', ')}`,
    );
  }
  return raw;
}

/**
 * What a board must actually carry to be drawn as a solderless breadboard: the
 * renderer reads its plastic, its moulded channel and its printed rail bands
 * off `centerGap` and `rowLabels`, so a board that claims the surface without
 * them would reopen as a blank light rectangle.
 */
function validateBoardSurface(board, label) {
  if (board.surface !== 'breadboard') return;
  if (board.rowLabels === undefined) {
    throw new CanonicalProjectValidationError(
      `${label}.surface: a breadboard must print its rows via rowLabels`,
    );
  }
  if (board.centerGap === undefined) {
    throw new CanonicalProjectValidationError(
      `${label}.surface: a breadboard must declare its central channel via centerGap`,
    );
  }
  if (!board.rowLabels.some((rowLabel) => rowLabel.endsWith('+') || rowLabel.endsWith('-'))) {
    throw new CanonicalProjectValidationError(
      `${label}.surface: a breadboard must name at least one +/- power rail`,
    );
  }
}

function parseBoardTrace(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    net: expectOptionalString(obj['net'], `${label}.net`),
    internal: expectOptionalBoolean(obj['internal'], `${label}.internal`),
    segments: expectArray(obj['segments'], `${label}.segments`).map((segment, index) =>
      parseBoardTraceSegment(segment, `${label}.segments[${index}]`),
    ),
  };
}

function parseBoardTraceSegment(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    from: expectHole(obj['from'], `${label}.from`),
    to: expectHole(obj['to'], `${label}.to`),
  };
}

function parseDevicePlacement(raw, label) {
  const obj = expectRecord(raw, label);
  const rotation = parseBoardRotation(obj['rotation'], `${label}.rotation`);
  return {
    boardId: expectNonEmptyString(obj['boardId'], `${label}.boardId`),
    anchor: expectHole(obj['anchor'], `${label}.anchor`),
    rotation,
  };
}

function parseBoardRotation(raw, label) {
  const rotation = expectFiniteNumber(raw, label);
  if (!ALLOWED_BOARD_ROTATIONS.includes(rotation)) {
    throw new CanonicalProjectValidationError(`${label}: expected 0, 90, 180 or 270`);
  }
  return rotation;
}

function parseFootprint(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    rows: expectBoundedPositiveInteger(
      obj['rows'],
      `${label}.rows`,
      OPERATIONAL_LIMITS.maxFootprintRows,
      'row count',
    ),
    cols: expectBoundedPositiveInteger(
      obj['cols'],
      `${label}.cols`,
      OPERATIONAL_LIMITS.maxFootprintCols,
      'column count',
    ),
    axialSpan:
      obj['axialSpan'] === undefined
        ? undefined
        : expectPositiveInteger(obj['axialSpan'], `${label}.axialSpan`),
    pins: expectArray(obj['pins'], `${label}.pins`).map((pin, index) =>
      parseFootprintPin(pin, `${label}.pins[${index}]`),
    ),
    shapes: expectArray(obj['shapes'], `${label}.shapes`).map((shape, index) =>
      parseFootprintShape(shape, `${label}.shapes[${index}]`),
    ),
    artwork:
      obj['artwork'] === undefined
        ? undefined
        : parseFootprintArtwork(obj['artwork'], `${label}.artwork`),
    physicalBounds:
      obj['physicalBounds'] === undefined
        ? undefined
        : parseFootprintPhysicalBounds(obj['physicalBounds'], `${label}.physicalBounds`),
    bodyCells:
      obj['bodyCells'] === undefined
        ? undefined
        : expectArray(obj['bodyCells'], `${label}.bodyCells`).map((cell, index) =>
            expectHole(cell, `${label}.bodyCells[${index}]`),
          ),
  };
}

function parseFootprintPhysicalBounds(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    x: expectFiniteNumber(obj['x'], `${label}.x`),
    y: expectFiniteNumber(obj['y'], `${label}.y`),
    width: expectPositiveFiniteNumber(obj['width'], `${label}.width`),
    height: expectPositiveFiniteNumber(obj['height'], `${label}.height`),
  };
}

function parseFootprintArtwork(raw, label) {
  const obj = expectRecord(raw, label);
  const assetHash = expectNonEmptyString(obj['assetHash'], `${label}.assetHash`);
  if (!ARTWORK_HASH_PATTERN.test(assetHash)) {
    throw new CanonicalProjectValidationError(
      `${label}.assetHash: expected a lowercase SHA-256 hash`,
    );
  }
  return {
    assetHash,
    x: expectFiniteNumber(obj['x'], `${label}.x`),
    y: expectFiniteNumber(obj['y'], `${label}.y`),
    width: expectPositiveFiniteNumber(obj['width'], `${label}.width`),
    height: expectPositiveFiniteNumber(obj['height'], `${label}.height`),
    preserveAspectRatio: expectOptionalBoolean(
      obj['preserveAspectRatio'],
      `${label}.preserveAspectRatio`,
    ),
  };
}

function parseFootprintPin(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    cell: expectHole(obj['cell'], `${label}.cell`),
    artworkPoint:
      obj['artworkPoint'] === undefined
        ? undefined
        : (() => {
            const point = expectRecord(obj['artworkPoint'], `${label}.artworkPoint`);
            return {
              x: expectFiniteNumber(point['x'], `${label}.artworkPoint.x`),
              y: expectFiniteNumber(point['y'], `${label}.artworkPoint.y`),
            };
          })(),
    primary: expectOptionalBoolean(obj['primary'], `${label}.primary`),
  };
}

function parseFootprintShape(raw, label) {
  const obj = expectRecord(raw, label);
  const kind = expectOneOf(obj['kind'], ['rect', 'circle', 'line', 'text'], `${label}.kind`);
  if (kind === 'rect') {
    return {
      kind,
      x: expectFiniteNumber(obj['x'], `${label}.x`),
      y: expectFiniteNumber(obj['y'], `${label}.y`),
      width: expectPositiveFiniteNumber(obj['width'], `${label}.width`),
      height: expectPositiveFiniteNumber(obj['height'], `${label}.height`),
      rx:
        obj['rx'] === undefined
          ? undefined
          : expectNonNegativeFiniteNumber(obj['rx'], `${label}.rx`),
      fill: expectOptionalPaint(obj['fill'], `${label}.fill`),
      stroke: expectOptionalPaint(obj['stroke'], `${label}.stroke`),
    };
  }
  if (kind === 'circle') {
    return {
      kind,
      cx: expectFiniteNumber(obj['cx'], `${label}.cx`),
      cy: expectFiniteNumber(obj['cy'], `${label}.cy`),
      r: expectPositiveFiniteNumber(obj['r'], `${label}.r`),
      fill: expectOptionalPaint(obj['fill'], `${label}.fill`),
      stroke: expectOptionalPaint(obj['stroke'], `${label}.stroke`),
    };
  }
  if (kind === 'line') {
    return {
      kind,
      x1: expectFiniteNumber(obj['x1'], `${label}.x1`),
      y1: expectFiniteNumber(obj['y1'], `${label}.y1`),
      x2: expectFiniteNumber(obj['x2'], `${label}.x2`),
      y2: expectFiniteNumber(obj['y2'], `${label}.y2`),
      stroke: expectOptionalPaint(obj['stroke'], `${label}.stroke`),
      width:
        obj['width'] === undefined
          ? undefined
          : expectPositiveFiniteNumber(obj['width'], `${label}.width`),
    };
  }
  return {
    kind,
    x: expectFiniteNumber(obj['x'], `${label}.x`),
    y: expectFiniteNumber(obj['y'], `${label}.y`),
    text: expectString(obj['text'], `${label}.text`),
    size:
      obj['size'] === undefined
        ? undefined
        : expectPositiveFiniteNumber(obj['size'], `${label}.size`),
    anchor:
      obj['anchor'] === undefined
        ? undefined
        : expectOneOf(obj['anchor'], ALLOWED_TEXT_ANCHORS, `${label}.anchor`),
    fill: expectOptionalPaint(obj['fill'], `${label}.fill`),
  };
}

function expectOptionalPaint(raw, label) {
  return raw === undefined ? undefined : expectOneOf(raw, ALLOWED_FOOTPRINT_PAINTS, label);
}

function parseLegacyComponent(raw, label) {
  const obj = expectRecord(raw, label);
  const pins = expectArray(obj['pins'], `${label}.pins`).map((p, i) =>
    parseLegacyPin(p, `${label}.pins[${i}]`),
  );

  const pinIds = new Set();
  for (const pin of pins) {
    if (pinIds.has(pin.id)) {
      throw new CanonicalProjectValidationError(`${label}.pins: duplicate id "${pin.id}"`);
    }
    pinIds.add(pin.id);
  }

  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    deviceId: expectString(obj['deviceId'], `${label}.deviceId`),
    manufacturer: expectString(obj['manufacturer'], `${label}.manufacturer`),
    model: expectString(obj['model'], `${label}.model`),
    category: expectOptionalString(obj['category'], `${label}.category`),
    location: expectOptionalString(obj['location'], `${label}.location`),
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
    position: expectPoint(obj['position'], `${label}.position`),
    pins,
  };
}

function parseLegacyPin(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    direction: expectOneOf(obj['direction'], ALLOWED_PORT_DIRECTIONS, `${label}.direction`),
    connectorType: expectOptionalString(obj['connectorType'], `${label}.connectorType`),
    hole: obj['hole'] === undefined ? undefined : expectHole(obj['hole'], `${label}.hole`),
  };
}

function parseLegacyNet(raw, label) {
  const obj = expectRecord(raw, label);
  const color = expectOptionalString(obj['color'], `${label}.color`);
  const colorCode = expectOptionalString(obj['colorCode'], `${label}.colorCode`);
  validateWireColorPair(color, colorCode, label);
  if (obj['routingMode'] !== undefined) {
    expectOneOf(obj['routingMode'], ALLOWED_ROUTING_MODES, `${label}.routingMode`);
  }
  const parsedPoints =
    obj['points'] === undefined
      ? undefined
      : expectArray(obj['points'], `${label}.points`).map((p, i) =>
          expectPoint(p, `${label}.points[${i}]`),
        );
  // Early v1 snapshots could persist rendered points without routingMode.
  // Recover only a valid route; malformed legacy geometry falls back to auto.
  const normalized = parsedPoints ? normalizeOrthogonalPersistedRoute(parsedPoints) : null;
  const points = normalized && normalized.length >= 2 ? normalized : undefined;
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    wireId: expectString(obj['wireId'], `${label}.wireId`),
    wireType: expectOptionalString(obj['wireType'], `${label}.wireType`),
    netId: expectOptionalString(obj['netId'], `${label}.netId`),
    color,
    colorCode,
    gauge: expectOptionalString(obj['gauge'], `${label}.gauge`),
    length: expectOptionalString(obj['length'], `${label}.length`),
    note: expectOptionalString(obj['note'], `${label}.note`),
    source: expectEndpoint(obj['source'], `${label}.source`),
    target: expectEndpoint(obj['target'], `${label}.target`),
    routingMode: points ? 'manual' : undefined,
    points,
  };
}

function validateWireColorPair(color, colorCode, label) {
  if (!colorCode) return;
  const normalizedCode = colorCode.trim().toUpperCase();
  const expectedColor = WIREVIZ_COLOR_CODES[normalizedCode] ?? normalizeHexColor(normalizedCode);
  // Missing render color is recoverable; opaque WireViz tokens have no single
  // CSS equivalent. Only a deterministic conflict is invalid.
  if (color === undefined || expectedColor === undefined) return;
  if (normalizeCssColor(color) === normalizeCssColor(expectedColor)) return;
  throw new CanonicalProjectValidationError(`${label}: color does not match colorCode`);
}

function normalizeHexColor(color) {
  const trimmed = color.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9A-F]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return undefined;
}

function normalizeCssColor(color) {
  return normalizeHexColor(color)?.toLowerCase() ?? color.trim().toLowerCase();
}

function expectEndpoint(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    componentId: expectNonEmptyString(obj['componentId'], `${label}.componentId`),
    pinId: expectNonEmptyString(obj['pinId'], `${label}.pinId`),
  };
}

function expectHole(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    row: expectNonNegativeInteger(obj['row'], `${label}.row`),
    col: expectNonNegativeInteger(obj['col'], `${label}.col`),
  };
}

function expectPoint(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    x: expectFiniteNumber(obj['x'], `${label}.x`),
    y: expectFiniteNumber(obj['y'], `${label}.y`),
  };
}

function expectRecord(raw, label) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CanonicalProjectValidationError(`${label}: expected an object`);
  }
  return raw;
}

function expectArray(raw, label) {
  if (!Array.isArray(raw)) {
    throw new CanonicalProjectValidationError(`${label}: expected an array`);
  }
  return raw;
}

function expectString(raw, label) {
  if (typeof raw !== 'string') {
    throw new CanonicalProjectValidationError(`${label}: expected a string, got ${typeof raw}`);
  }
  return raw;
}

function expectNonEmptyString(raw, label) {
  const value = expectString(raw, label);
  if (value.length === 0) {
    throw new CanonicalProjectValidationError(`${label}: expected a non-empty string`);
  }
  return value;
}

function expectOptionalString(raw, label) {
  if (raw === undefined) return undefined;
  return expectString(raw, label);
}

function expectOptionalBoolean(raw, label) {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'boolean') {
    throw new CanonicalProjectValidationError(`${label}: expected a boolean`);
  }
  return raw;
}

function expectOptionalJsonRecord(raw, label, reserved) {
  if (raw === undefined) return undefined;
  const obj = expectRecord(raw, label);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DANGEROUS_OBJECT_KEYS.has(key)) {
      throw new CanonicalProjectValidationError(`${label}.${key}: dangerous key is not allowed`);
    }
    if (reserved.has(key)) {
      throw new CanonicalProjectValidationError(
        `${label}.${key}: a preserved extra cannot replace a canonical WireViz field`,
      );
    }
    result[key] = expectJsonValue(value, `${label}.${key}`);
  }
  return result;
}

function expectJsonValue(raw, label) {
  if (raw === null || typeof raw === 'string' || typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return expectFiniteNumber(raw, label);
  if (Array.isArray(raw)) {
    return raw.map((value, index) => expectJsonValue(value, `${label}[${index}]`));
  }
  if (typeof raw === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(raw)) {
      if (DANGEROUS_OBJECT_KEYS.has(key)) {
        throw new CanonicalProjectValidationError(`${label}.${key}: dangerous key is not allowed`);
      }
      result[key] = expectJsonValue(value, `${label}.${key}`);
    }
    return result;
  }
  throw new CanonicalProjectValidationError(`${label}: expected a JSON-serializable value`);
}

function expectFiniteNumber(raw, label) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new CanonicalProjectValidationError(
      `${label}: expected a finite number, got ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

function parseVisualPlane(raw, label, fallback) {
  const value =
    raw === undefined && fallback !== undefined ? fallback : expectFiniteNumber(raw, label);
  if (
    !Number.isSafeInteger(value) ||
    value < -OPERATIONAL_LIMITS.maxVisualPlane ||
    value > OPERATIONAL_LIMITS.maxVisualPlane
  ) {
    throw new CanonicalProjectValidationError(
      `${label}: expected an integer between ${-OPERATIONAL_LIMITS.maxVisualPlane} and ${OPERATIONAL_LIMITS.maxVisualPlane}`,
    );
  }
  return value;
}

function expectPositiveFiniteNumber(raw, label) {
  const value = expectFiniteNumber(raw, label);
  if (value <= 0) {
    throw new CanonicalProjectValidationError(`${label}: expected a positive number, got ${value}`);
  }
  return value;
}

function expectNonNegativeFiniteNumber(raw, label) {
  const value = expectFiniteNumber(raw, label);
  if (value < 0) {
    throw new CanonicalProjectValidationError(
      `${label}: expected a non-negative number, got ${value}`,
    );
  }
  return value;
}

function expectBoundedPositiveFiniteNumber(raw, label, limit, kind) {
  const value = expectPositiveFiniteNumber(raw, label);
  if (value > limit) {
    throw new CanonicalProjectValidationError(
      `${label}: ${kind} ${value} exceeds operational limit of ${limit}`,
    );
  }
  return value;
}

function expectPositiveInteger(raw, label) {
  const value = expectFiniteNumber(raw, label);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CanonicalProjectValidationError(
      `${label}: expected a safe positive integer, got ${value}`,
    );
  }
  return value;
}

function expectNonNegativeInteger(raw, label) {
  const value = expectFiniteNumber(raw, label);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CanonicalProjectValidationError(
      `${label}: expected a safe non-negative integer, got ${value}`,
    );
  }
  return value;
}

function expectBoundedPositiveInteger(raw, label, limit, kind) {
  const value = expectPositiveInteger(raw, label);
  if (value > limit) {
    throw new CanonicalProjectValidationError(
      `${label}: ${kind} ${value} exceeds operational limit of ${limit}`,
    );
  }
  return value;
}

function assertCollectionLimit(length, limit, label, kind) {
  if (length > limit) {
    throw new CanonicalProjectValidationError(
      `${label}: ${kind} ${length} exceeds operational limit of ${limit}`,
    );
  }
}

class CanonicalEntityBudget {
  #total = 0;

  add(count, label) {
    const next = this.#total + count;
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(next)) {
      throw new CanonicalProjectValidationError(
        `${label}: total entity count must be a safe integer`,
      );
    }
    if (next > OPERATIONAL_LIMITS.maxTotalEntities) {
      throw new CanonicalProjectValidationError(
        `${label}: total entity count ${next} exceeds operational limit of ` +
          `${OPERATIONAL_LIMITS.maxTotalEntities}`,
      );
    }
    this.#total = next;
  }
}

function expectOneOf(raw, allowed, label) {
  if (typeof raw !== 'string' || !allowed.includes(raw)) {
    throw new CanonicalProjectValidationError(
      `${label}: expected one of ${allowed.map((v) => `"${v}"`).join(', ')}, got ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}
