import { isHoleInBounds } from './board-geometry';
import {
  buildNets,
  CANONICAL_FORMAT_VERSION,
  CanonicalProjectError,
  endpointKey,
  type CanonicalBoard,
  type CanonicalCable,
  type CanonicalComponent,
  type CanonicalComponentLayout,
  type CanonicalConductor,
  type CanonicalConductorLayout,
  type CanonicalJunction,
  type CanonicalJunctionLayout,
  type CanonicalNet,
  type CanonicalNetEndpoint,
  type CanonicalPin,
  type CanonicalPinPlacement,
  type CanonicalPoint,
  type CanonicalProjectV2,
  type CanonicalRoutingMode,
} from './canonical-project';
import {
  type BoardHole,
  type JunctionKind,
  type PortDirection,
  type PreservedFields,
  type PreservedValue,
  type WireVizLinkStyle,
} from './interfaces';
import { groupConductorsIntoNets } from './net-grouping';
import {
  isDangerousObjectKey,
  WIREVIZ_CABLE_CANONICAL_KEYS,
  WIREVIZ_CONNECTOR_CANONICAL_KEYS,
} from './wireviz-schema-keys';

/**
 * Untrusted JSON (disk, network) -> `CanonicalProjectV2`.
 *
 * Every field is checked explicitly, every failure throws a labeled
 * `CanonicalProjectError`, no blind casts — the same discipline as
 * `wireviz-import/wireviz-model.ts`. Used by the storage client after a GET
 * and mirrored by the local service before a PUT reaches disk
 * (`server/canonical-project-validate.mjs`).
 *
 * A stored **v1** project is accepted and migrated rather than rejected:
 * that is the point of having a version in the format. The migration is also
 * where the issue #2 fix becomes visible on old data — v1 stored one entry
 * per wire, so several v1 "nets" sharing a pin were really one multi-drop
 * net, and grouping them by connectivity is exactly what recovers it.
 */

const ALLOWED_ROUTING_MODES: readonly CanonicalRoutingMode[] = ['manual'];
const ALLOWED_PORT_DIRECTIONS: readonly PortDirection[] = ['input', 'output'];
const ALLOWED_JUNCTION_KINDS: readonly JunctionKind[] = ['junction', 'rail'];
const ALLOWED_ENDPOINT_KINDS = ['pin', 'junction'] as const;
const ALLOWED_WIREVIZ_LINKS: readonly WireVizLinkStyle[] = ['--', '<--', '<-->', '-->'];

export function parseCanonicalProject(raw: unknown): CanonicalProjectV2 {
  const root = expectRecord(raw, 'project');
  const version = root['formatVersion'];

  if (version === 1) return migrateV1(parseV1(root));
  if (version === CANONICAL_FORMAT_VERSION) return parseV2(root);

  throw new CanonicalProjectError(
    `project.formatVersion: expected 1 or ${CANONICAL_FORMAT_VERSION}, got ${JSON.stringify(version)}`,
  );
}

// ---------------------------------------------------------------------------
// v2
// ---------------------------------------------------------------------------

function parseV2(root: Record<string, unknown>): CanonicalProjectV2 {
  const electricalRaw = expectRecord(root['electrical'], 'project.electrical');
  const layoutRaw = expectRecord(root['layout'], 'project.layout');

  const components = expectArray(electricalRaw['components'], 'project.electrical.components').map(
    (value, i) => parseComponent(value, `project.electrical.components[${i}]`),
  );
  const junctions = expectArray(electricalRaw['junctions'], 'project.electrical.junctions').map(
    (value, i) => parseJunction(value, `project.electrical.junctions[${i}]`),
  );
  const cables = expectArray(electricalRaw['cables'], 'project.electrical.cables').map((value, i) =>
    parseCable(value, `project.electrical.cables[${i}]`),
  );
  const nets = expectArray(electricalRaw['nets'], 'project.electrical.nets').map((value, i) =>
    parseNet(value, `project.electrical.nets[${i}]`),
  );

  const boards = expectArray(layoutRaw['boards'], 'project.layout.boards').map((value, i) =>
    parseBoard(value, `project.layout.boards[${i}]`),
  );
  const componentLayouts = expectArray(layoutRaw['components'], 'project.layout.components').map(
    (value, i) => parseComponentLayout(value, `project.layout.components[${i}]`),
  );
  const junctionLayouts = expectArray(layoutRaw['junctions'], 'project.layout.junctions').map(
    (value, i) => parseJunctionLayout(value, `project.layout.junctions[${i}]`),
  );
  const conductorLayouts = expectArray(layoutRaw['conductors'], 'project.layout.conductors').map(
    (value, i) => parseConductorLayout(value, `project.layout.conductors[${i}]`),
  );

  const project: CanonicalProjectV2 = {
    formatVersion: CANONICAL_FORMAT_VERSION,
    electrical: { components, junctions, cables, nets },
    layout: {
      boards,
      components: componentLayouts,
      junctions: junctionLayouts,
      conductors: conductorLayouts,
    },
  };

  validateProject(project);
  return project;
}

