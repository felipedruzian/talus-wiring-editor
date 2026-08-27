import { type Edge, type Node, type Point } from 'ng-diagram';
import { isHoleInBounds } from './board-geometry';
import { isBoardNode, isDeviceNode, isWireEdge } from './guards';
import {
  EdgeTemplateType,
  NodeTemplateType,
  type AvSchematicNodeData,
  type BoardHole,
  type BoardNodeData,
  type DeviceNodeData,
  type PortDirection,
  type WireEdgeData,
} from './interfaces';

/**
 * Canonical, serializable project format (v1).
 *
 * This is the shape that round-trips through export/import and through the
 * local persistence service — a plain JSON-serializable snapshot of the
 * physical + electrical model, independent of ng-diagram's own `Node`/`Edge`
 * runtime types (which carry extra transient fields like `selected` or
 * `measuredPorts` that must NOT be persisted).
 */
export interface CanonicalProjectV1 {
  formatVersion: 1;
  boards: CanonicalBoard[];
  components: CanonicalComponent[];
  nets: CanonicalNet[];
}

export interface CanonicalPoint {
  x: number;
  y: number;
}

export interface CanonicalBoard {
  id: string;
  label: string;
  rows: number;
  cols: number;
  pitch: number;
  position: CanonicalPoint;
}

export interface CanonicalPin {
  id: string;
  label: string;
  direction: PortDirection;
  connectorType?: string;
  hole?: BoardHole;
}

export interface CanonicalComponent {
  id: string;
  deviceId: string;
  manufacturer: string;
  model: string;
  category?: string;
  location?: string;
  /** See `DeviceNodeData.boardId` — required iff any `pins[].hole` is set. */
  boardId?: string;
  position: CanonicalPoint;
  pins: CanonicalPin[];
}

export interface CanonicalNetEndpoint {
  componentId: string;
  pinId: string;
}

/**
 * The only routing mode this slice ever persists explicitly. Absence means
 * "auto" (ng-diagram's default router output) — canonicalized as undefined
 * rather than as an explicit `'auto'` string, so the format has one way to
 * say "no manual points".
 */
export type CanonicalRoutingMode = 'manual';

export interface CanonicalNet {
  id: string;
  wireId: string;
  wireType?: string;
  netId?: string;
  color?: string;
  colorCode?: string;
  source: CanonicalNetEndpoint;
  target: CanonicalNetEndpoint;
  routingMode?: CanonicalRoutingMode;
  points?: CanonicalPoint[];
}

export class CanonicalProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalProjectError';
  }
}

/**
 * Serializes the live diagram model into the canonical format.
 *
 * Takes the widened `Node`/`Edge` types the live `NgDiagramModelService`
 * signals actually expose (not the app-specific `Node<AvSchematicNodeData>`
 * union), and narrows with the same type guards the rest of the app uses —
 * so the storage client can pass `modelService.nodes()`/`.edges()` straight
 * through without a cast at the call site.
 *
 * Only fully-connected wire edges (both endpoints resolved to a node + port)
 * are exportable — a dangling/in-progress edge is transient UI state, not
 * part of the persisted project. Non-wire edges (none exist in this app
 * today, but the guard makes that an invariant, not an assumption) are
 * silently skipped rather than persisted.
 */
export function toCanonicalProject(
  nodes: readonly Node[],
  edges: readonly Edge[],
): CanonicalProjectV1 {
  const boards = nodes.filter(isBoardNode).map(toCanonicalBoard);
  const components = nodes.filter(isDeviceNode).map(toCanonicalComponent);
  const nets = edges.filter(isWireEdge).map(toCanonicalNet);
  return { formatVersion: 1, boards, components, nets };
}

