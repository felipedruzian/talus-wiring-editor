// Structural validation for the CanonicalProjectV1 JSON format, mirrored from
// src/app/av-schematic/diagram/model/canonical-project.ts's parseCanonicalProject.
//
// This server has no build step linking it to the Angular/TypeScript source
// (see docs/local-service.md: plain Node core modules only, no bundler) so
// the validation logic is duplicated here in plain JS rather than imported.
// Keep the two in sync by hand whenever the canonical format changes — the
// client-side spec (canonical-project.spec.ts) and this server's spec
// (wiring-editor-server.spec.mjs) both exercise the same rule set, which is
// the best cross-check available without a shared module.

export class CanonicalProjectValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanonicalProjectValidationError';
  }
}

const ALLOWED_ROUTING_MODES = ['manual'];
const ALLOWED_PORT_DIRECTIONS = ['input', 'output'];

/** Parses and validates an untrusted value as a CanonicalProjectV1. Throws CanonicalProjectValidationError on any mismatch. */
export function parseCanonicalProject(raw) {
  const root = expectRecord(raw, 'project');

  if (root['formatVersion'] !== 1) {
    throw new CanonicalProjectValidationError(
      `project.formatVersion: expected 1, got ${JSON.stringify(root['formatVersion'])}`,
    );
  }

  const boards = expectArray(root['boards'], 'project.boards').map((b, i) =>
    parseBoard(b, `project.boards[${i}]`),
  );
  const components = expectArray(root['components'], 'project.components').map((c, i) =>
    parseComponent(c, `project.components[${i}]`),
  );
  const nets = expectArray(root['nets'], 'project.nets').map((n, i) =>
    parseNet(n, `project.nets[${i}]`),
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
  for (const net of nets) {
    if (netIds.has(net.id)) {
      throw new CanonicalProjectValidationError(`project.nets: duplicate id "${net.id}"`);
    }
    netIds.add(net.id);
    validateEndpoint(net.source, componentsById, `project.nets "${net.id}".source`);
    validateEndpoint(net.target, componentsById, `project.nets "${net.id}".target`);
  }

  return { formatVersion: 1, boards, components, nets };
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

function parseComponent(raw, label) {
  const obj = expectRecord(raw, label);
  const pins = expectArray(obj['pins'], `${label}.pins`).map((p, i) =>
    parsePin(p, `${label}.pins[${i}]`),
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

function parsePin(raw, label) {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    direction: expectOneOf(obj['direction'], ALLOWED_PORT_DIRECTIONS, `${label}.direction`),
    connectorType: expectOptionalString(obj['connectorType'], `${label}.connectorType`),
    hole: obj['hole'] === undefined ? undefined : expectHole(obj['hole'], `${label}.hole`),
  };
}

function parseNet(raw, label) {
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
  if (!Number.isInteger(value) || value <= 0) {
    throw new CanonicalProjectValidationError(`${label}: expected a positive integer, got ${value}`);
  }
  return value;
}

function expectNonNegativeInteger(raw, label) {
  const value = expectFiniteNumber(raw, label);
  if (!Number.isInteger(value) || value < 0) {
    throw new CanonicalProjectValidationError(`${label}: expected a non-negative integer, got ${value}`);
  }
  return value;
}

function expectOneOf(raw, allowed, label) {
  if (typeof raw !== 'string' || !allowed.includes(raw)) {
    throw new CanonicalProjectValidationError(
      `${label}: expected one of ${allowed.map((v) => `"${v}"`).join(', ')}, got ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}