/**
 * Cross-checks everything that a single-entry parse cannot: id uniqueness
 * across sections, references that must resolve, holes that must fit their
 * board, taps that must exist, and — the invariant the whole net model rests
 * on — that each declared net really is one connected group and that no
 * endpoint belongs to two nets at once.
 */
function validateProject(project: CanonicalProjectV2): void {
  const { components, junctions, cables, nets } = project.electrical;
  const { boards } = project.layout;

  const nodeIds = new Set<string>();
  const claimId = (id: string, label: string): void => {
    if (nodeIds.has(id)) {
      throw new CanonicalProjectError(`${label}: duplicate node id "${id}"`);
    }
    nodeIds.add(id);
  };

  const boardsById = new Map<string, CanonicalBoard>();
  for (const board of boards) {
    claimId(board.id, 'project.layout.boards');
    boardsById.set(board.id, board);
  }

  const componentsById = new Map<string, CanonicalComponent>();
  for (const component of components) {
    claimId(component.id, 'project.electrical.components');
    componentsById.set(component.id, component);

    const pinIds = new Set<string>();
    for (const pin of component.pins) {
      if (pinIds.has(pin.id)) {
        throw new CanonicalProjectError(
          `project.electrical.components "${component.id}".pins: duplicate id "${pin.id}"`,
        );
      }
      pinIds.add(pin.id);
    }
  }

  const junctionsById = new Map<string, CanonicalJunction>();
  for (const junction of junctions) {
    claimId(junction.id, 'project.electrical.junctions');
    junctionsById.set(junction.id, junction);
  }

  const cablesByName = new Map<string, CanonicalCable>();
  for (const cable of cables) {
    if (cablesByName.has(cable.name)) {
      throw new CanonicalProjectError(`project.electrical.cables: duplicate name "${cable.name}"`);
    }
    cablesByName.set(cable.name, cable);
  }

  const netIds = new Set<string>();
  const conductorIds = new Set<string>();
  const endpointOwner = new Map<string, string>();

  for (const net of nets) {
    if (netIds.has(net.id)) {
      throw new CanonicalProjectError(`project.electrical.nets: duplicate id "${net.id}"`);
    }
    netIds.add(net.id);

    const label = `project.electrical.nets "${net.id}"`;
    if (net.conductors.length === 0) {
      throw new CanonicalProjectError(`${label}: a net must have at least one conductor`);
    }

    const declared = new Set<string>();
    for (const endpoint of net.endpoints) {
      const key = endpointKey(endpoint);
      if (declared.has(key)) {
        throw new CanonicalProjectError(`${label}.endpoints: duplicate endpoint "${key}"`);
      }
      declared.add(key);
      resolveEndpoint(endpoint, componentsById, junctionsById, `${label}.endpoints`);

      const owner = endpointOwner.get(key);
      if (owner !== undefined && owner !== net.id) {
        throw new CanonicalProjectError(
          `${label}.endpoints: "${key}" already belongs to net "${owner}" (an endpoint cannot be on two nets)`,
        );
      }
      endpointOwner.set(key, net.id);
    }

    const touched = new Set<string>();
    for (const conductor of net.conductors) {
      if (conductorIds.has(conductor.id)) {
        throw new CanonicalProjectError(
          `project.electrical.nets: duplicate conductor id "${conductor.id}"`,
        );
      }
      conductorIds.add(conductor.id);

      const conductorLabel = `${label}.conductors "${conductor.id}"`;
      const fromKey = endpointKey(conductor.from);
      const toKey = endpointKey(conductor.to);
      if (fromKey === toKey) {
        throw new CanonicalProjectError(`${conductorLabel}: both ends are the same endpoint`);
      }
      for (const key of [fromKey, toKey]) {
        if (!declared.has(key)) {
          throw new CanonicalProjectError(
            `${conductorLabel}: endpoint "${key}" is not listed in the net's endpoints`,
          );
        }
        touched.add(key);
      }

      if (conductor.cable) {
        if (conductor.wirevizLoop) {
          throw new CanonicalProjectError(
            `${conductorLabel}: an internal WireViz loop cannot reference a cable`,
          );
        }
        if (conductor.wirevizLink !== undefined) {
          throw new CanonicalProjectError(
            `${conductorLabel}: wirevizLink is only valid when the conductor has no cable`,
          );
        }
        const cable = cablesByName.get(conductor.cable.name);
        if (!cable) {
          throw new CanonicalProjectError(
            `${conductorLabel}: no cable "${conductor.cable.name}" in project.electrical.cables`,
          );
        }
        if (conductor.cable.wireIndex > cable.wireCount) {
          throw new CanonicalProjectError(
            `${conductorLabel}: wire index ${conductor.cable.wireIndex} is out of range (1..${cable.wireCount})`,
          );
        }
      }
      if (conductor.wirevizLoop) {
        if (conductor.wirevizLink !== undefined) {
          throw new CanonicalProjectError(
            `${conductorLabel}: an internal WireViz loop cannot declare wirevizLink`,
          );
        }
        if (
          conductor.from.kind !== 'pin' ||
          conductor.to.kind !== 'pin' ||
          conductor.from.componentId !== conductor.to.componentId
        ) {
          throw new CanonicalProjectError(
            `${conductorLabel}: an internal WireViz loop must join two pins of one component`,
          );
        }
      }
    }

    for (const key of declared) {
      if (!touched.has(key)) {
        throw new CanonicalProjectError(
          `${label}.endpoints: "${key}" is declared but no conductor reaches it`,
        );
      }
    }

    const groups = groupConductorsIntoNets(
      net.conductors.map((conductor) => ({
        fromKey: endpointKey(conductor.from),
        toKey: endpointKey(conductor.to),
      })),
    );
    if (groups.length > 1) {
      throw new CanonicalProjectError(
        `${label}: conductors form ${groups.length} disconnected groups; a net must be a single connected group`,
      );
    }
  }

  validateLayout(project, boardsById, componentsById, junctionsById, conductorIds);
}

