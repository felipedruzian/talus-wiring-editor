// Structural validation for CanonicalProject JSON, mirrored from
// src/app/av-schematic/diagram/model/canonical-project-parse.ts.
//
// This server has no build step linking it to the Angular/TypeScript source
// (see docs/local-service.md: plain Node core modules only, no bundler), so
// validation remains plain JS. Allocation-sensitive limits come from the
// same small runtime module as the client; parity tests exercise both sides.

import { OPERATIONAL_LIMITS } from '../src/app/av-schematic/diagram/model/operational-limits.mjs';

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

  if (version === 1) return parseV1(root);
  if (version === 2) return parseV2(root);

  throw new CanonicalProjectValidationError(
    `project.formatVersion: expected 1 or 2, got ${JSON.stringify(version)}`,
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
      throw new CanonicalProjectValidationError(`project.components: duplicate id "${component.id}"`);
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
        validateHoleBounds(pin.hole, component, boardsById, `component "${component.id}" pin "${pin.id}"`);
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

function parseV2(root) {
  const electricalRaw = expectRecord(root['electrical'], 'project.electrical');
  const layoutRaw = expectRecord(root['layout'], 'project.layout');
  preflightV2(electricalRaw, layoutRaw);

  const electrical = {
    components: expectArray(electricalRaw['components'], 'project.electrical.components').map(
      (value, index) => parseV2Component(value, `project.electrical.components[${index}]`),
    ),
    junctions: expectArray(electricalRaw['junctions'], 'project.electrical.junctions').map(
      (value, index) => parseV2Junction(value, `project.electrical.junctions[${index}]`),
    ),
    cables: expectArray(electricalRaw['cables'], 'project.electrical.cables').map(
      (value, index) => parseV2Cable(value, `project.electrical.cables[${index}]`),
    ),
    nets: expectArray(electricalRaw['nets'], 'project.electrical.nets').map((value, index) =>
      parseV2Net(value, `project.electrical.nets[${index}]`),
    ),
  };

  const layout = {
    boards: expectArray(layoutRaw['boards'], 'project.layout.boards').map((value, index) =>
      parseBoard(value, `project.layout.boards[${index}]`),
    ),
    components: expectArray(layoutRaw['components'], 'project.layout.components').map(
      (value, index) => parseV2ComponentLayout(value, `project.layout.components[${index}]`),
    ),
    junctions: expectArray(layoutRaw['junctions'], 'project.layout.junctions').map(
      (value, index) => parseV2JunctionLayout(value, `project.layout.junctions[${index}]`),
    ),
    conductors: expectArray(layoutRaw['conductors'], 'project.layout.conductors').map(
      (value, index) => parseV2ConductorLayout(value, `project.layout.conductors[${index}]`),
    ),
  };

  const project = { formatVersion: 2, electrical, layout };
  validateV2Project(project);
  return project;
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

  components.forEach((raw, index) => {
    const label = `project.components[${index}].pins`;
    const pins = expectArray(expectRecord(raw, `project.components[${index}]`)['pins'], label);
    assertCollectionLimit(
      pins.length,
      OPERATIONAL_LIMITS.maxPinsPerComponent,
      label,
      'pin count',
    );
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

  components.forEach((raw, index) => {
    const label = `project.electrical.components[${index}].pins`;
    const pins = expectArray(expectRecord(raw, `project.electrical.components[${index}]`)['pins'], label);
    assertCollectionLimit(
      pins.length,
      OPERATIONAL_LIMITS.maxPinsPerComponent,
      label,
      'pin count',
    );
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
  });

  conductorLayouts.forEach((raw, index) => {
    const label = `project.layout.conductors[${index}].points`;
    const layout = expectRecord(raw, `project.layout.conductors[${index}]`);
    if (layout['points'] !== undefined) {
      budget.add(expectArray(layout['points'], label).length, label);
    }
  });
}

function parseV2Component(raw, label) {
  const obj = expectRecord(raw, label);
  const pins = expectArray(obj['pins'], `${label}.pins`).map((value, index) =>
    parseV2Pin(value, `${label}.pins[${index}]`),
  );

  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    deviceId: expectString(obj['deviceId'], `${label}.deviceId`),
    manufacturer: expectString(obj['manufacturer'], `${label}.manufacturer`),
    model: expectString(obj['model'], `${label}.model`),
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
    wirevizDesignator: expectOptionalString(
      obj['wirevizDesignator'],
      `${label}.wirevizDesignator`,
    ),
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
    wirevizLink:
      obj['wirevizLink'] === undefined
        ? undefined
        : expectOneOf(obj['wirevizLink'], ALLOWED_WIREVIZ_LINKS, `${label}.wirevizLink`),
    wirevizLoop: expectOptionalBoolean(obj['wirevizLoop'], `${label}.wirevizLoop`),
  };
}

function parseV2ComponentLayout(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    componentId: expectNonEmptyString(obj['componentId'], `${label}.componentId`),
    position: expectPoint(obj['position'], `${label}.position`),
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
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

function parseV2JunctionLayout(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    junctionId: expectNonEmptyString(obj['junctionId'], `${label}.junctionId`),
    position: expectPoint(obj['position'], `${label}.position`),
    taps: expectPositiveInteger(obj['taps'], `${label}.taps`),
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
    hole: obj['hole'] === undefined ? undefined : expectHole(obj['hole'], `${label}.hole`),
  };
}

function parseV2ConductorLayout(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    conductorId: expectNonEmptyString(obj['conductorId'], `${label}.conductorId`),
    routingMode:
      obj['routingMode'] === undefined
        ? undefined
        : expectOneOf(obj['routingMode'], ALLOWED_ROUTING_MODES, `${label}.routingMode`),
    points:
      obj['points'] === undefined
        ? undefined
        : expectArray(obj['points'], `${label}.points`).map((value, index) =>
            expectPoint(value, `${label}.points[${index}]`),
          ),
    fromTap:
      obj['fromTap'] === undefined
        ? undefined
        : expectNonNegativeInteger(obj['fromTap'], `${label}.fromTap`),
    toTap:
      obj['toTap'] === undefined
        ? undefined
        : expectNonNegativeInteger(obj['toTap'], `${label}.toTap`),
  };
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
        throw new CanonicalProjectValidationError(`${label}.endpoints: duplicate endpoint "${key}"`);
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
  for (const layout of project.layout.components) {
    const label = `project.layout.components "${layout.componentId}"`;
    if (seenComponents.has(layout.componentId)) {
      throw new CanonicalProjectValidationError(`${label}: duplicate layout entry`);
    }
    seenComponents.add(layout.componentId);
    const component = componentsById.get(layout.componentId);
    if (!component) {
      throw new CanonicalProjectValidationError(`${label}: no such component in project.electrical`);
    }
    if (layout.boardId !== undefined && !boardsById.has(layout.boardId)) {
      throw new CanonicalProjectValidationError(
        `${label}: boardId "${layout.boardId}" does not match any board in the project`,
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
        throw new CanonicalProjectValidationError(
          `${label}.pinHoles: no pin "${placement.pinId}"`,
        );
      }
      validateV2Hole(placement.hole, layout.boardId, boardsById, `${label}.pinHoles`);
    }
  }

  const seenJunctions = new Set();
  const tapsByJunction = new Map();
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
    tapsByJunction.set(layout.junctionId, layout.taps);
  }

  const seenConductors = new Set();
  for (const layout of project.layout.conductors) {
    const label = `project.layout.conductors "${layout.conductorId}"`;
    if (seenConductors.has(layout.conductorId)) {
      throw new CanonicalProjectValidationError(`${label}: duplicate layout entry`);
    }
    seenConductors.add(layout.conductorId);
    if (!conductorIds.has(layout.conductorId)) {
      throw new CanonicalProjectValidationError(`${label}: no such conductor in project.electrical`);
    }
    const conductor = conductorsById.get(layout.conductorId);
    validateV2Tap(layout.fromTap, conductor?.from, tapsByJunction, `${label}.fromTap`);
    validateV2Tap(layout.toTap, conductor?.to, tapsByJunction, `${label}.toTap`);
  }
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
  if (!board || !isHoleInBounds(board, hole)) {
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

function parseBoard(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    rows: expectPositiveInteger(obj['rows'], `${label}.rows`),
    cols: expectPositiveInteger(obj['cols'], `${label}.cols`),
    pitch: expectPositiveFiniteNumber(obj['pitch'], `${label}.pitch`),
    position: expectPoint(obj['position'], `${label}.position`),
  };
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
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    wireId: expectString(obj['wireId'], `${label}.wireId`),
    wireType: expectOptionalString(obj['wireType'], `${label}.wireType`),
    netId: expectOptionalString(obj['netId'], `${label}.netId`),
    color: expectOptionalString(obj['color'], `${label}.color`),
    colorCode: expectOptionalString(obj['colorCode'], `${label}.colorCode`),
    source: expectEndpoint(obj['source'], `${label}.source`),
    target: expectEndpoint(obj['target'], `${label}.target`),
    routingMode:
      obj['routingMode'] === undefined
        ? undefined
        : expectOneOf(obj['routingMode'], ALLOWED_ROUTING_MODES, `${label}.routingMode`),
    points:
      obj['points'] === undefined
        ? undefined
        : expectArray(obj['points'], `${label}.points`).map((p, i) =>
            expectPoint(p, `${label}.points[${i}]`),
          ),
  };
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

function expectPositiveFiniteNumber(raw, label) {
  const value = expectFiniteNumber(raw, label);
  if (value <= 0) {
    throw new CanonicalProjectValidationError(`${label}: expected a positive number, got ${value}`);
  }
  return value;
}

function expectPositiveInteger(raw, label) {
  const value = expectFiniteNumber(raw, label);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CanonicalProjectValidationError(`${label}: expected a safe positive integer, got ${value}`);
  }
  return value;
}

function expectNonNegativeInteger(raw, label) {
  const value = expectFiniteNumber(raw, label);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CanonicalProjectValidationError(`${label}: expected a safe non-negative integer, got ${value}`);
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