/** Rebuilds an ng-diagram node/edge model from a canonical project snapshot. */
export function fromCanonicalProject(project: CanonicalProjectV1): {
  nodes: Node<AvSchematicNodeData>[];
  edges: Edge<WireEdgeData>[];
} {
  const boardNodes = project.boards.map(fromCanonicalBoard);
  const componentNodes = project.components.map(fromCanonicalComponent);
  const edges = project.nets.map(fromCanonicalNet);
  return { nodes: [...boardNodes, ...componentNodes], edges };
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

function toCanonicalBoard(node: Node<BoardNodeData>): CanonicalBoard {
  return {
    id: node.id,
    label: node.data.label,
    rows: node.data.rows,
    cols: node.data.cols,
    pitch: node.data.pitch,
    position: toCanonicalPoint(node.position),
  };
}

function fromCanonicalBoard(board: CanonicalBoard): Node<BoardNodeData> {
  return {
    id: board.id,
    type: NodeTemplateType.BoardNode,
    position: board.position,
    data: {
      type: 'board',
      boardId: board.id,
      label: board.label,
      rows: board.rows,
      cols: board.cols,
      pitch: board.pitch,
    },
  };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function toCanonicalComponent(node: Node<DeviceNodeData>): CanonicalComponent {
  return {
    id: node.id,
    deviceId: node.data.deviceId,
    manufacturer: node.data.manufacturer,
    model: node.data.model,
    category: node.data.category,
    location: node.data.location,
    boardId: node.data.boardId,
    position: toCanonicalPoint(node.position),
    pins: node.data.ports.map((port) => ({
      id: port.id,
      label: port.label,
      direction: port.direction,
      connectorType: port.connectorType,
      hole: port.hole,
    })),
  };
}

function fromCanonicalComponent(component: CanonicalComponent): Node<DeviceNodeData> {
  return {
    id: component.id,
    type: NodeTemplateType.DeviceNode,
    position: component.position,
    data: {
      type: 'device',
      deviceId: component.deviceId,
      manufacturer: component.manufacturer,
      model: component.model,
      category: component.category,
      location: component.location,
      boardId: component.boardId,
      ports: component.pins.map((pin) => ({
        id: pin.id,
        label: pin.label,
        direction: pin.direction,
        connectorType: pin.connectorType,
        hole: pin.hole,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Nets (wire edges)
// ---------------------------------------------------------------------------

function toCanonicalNet(edge: Edge<WireEdgeData>): CanonicalNet {
  if (!edge.source || !edge.sourcePort || !edge.target || !edge.targetPort) {
    throw new CanonicalProjectError(
      `edge "${edge.id}" is not fully connected (dangling edges are not exportable)`,
    );
  }
  return {
    id: edge.id,
    wireId: edge.data.wireId,
    wireType: edge.data.wireType,
    netId: edge.data.netId,
    color: edge.data.color,
    colorCode: edge.data.colorCode,
    source: { componentId: edge.source, pinId: edge.sourcePort },
    target: { componentId: edge.target, pinId: edge.targetPort },
    // Only 'manual' is a meaningful persisted state; anything else (e.g. the
    // 'auto' ng-diagram sometimes sets explicitly) canonicalizes to absence.
    routingMode: edge.routingMode === 'manual' ? 'manual' : undefined,
    points: edge.points?.map(toCanonicalPoint),
  };
}

function fromCanonicalNet(net: CanonicalNet): Edge<WireEdgeData> {
  return {
    id: net.id,
    type: EdgeTemplateType.WireEdge,
    source: net.source.componentId,
    sourcePort: net.source.pinId,
    target: net.target.componentId,
    targetPort: net.target.pinId,
    routingMode: net.routingMode,
    points: net.points,
    data: {
      type: 'wire',
      wireId: net.wireId,
      wireType: net.wireType,
      netId: net.netId,
      color: net.color,
      colorCode: net.colorCode,
    },
  };
}

function toCanonicalPoint(point: Point): CanonicalPoint {
  return { x: point.x, y: point.y };
}

// ---------------------------------------------------------------------------
// Parsing / validation — untrusted JSON (disk, network) -> CanonicalProjectV1.
//
// Mirrors the style of wireviz-import/wireviz-model.ts: every field is
// checked explicitly, every failure throws a labeled CanonicalProjectError,
// no blind casts. Used by both the storage client (after GET) and the
// server (before PUT is written to disk).
// ---------------------------------------------------------------------------

const ALLOWED_ROUTING_MODES: readonly CanonicalRoutingMode[] = ['manual'];
const ALLOWED_PORT_DIRECTIONS: readonly PortDirection[] = ['input', 'output'];

/** Parses and validates an untrusted value as a CanonicalProjectV1. Throws CanonicalProjectError on any mismatch. */
export function parseCanonicalProject(raw: unknown): CanonicalProjectV1 {
  const root = expectRecord(raw, 'project');

  if (root['formatVersion'] !== 1) {
    throw new CanonicalProjectError(
      `project.formatVersion: expected 1, got ${JSON.stringify(root['formatVersion'])}`,
    );
  }

  const boards = expectArray(root['boards'], 'project.boards').map((b, i) =>
    parseCanonicalBoard(b, `project.boards[${i}]`),
  );
  const components = expectArray(root['components'], 'project.components').map((c, i) =>
    parseCanonicalComponent(c, `project.components[${i}]`),
  );
  const nets = expectArray(root['nets'], 'project.nets').map((n, i) =>
    parseCanonicalNet(n, `project.nets[${i}]`),
  );

  const nodeIds = new Set<string>();
  for (const board of boards) {
    if (nodeIds.has(board.id)) {
      throw new CanonicalProjectError(`project.boards: duplicate id "${board.id}"`);
    }
    nodeIds.add(board.id);
  }

  const boardsById = new Map(boards.map((board) => [board.id, board]));

  const componentsById = new Map<string, CanonicalComponent>();
  for (const component of components) {
    if (nodeIds.has(component.id)) {
      throw new CanonicalProjectError(`project.components: duplicate id "${component.id}"`);
    }
    nodeIds.add(component.id);
    componentsById.set(component.id, component);

    if (component.boardId !== undefined && !boardsById.has(component.boardId)) {
      throw new CanonicalProjectError(
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

  const netIds = new Set<string>();
  for (const net of nets) {
    if (netIds.has(net.id)) {
      throw new CanonicalProjectError(`project.nets: duplicate id "${net.id}"`);
    }
    netIds.add(net.id);
    validateEndpoint(net.source, componentsById, `project.nets "${net.id}".source`);
    validateEndpoint(net.target, componentsById, `project.nets "${net.id}".target`);
  }

  return { formatVersion: 1, boards, components, nets };
}

function validateEndpoint(
  endpoint: CanonicalNetEndpoint,
  componentsById: ReadonlyMap<string, CanonicalComponent>,
  label: string,
): void {
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

/**
 * A hole address is only meaningful relative to one specific board, so a
 * component that has any holed pin must declare which board via `boardId`
 * (checked separately, before this runs) — this only checks the address
 * itself fits that board's grid, not merely *some* board in the project.
 */
function validateHoleBounds(
  hole: BoardHole,
  component: CanonicalComponent,
  boardsById: ReadonlyMap<string, CanonicalBoard>,
  label: string,
): void {
  if (component.boardId === undefined) {
    throw new CanonicalProjectError(`${label}.hole: component has a hole but no boardId`);
  }
  // boardId's existence was already validated against boardsById by the caller.
  const board = boardsById.get(component.boardId);
  if (!board || !isHoleInBounds(board, hole)) {
    throw new CanonicalProjectError(
      `${label}.hole: {row: ${hole.row}, col: ${hole.col}} does not fit board "${component.boardId}"`,
    );
  }
}

function parseCanonicalBoard(raw: unknown, label: string): CanonicalBoard {
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

function parseCanonicalComponent(raw: unknown, label: string): CanonicalComponent {
  const obj = expectRecord(raw, label);
  const pins = expectArray(obj['pins'], `${label}.pins`).map((p, i) =>
    parseCanonicalPin(p, `${label}.pins[${i}]`),
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
    boardId: expectOptionalString(obj['boardId'], `${label}.boardId`),
    position: expectPoint(obj['position'], `${label}.position`),
    pins,
  };
}

function parseCanonicalPin(raw: unknown, label: string): CanonicalPin {
  const obj = expectRecord(raw, label);
  return {
    id: expectNonEmptyString(obj['id'], `${label}.id`),
    label: expectString(obj['label'], `${label}.label`),
    direction: expectOneOf(obj['direction'], ALLOWED_PORT_DIRECTIONS, `${label}.direction`),
    connectorType: expectOptionalString(obj['connectorType'], `${label}.connectorType`),
    hole: obj['hole'] === undefined ? undefined : expectHole(obj['hole'], `${label}.hole`),
  };
}

function parseCanonicalNet(raw: unknown, label: string): CanonicalNet {
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

function expectEndpoint(raw: unknown, label: string): CanonicalNetEndpoint {
  const obj = expectRecord(raw, label);
  return {
    componentId: expectNonEmptyString(obj['componentId'], `${label}.componentId`),
    pinId: expectNonEmptyString(obj['pinId'], `${label}.pinId`),
  };
}

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