function validateLayout(
  project: CanonicalProjectV2,
  boardsById: ReadonlyMap<string, CanonicalBoard>,
  componentsById: ReadonlyMap<string, CanonicalComponent>,
  junctionsById: ReadonlyMap<string, CanonicalJunction>,
  conductorIds: ReadonlySet<string>,
): void {
  const seenComponentLayouts = new Set<string>();
  for (const layout of project.layout.components) {
    const label = `project.layout.components "${layout.componentId}"`;
    if (seenComponentLayouts.has(layout.componentId)) {
      throw new CanonicalProjectError(`${label}: duplicate layout entry`);
    }
    seenComponentLayouts.add(layout.componentId);

    const component = componentsById.get(layout.componentId);
    if (!component) {
      throw new CanonicalProjectError(`${label}: no such component in project.electrical`);
    }

    if (layout.boardId !== undefined && !boardsById.has(layout.boardId)) {
      throw new CanonicalProjectError(
        `${label}: boardId "${layout.boardId}" does not match any board in the project`,
      );
    }

    const seenPins = new Set<string>();
    for (const placement of layout.pinHoles ?? []) {
      if (seenPins.has(placement.pinId)) {
        throw new CanonicalProjectError(`${label}.pinHoles: duplicate pin "${placement.pinId}"`);
      }
      seenPins.add(placement.pinId);
      if (!component.pins.some((pin) => pin.id === placement.pinId)) {
        throw new CanonicalProjectError(`${label}.pinHoles: no pin "${placement.pinId}"`);
      }
      validateHole(
        placement.hole,
        layout.boardId,
        boardsById,
        `${label}.pinHoles "${placement.pinId}"`,
      );
    }
  }

  const seenJunctionLayouts = new Set<string>();
  const tapsByJunction = new Map<string, number>();
  for (const layout of project.layout.junctions) {
    const label = `project.layout.junctions "${layout.junctionId}"`;
    if (seenJunctionLayouts.has(layout.junctionId)) {
      throw new CanonicalProjectError(`${label}: duplicate layout entry`);
    }
    seenJunctionLayouts.add(layout.junctionId);

    if (!junctionsById.has(layout.junctionId)) {
      throw new CanonicalProjectError(`${label}: no such junction in project.electrical`);
    }
    if (layout.boardId !== undefined && !boardsById.has(layout.boardId)) {
      throw new CanonicalProjectError(
        `${label}: boardId "${layout.boardId}" does not match any board in the project`,
      );
    }
    if (layout.hole) {
      validateHole(layout.hole, layout.boardId, boardsById, label);
    }
    tapsByJunction.set(layout.junctionId, layout.taps);
  }

  const conductorsById = new Map<string, CanonicalConductor>();
  for (const net of project.electrical.nets) {
    for (const conductor of net.conductors) conductorsById.set(conductor.id, conductor);
  }

  const seenConductorLayouts = new Set<string>();
  for (const layout of project.layout.conductors) {
    const label = `project.layout.conductors "${layout.conductorId}"`;
    if (seenConductorLayouts.has(layout.conductorId)) {
      throw new CanonicalProjectError(`${label}: duplicate layout entry`);
    }
    seenConductorLayouts.add(layout.conductorId);

    if (!conductorIds.has(layout.conductorId)) {
      throw new CanonicalProjectError(`${label}: no such conductor in project.electrical`);
    }

    const conductor = conductorsById.get(layout.conductorId);
    validateTap(layout.fromTap, conductor?.from, tapsByJunction, `${label}.fromTap`);
    validateTap(layout.toTap, conductor?.to, tapsByJunction, `${label}.toTap`);
  }
}

