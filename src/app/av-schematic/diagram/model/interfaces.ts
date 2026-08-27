import { type JsonValue } from '../../shared/utils/json-value';

export enum NodeTemplateType {
  DeviceNode = 'deviceNode',
  BoardNode = 'boardNode',
  JunctionNode = 'junctionNode',
}

export enum EdgeTemplateType {
  WireEdge = 'wireEdge',
}

export type PortDirection = 'input' | 'output';

/** WireViz pin-level link used when two connector pins mate without a cable. */
export type WireVizLinkStyle = '--' | '<--' | '<-->' | '-->';

/**
 * A JSON-safe value preserved verbatim from an imported document.
 *
 * An alias of the shared `JsonValue` -- the same underlying type the YAML
 * subset parser uses -- so a field read from a document and a field stored in
 * the model stay assignable to each other. The alias exists to name the
 * *role*: "carried without being interpreted", which is not a YAML concern.
 */
export type PreservedValue = JsonValue;

/** Uninterpreted fields kept so a round-trip can write them back unchanged. */
export type PreservedFields = Readonly<Record<string, PreservedValue>>;

/**
 * A hole address on a physical board's grid (0-indexed, row then column).
 * Optional on `DevicePort` -- only ports that are meant to align with a
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
  /** Original WireViz pin designator, kept independently from the editor label/id. */
  wirevizDesignator?: string;
  /** Original positional `pinlabels` value, when the source document declared one. */
  wirevizLabel?: string;
  hole?: BoardHole;
}

/** WireViz connector metadata that is orthogonal to the editor's own device fields. */
export interface WireVizConnectorMetadata {
  /** Name this element takes as a WireViz `connectors.<name>` entry. */
  wirevizName?: string;
  /** WireViz connector family. */
  wirevizType?: string;
  /** WireViz connector variant. */
  wirevizSubtype?: string;
  wirevizColor?: string;
  wirevizManufacturer?: string;
  wirevizMpn?: string;
  wirevizStyle?: string;
  wirevizShowName?: boolean;
  /** WireViz connector keys this codebase does not interpret. */
  wirevizExtras?: PreservedFields;
}

export interface DeviceNodeData extends WireVizConnectorMetadata {
  type: 'device';
  deviceId: string;
  manufacturer: string;
  model: string;
  category?: string;
  location?: string;
  /**
   * The physical board this device's holes are addressed against (a
   * `BoardNodeData.boardId`). Required for validation whenever any of this
   * device's `ports` carries a `hole` -- a hole address is only meaningful
   * relative to one specific board's grid. Devices with no holed ports may
   * omit it.
   */
  boardId?: string;
  notes?: string;
  ports: DevicePort[];
}

/**
 * A physical board with an addressable rows x cols hole grid (e.g. "placa A",
 * 6 x 11). Rendered as its own node so it shares the single ng-diagram
 * canvas/coordinate plane with devices and wires -- not a second canvas, not a
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

/**
 * `junction` is a splice/ferrule: one electrical point where several
 * conductors of the same net meet. `rail` is the same thing drawn as a bus
 * bar with several physical tap positions -- still a *single* electrical
 * point. The distinction is deliberately visual, because that is the only
 * honest way to round-trip it: the editor rail has no distinct named pin per
 * visual tap, so WireViz's one-pin `style: simple` connector is its lossless
 * form. WireViz `loops` are modeled separately when a real multi-pin connector
 * declares internal connectivity. Keeping the rail electrically single-point
 * means export -> import never splits it into separate nets.
 */
export type JunctionKind = 'junction' | 'rail';

/**
 * An explicit junction / rail / fan-out point on the canvas.
 *
 * Fan-out is not a node type: it is what a junction (or any pin) does when
 * more than one conductor of the same net lands on it. `netId`/`netName`
 * below are a denormalized label of the net the junction currently belongs
 * to, refreshed whenever the project is (de)serialized -- the authoritative
 * net membership always comes from the conductor graph
 * (`model/net-grouping.ts`).
 */
export interface JunctionNodeData extends WireVizConnectorMetadata {
  type: 'junction';
  junctionId: string;
  label: string;
  kind: JunctionKind;
  /**
   * Number of visual tap positions to render (>= 1). Purely geometric: every
   * tap is the same electrical point. Conductors record which tap they land
   * on in the project's layout section, never in its electrical section.
   */
  taps: number;
  notes?: string;
  /** Denormalized net label, for on-canvas inspection. Not authoritative. */
  netId?: string;
  netName?: string;
  boardId?: string;
  hole?: BoardHole;
}

/**
 * One physical conductor, used by the canvas and the properties sidebar.
 *
 * Identity, inspection metadata and the effective render color are local to
 * this edge. The canonical v2 serializer writes them onto the matching
 * `CanonicalConductor`, writes routing onto its `CanonicalConductorLayout`,
 * and reconciles the color with the referenced cable slot for WireViz. Cable
 * attributes remain an export/import representation without flattening a net.
 */
export interface WireEdgeData {
  type: 'wire';
  wireId: string;
  /** 1-based wire index within `wireId`'s cable. Absent means wire 1. */
  wireIndex?: number;
  /** Full imported cable cardinality, including currently unused conductors. */
  cableWireCount?: number;
  /** Full imported color list, including colors of currently unused conductors. */
  cableColors?: string[];
  /** Full imported wire-label list, including currently unused conductors. */
  cableWireLabels?: string[];
  wireType?: string;
  /** WireViz arrow used by a direct pin-to-pin link; absent defaults to `--`. */
  wirevizLink?: WireVizLinkStyle;
  /** True when this edge represents a WireViz connector `loops` pair. */
  wirevizLoop?: boolean;
  /** Electrical net this conductor belongs to. Derived from connectivity, not authored. */
  netId?: string;
  netName?: string;
  /** Resolved CSS color for the wire stroke. Exact six-digit RGB is also valid WireViz. */
  color?: string;
  /** WireViz color abbreviation (e.g. "YE") when the color has one. */
  colorCode?: string;
  /** Cross-section / gauge inspected for this conductor. */
  gauge?: string;
  /** Physical length inspected for this conductor. */
  length?: string;
  /** Free-form observation for this conductor. */
  notes?: string;
  /** WireViz `cables.<name>.type`. */
  cableType?: string;
  manufacturer?: string;
  mpn?: string;
  /** WireViz `cables.<name>.color_code` (the color *standard*, e.g. "DIN"). */
  cableColorCode?: string;
  /** WireViz cable keys this codebase does not interpret; re-emitted unchanged on export. */
  cableExtras?: PreservedFields;
}

export type AvSchematicNodeData = DeviceNodeData | BoardNodeData | JunctionNodeData;
export type AvSchematicEdgeData = WireEdgeData;
