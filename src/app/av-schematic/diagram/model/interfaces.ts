export enum NodeTemplateType {
  DeviceNode = 'deviceNode',
  BoardNode = 'boardNode',
}

export enum EdgeTemplateType {
  WireEdge = 'wireEdge',
}

export type PortDirection = 'input' | 'output';

/**
 * A hole address on a physical board's grid (0-indexed, row then column).
 * Optional on `DevicePort` — only ports that are meant to align with a
 * physical board's hole grid (e.g. a header pin plugged into board A) carry
 * one. Purely descriptive addressing metadata in this slice: the device-node
 * template still lays ports out in the baseline two-column card, it does not
 * yet project `hole` into pixel space. See docs/wiring-tracer-bullet.md.
 */
export interface BoardHole {
  row: number;
  col: number;
}

export interface DevicePort {
  id: string;
  label: string;
  direction: PortDirection;
  connectorType?: string;
  hole?: BoardHole;
}

export interface DeviceNodeData {
  type: 'device';
  deviceId: string;
  manufacturer: string;
  model: string;
  category?: string;
  location?: string;
  /**
   * The physical board this device's holes are addressed against (a
   * `BoardNodeData.boardId`). Required for validation whenever any of this
   * device's `ports` carries a `hole` — a hole address is only meaningful
   * relative to one specific board's grid. Devices with no holed ports may
   * omit it.
   */
  boardId?: string;
  ports: DevicePort[];
}

/**
 * A physical board with an addressable rows x cols hole grid (e.g. "placa A",
 * 6 x 11). Rendered as its own node so it shares the single ng-diagram
 * canvas/coordinate plane with devices and wires — not a second canvas, not a
 * background image. Not editable via the properties sidebar in this slice
 * (no sidebar form is wired up for `board` nodes yet).
 */
export interface BoardNodeData {
  type: 'board';
  boardId: string;
  label: string;
  rows: number;
  cols: number;
  /** Distance between adjacent holes, in diagram px (both axes). */
  pitch: number;
}

export interface WireEdgeData {
  type: 'wire';
  wireId: string;
  wireType?: string;
  /** Electrical net this wire belongs to (e.g. from a WireViz import). */
  netId?: string;
  /** Resolved CSS color for the wire stroke, e.g. from a WireViz color code. */
  color?: string;
  /** Original WireViz 2-letter color code the wire was imported with (e.g. "YE"). */
  colorCode?: string;
}

export type AvSchematicNodeData = DeviceNodeData | BoardNodeData;
export type AvSchematicEdgeData = WireEdgeData;