/**
 * A hole address is only meaningful relative to one specific board, so
 * anything carrying a hole must declare which board — this checks the
 * address fits *that* board's grid, not merely some board in the project.
 */
function validateHole(
  hole: BoardHole,
  boardId: string | undefined,
  boardsById: ReadonlyMap<string, CanonicalBoard>,
  label: string,
): void {
  if (boardId === undefined) {
    throw new CanonicalProjectError(`${label}.hole: a hole was given but no boardId`);
  }
  const board = boardsById.get(boardId);
  if (!board || !isHoleInBounds(board, hole)) {
    throw new CanonicalProjectError(
      `${label}.hole: {row: ${hole.row}, col: ${hole.col}} does not fit board "${boardId}"`,
    );
  }
}

function validateTap(
  tap: number | undefined,
  endpoint: CanonicalNetEndpoint | undefined,
  tapsByJunction: ReadonlyMap<string, number>,
  label: string,
): void {
  if (tap === undefined) return;
  if (endpoint?.kind !== 'junction') {
    throw new CanonicalProjectError(`${label}: this end is not a junction, so it has no tap`);
  }
  // A junction with no layout entry renders with a single tap (see
  // fromCanonicalProject), so tap 0 is the only valid index in that case.
  const taps = tapsByJunction.get(endpoint.junctionId) ?? 1;
  if (tap >= taps) {
    throw new CanonicalProjectError(
      `${label}: tap ${tap} is out of range for junction "${endpoint.junctionId}" (${taps} taps)`,
    );
  }
}

function resolveEndpoint(
  endpoint: CanonicalNetEndpoint,
  componentsById: ReadonlyMap<string, CanonicalComponent>,
  junctionsById: ReadonlyMap<string, CanonicalJunction>,
  label: string,
): void {
  if (endpoint.kind === 'junction') {
    if (!junctionsById.has(endpoint.junctionId)) {
      throw new CanonicalProjectError(`${label}: no junction "${endpoint.junctionId}"`);
    }
    return;
  }
  const component = componentsById.get(endpoint.componentId);
  if (!component) {
    throw new CanonicalProjectError(`${label}: no component "${endpoint.componentId}"`);
  }
  if (!component.pins.some((pin) => pin.id === endpoint.pinId)) {
    throw new CanonicalProjectError(
      `${label}: component "${endpoint.componentId}" has no pin "${endpoint.pinId}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// v2 entry parsers
// ---------------------------------------------------------------------------

function parseComponent(raw: unknown, label: string): CanonicalComponent {
  const obj = expectRecord(raw, label);
  const pins = expectArray(obj['pins'], `${label}.pins`).map((p, i) =>
    parsePin(p, `${label}.pins[${i}]`),
  );

  const pinIds = new Set<string>();
  for (const pin of pins) {
    if (pinIds.has(pin.id)) {
      throw new CanonicalProjectError(`${label}.pins: duplicate id "${pin.id}"`);
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
    wirevizExtras: expectOptionalPreservedFields(
      obj['wirevizExtras'],
      `${label}.wirevizExtras`,
      WIREVIZ_CONNECTOR_CANONICAL_KEYS,
    ),
    pins,
  };
}

function parsePin(raw: unknown, label: string): CanonicalPin {
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

function parseJunction(raw: unknown, label: string): CanonicalJunction {
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
    wirevizExtras: expectOptionalPreservedFields(
      obj['wirevizExtras'],
      `${label}.wirevizExtras`,
      WIREVIZ_CONNECTOR_CANONICAL_KEYS,
    ),
  };
}

function parseCable(raw: unknown, label: string): CanonicalCable {
  const obj = expectRecord(raw, label);
  const wireCount = expectPositiveInteger(obj['wireCount'], `${label}.wireCount`);
  const colors = expectArray(obj['colors'], `${label}.colors`).map((value, i) =>
    expectString(value, `${label}.colors[${i}]`),
  );
  if (colors.length > wireCount) {
    throw new CanonicalProjectError(
      `${label}.colors: has ${colors.length} entries but wireCount is ${wireCount}`,
    );
  }
  while (colors.length < wireCount) colors.push('');
  const wireLabels =
    obj['wireLabels'] === undefined
      ? undefined
      : expectArray(obj['wireLabels'], `${label}.wireLabels`).map((value, i) =>
          expectString(value, `${label}.wireLabels[${i}]`),
        );
  if (wireLabels && wireLabels.length > wireCount) {
    throw new CanonicalProjectError(
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
    wirevizExtras: expectOptionalPreservedFields(
      obj['wirevizExtras'],
      `${label}.wirevizExtras`,
      WIREVIZ_CABLE_CANONICAL_KEYS,
    ),
  };
}

function parseNet(raw: unknown, label: string): CanonicalNet {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    name: expectString(obj['name'], `${label}.name`),
    endpoints: expectArray(obj['endpoints'], `${label}.endpoints`).map((value, i) =>
      parseEndpoint(value, `${label}.endpoints[${i}]`),
    ),
    conductors: expectArray(obj['conductors'], `${label}.conductors`).map((value, i) =>
      parseConductor(value, `${label}.conductors[${i}]`),
    ),
  };
}

function parseEndpoint(raw: unknown, label: string): CanonicalNetEndpoint {
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

function parseConductor(raw: unknown, label: string): CanonicalConductor {
  const obj = expectRecord(raw, label);
  const cableRaw = obj['cable'];
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    from: parseEndpoint(obj['from'], `${label}.from`),
    to: parseEndpoint(obj['to'], `${label}.to`),
    cable:
      cableRaw === undefined
        ? undefined
        : (() => {
            const cable = expectRecord(cableRaw, `${label}.cable`);
            return {
              name: expectNonEmptyString(cable['name'], `${label}.cable.name`),
              wireIndex: expectPositiveInteger(cable['wireIndex'], `${label}.cable.wireIndex`),
            };
          })(),
    wireType: expectOptionalString(obj['wireType'], `${label}.wireType`),
    wirevizLink:
      obj['wirevizLink'] === undefined
        ? undefined
        : expectOneOf(obj['wirevizLink'], ALLOWED_WIREVIZ_LINKS, `${label}.wirevizLink`),
    wirevizLoop: expectOptionalBoolean(obj['wirevizLoop'], `${label}.wirevizLoop`),
  };
}

function parseBoard(raw: unknown, label: string): CanonicalBoard {
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

function parseComponentLayout(raw: unknown, label: string): CanonicalComponentLayout {
  const obj = expectRecord(raw, label);
  return {
    componentId: expectNonEmptyString(obj['componentId'], `${label}.componentId`),
    position: expectPoint(obj['position'], `${label}.position`),
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
    pinHoles:
      obj['pinHoles'] === undefined
        ? undefined
        : expectArray(obj['pinHoles'], `${label}.pinHoles`).map((value, i) =>
            parsePinPlacement(value, `${label}.pinHoles[${i}]`),
          ),
  };
}

function parsePinPlacement(raw: unknown, label: string): CanonicalPinPlacement {
  const obj = expectRecord(raw, label);
  return {
    pinId: expectNonEmptyString(obj['pinId'], `${label}.pinId`),
    hole: expectHole(obj['hole'], `${label}.hole`),
  };
}

function parseJunctionLayout(raw: unknown, label: string): CanonicalJunctionLayout {
  const obj = expectRecord(raw, label);
  return {
    junctionId: expectNonEmptyString(obj['junctionId'], `${label}.junctionId`),
    position: expectPoint(obj['position'], `${label}.position`),
    taps: expectPositiveInteger(obj['taps'], `${label}.taps`),
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
    hole: obj['hole'] === undefined ? undefined : expectHole(obj['hole'], `${label}.hole`),
  };
}

function parseConductorLayout(raw: unknown, label: string): CanonicalConductorLayout {
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
        : expectArray(obj['points'], `${label}.points`).map((p, i) =>
            expectPoint(p, `${label}.points[${i}]`),
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

// ---------------------------------------------------------------------------
// v1 -> v2 migration
// ---------------------------------------------------------------------------

interface LegacyPin extends CanonicalPin {
  hole?: BoardHole;
}

interface LegacyComponent {
  id: string;
  deviceId: string;
  manufacturer: string;
  model: string;
  category?: string;
  location?: string;
  boardId?: string;
  position: CanonicalPoint;
  pins: LegacyPin[];
}

interface LegacyNet {
  id: string;
  wireId: string;
  wireType?: string;
  netId?: string;
  color?: string;
  colorCode?: string;
  source: { componentId: string; pinId: string };
  target: { componentId: string; pinId: string };
  routingMode?: CanonicalRoutingMode;
  points?: CanonicalPoint[];
}

interface LegacyProject {
  boards: CanonicalBoard[];
  components: LegacyComponent[];
  nets: LegacyNet[];
}

function parseV1(root: Record<string, unknown>): LegacyProject {
  return {
    boards: expectArray(root['boards'], 'project.boards').map((b, i) =>
      parseBoard(b, `project.boards[${i}]`),
    ),
    components: expectArray(root['components'], 'project.components').map((c, i) =>
      parseLegacyComponent(c, `project.components[${i}]`),
    ),
    nets: expectArray(root['nets'], 'project.nets').map((n, i) =>
      parseLegacyNet(n, `project.nets[${i}]`),
    ),
  };
}

function parseLegacyComponent(raw: unknown, label: string): LegacyComponent {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    deviceId: expectString(obj['deviceId'], `${label}.deviceId`),
    manufacturer: expectString(obj['manufacturer'], `${label}.manufacturer`),
    model: expectString(obj['model'], `${label}.model`),
    category: expectOptionalString(obj['category'], `${label}.category`),
    location: expectOptionalString(obj['location'], `${label}.location`),
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
    position: expectPoint(obj['position'], `${label}.position`),
    pins: expectArray(obj['pins'], `${label}.pins`).map((p, i) => {
      const pinLabel = `${label}.pins[${i}]`;
      const pinObj = expectRecord(p, pinLabel);
      return {
        ...parsePin(p, pinLabel),
        hole:
          pinObj['hole'] === undefined ? undefined : expectHole(pinObj['hole'], `${pinLabel}.hole`),
      };
    }),
  };
}

function parseLegacyNet(raw: unknown, label: string): LegacyNet {
  const obj = expectRecord(raw, label);
  const endpoint = (value: unknown, endpointLabel: string) => {
    const e = expectRecord(value, endpointLabel);
    return {
      componentId: expectNonEmptyString(e['componentId'], `${endpointLabel}.componentId`),
      pinId: expectNonEmptyString(e['pinId'], `${endpointLabel}.pinId`),
    };
  };

  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    wireId: expectString(obj['wireId'], `${label}.wireId`),
    wireType: expectOptionalString(obj['wireType'], `${label}.wireType`),
    netId: expectOptionalString(obj['netId'], `${label}.netId`),
    color: expectOptionalString(obj['color'], `${label}.color`),
    colorCode: expectOptionalString(obj['colorCode'], `${label}.colorCode`),
    source: endpoint(obj['source'], `${label}.source`),
    target: endpoint(obj['target'], `${label}.target`),
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

/**
 * Rewrites a v1 project into v2 without losing anything it could express.
 *
 * The interesting part is what it *gains*: v1 stored one record per wire, so
 * a pin shared by several records was a multi-drop net the format had no way
 * to name. Grouping the migrated conductors by connectivity recovers those
 * nets, which is why an old saved project opens with its rails already
 * correct instead of as a pile of unrelated two-pin wires.
 */
function migrateV1(legacy: LegacyProject): CanonicalProjectV2 {
  const components: CanonicalComponent[] = legacy.components.map((component) => ({
    id: component.id,
    deviceId: component.deviceId,
    manufacturer: component.manufacturer,
    model: component.model,
    category: component.category,
    location: component.location,
    pins: component.pins.map((pin) => ({
      id: pin.id,
      label: pin.label,
      direction: pin.direction,
      connectorType: pin.connectorType,
    })),
  }));

  const componentLayouts: CanonicalComponentLayout[] = legacy.components.map((component) => {
    const pinHoles: CanonicalPinPlacement[] = [];
    for (const pin of component.pins) {
      if (pin.hole !== undefined) pinHoles.push({ pinId: pin.id, hole: pin.hole });
    }
    return {
      componentId: component.id,
      position: component.position,
      boardId: component.boardId,
      pinHoles: pinHoles.length > 0 ? pinHoles : undefined,
    };
  });

  const conductors: CanonicalConductor[] = legacy.nets.map((net) => ({
    id: net.id,
    from: { kind: 'pin', componentId: net.source.componentId, pinId: net.source.pinId },
    to: { kind: 'pin', componentId: net.target.componentId, pinId: net.target.pinId },
    cable: net.wireId ? { name: net.wireId, wireIndex: 1 } : undefined,
    wireType: net.wireType,
  }));

  const conductorLayouts: CanonicalConductorLayout[] = legacy.nets.map((net) => ({
    conductorId: net.id,
    routingMode: net.routingMode,
    points: net.points,
  }));

  // v1 had no cable registry: each wire carried its own color inline, and
  // `wireId` was the cable name. One cable per distinct wireId, single wire.
  const cables = new Map<string, CanonicalCable>();
  for (const net of [...legacy.nets].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (!net.wireId) continue;
    const color = net.colorCode ?? net.color;
    const existing = cables.get(net.wireId);
    if (existing) {
      const current = existing.colors[0];
      if (current && color && current !== color) {
        throw new CanonicalProjectError(
          `project.nets: cabo legado "${net.wireId}" possui cores contraditórias ` +
            `("${current}" e "${color}")`,
        );
      }
      if (!current && color) existing.colors[0] = color;
    } else {
      cables.set(net.wireId, {
        name: net.wireId,
        wireCount: 1,
        colors: [color ?? ''],
      });
    }
  }

  const nameHints = new Map<string, string>();
  for (const net of legacy.nets) {
    if (net.netId) nameHints.set(net.id, net.netId);
  }

  const project: CanonicalProjectV2 = {
    formatVersion: CANONICAL_FORMAT_VERSION,
    electrical: {
      components,
      junctions: [],
      cables: [...cables.values()].sort((a, b) => (a.name < b.name ? -1 : 1)),
      nets: buildNets(conductors, nameHints),
    },
    layout: {
      boards: legacy.boards,
      components: componentLayouts,
      junctions: [],
      conductors: conductorLayouts,
    },
  };

  validateProject(project);
  return project;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function expectHole(raw: unknown, label: string): BoardHole {
  const obj = expectRecord(raw, label);
  return {
    row: expectNonNegativeInteger(obj['row'], `${label}.row`),
    col: expectNonNegativeInteger(obj['col'], `${label}.col`),
  };
}

function expectPoint(raw: unknown, label: string): CanonicalPoint {
  const obj = expectRecord(raw, label);
  return {
    x: expectFiniteNumber(obj['x'], `${label}.x`),
    y: expectFiniteNumber(obj['y'], `${label}.y`),
  };
}

function expectRecord(raw: unknown, label: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new CanonicalProjectError(`${label}: expected an object`);
  }
  return raw as Record<string, unknown>;
}

function expectArray(raw: unknown, label: string): unknown[] {
  if (!Array.isArray(raw)) {
    throw new CanonicalProjectError(`${label}: expected an array`);
  }
  return raw;
}

function expectString(raw: unknown, label: string): string {
  if (typeof raw !== 'string') {
    throw new CanonicalProjectError(`${label}: expected a string, got ${typeof raw}`);
  }
  return raw;
}

function expectNonEmptyString(raw: unknown, label: string): string {
  const value = expectString(raw, label);
  if (value.length === 0) {
    throw new CanonicalProjectError(`${label}: expected a non-empty string`);
  }
  return value;
}

function expectOptionalString(raw: unknown, label: string): string | undefined {
  if (raw === undefined) return undefined;
  return expectString(raw, label);
}

function expectOptionalBoolean(raw: unknown, label: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'boolean') {
    throw new CanonicalProjectError(`${label}: expected a boolean, got ${typeof raw}`);
  }
  return raw;
}

/**
 * Uninterpreted fields are still validated as JSON-safe data: a function, a
 * `undefined` hole or a cyclic object would break both serialization and the
 * WireViz re-emit, so they are rejected here rather than at write time.
 */
function expectOptionalPreservedFields(
  raw: unknown,
  label: string,
  reserved: ReadonlySet<string>,
): PreservedFields | undefined {
  if (raw === undefined) return undefined;
  const obj = expectRecord(raw, label);
  const result: Record<string, PreservedValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isDangerousObjectKey(key)) {
      throw new CanonicalProjectError(`${label}.${key}: dangerous key is not allowed`);
    }
    if (reserved.has(key)) {
      throw new CanonicalProjectError(
        `${label}.${key}: a preserved extra cannot replace a canonical WireViz field`,
      );
    }
    result[key] = expectPreservedValue(value, `${label}.${key}`);
  }
  return result;
}

function expectPreservedValue(raw: unknown, label: string): PreservedValue {
  if (raw === null) return null;
  if (typeof raw === 'string' || typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return expectFiniteNumber(raw, label);
  if (Array.isArray(raw)) {
    return raw.map((value, i) => expectPreservedValue(value, `${label}[${i}]`));
  }
  if (typeof raw === 'object') {
    const result: Record<string, PreservedValue> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isDangerousObjectKey(key)) {
        throw new CanonicalProjectError(`${label}.${key}: dangerous key is not allowed`);
      }
      result[key] = expectPreservedValue(value, `${label}.${key}`);
    }
    return result;
  }
  throw new CanonicalProjectError(`${label}: expected a JSON-serializable value`);
}

function expectFiniteNumber(raw: unknown, label: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new CanonicalProjectError(
      `${label}: expected a finite number, got ${JSON.stringify(raw)}`,
    );
  }
  return raw;
}

function expectPositiveFiniteNumber(raw: unknown, label: string): number {
  const value = expectFiniteNumber(raw, label);
  if (value <= 0) {
    throw new CanonicalProjectError(`${label}: expected a positive number, got ${value}`);
  }
  return value;
}

function expectPositiveInteger(raw: unknown, label: string): number {
  const value = expectFiniteNumber(raw, label);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CanonicalProjectError(`${label}: expected a positive integer, got ${value}`);
  }
  return value;
}

function expectNonNegativeInteger(raw: unknown, label: string): number {
  const value = expectFiniteNumber(raw, label);
  if (!Number.isInteger(value) || value < 0) {
    throw new CanonicalProjectError(`${label}: expected a non-negative integer, got ${value}`);
  }
  return value;
}

function expectOneOf<T extends string>(raw: unknown, allowed: readonly T[], label: string): T {
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    throw new CanonicalProjectError(
      `${label}: expected one of ${allowed.map((v) => `"${v}"`).join(', ')}, got ${JSON.stringify(raw)}`,
    );
  }
  return raw as T;
}
