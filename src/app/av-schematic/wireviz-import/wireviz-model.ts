import { type WireVizLinkStyle } from '../diagram/model/interfaces';
import {
  isDangerousObjectKey,
  WIREVIZ_CABLE_CANONICAL_KEYS,
  WIREVIZ_CONNECTOR_CANONICAL_KEYS,
} from '../diagram/model/wireviz-schema-keys';
import { type WireVizCompatibilityReport, WireVizReportBuilder } from './wireviz-report';
import { type YamlValue } from './wireviz-yaml';

/**
 * Domain types and validation for the WireViz subset this project supports.
 *
 * Issue #2 widened the subset the issue #1 tracer accepted. What used to be
 * rejected outright and is now understood:
 *
 *   - a connection set with any number of references, not exactly three;
 *   - several pins per connector reference and several wires per cable
 *     reference (parallel connections, zipped position by position);
 *   - the *same* pin referenced from more than one connection set — the
 *     legitimate multi-drop / fan-out case, which is how WireViz expresses a
 *     net touching three or more endpoints. It is no longer an "invalid port
 *     reuse" error;
 *   - connectors declared with `pincount` instead of an explicit `pins` list;
 *   - `style: simple` connectors, imported as explicit junction elements;
 *   - direct connector-to-connector links through WireViz pin-level arrows;
 *   - connector variants (`subtype`) and the cable attributes the round-trip
 *     has to preserve (`gauge`, `length`, `notes`).
 *
 * Anything this parser does not interpret is preserved verbatim in an
 * `extras` bag and recorded in the compatibility report. Connector/cable
 * extras have a canonical home and are re-emitted; document-level extras
 * remain in the import result and report only. Structural violations (an
 * undeclared pin, a wire index out of range, a cable next to a cable) still
 * throw — a broken document must not degrade quietly into a smaller netlist.
 *
 * Clean-room implementation: nothing here was copied or adapted from
 * Garth-42/WireForm (GPL-3.0) or from the Python `wireviz` project. See
 * docs/wireviz-round-trip.md for the supported subset and
 * docs/license-matrix.md for why it was written from scratch.
 */

/** Verbatim, uninterpreted YAML values, keyed by their original key. */
export type WireVizFieldBag = Readonly<Record<string, YamlValue>>;

export interface WireVizConnector {
  name: string;
  /** Free-form connector family, e.g. "Molex KK 254". */
  type?: string;
  /** Connector variant within a family — the WireViz `subtype` field. */
  subtype?: string;
  /** Pin designators, in declaration order. Always populated (generated from `pincount` when needed). */
  pins: string[];
  /** Optional human labels, positionally aligned with `pins`. */
  pinLabels?: string[];
  /** Internal shorts declared by `loops`, resolved to unambiguous pin designators. */
  loops: [string, string][];
  notes?: string;
  color?: string;
  manufacturer?: string;
  mpn?: string;
  /** WireViz rendering style. A one-pin `simple` connector can represent a ferrule/splice. */
  style?: string;
  showName?: boolean;
  /** True only for a one-pin `style: simple` connector. */
  isJunction: boolean;
  extras: WireVizFieldBag;
}

export interface WireVizCable {
  name: string;
  /** Number of conductors. Derived from `wirecount`, or from `colors.length`. */
  wireCount: number;
  /** Effective color codes aligned with wires 1..wireCount; empty when WireViz must generate them. */
  colors: string[];
  /** Positional `wirelabels`, aligned with wires 1..wireCount. */
  wireLabels?: string[];
  gauge?: string;
  length?: string;
  notes?: string;
  colorCode?: string;
  type?: string;
  manufacturer?: string;
  mpn?: string;
  extras: WireVizFieldBag;
}

export interface WireVizPinRef {
  connector: string;
  pin: string;
}

export interface WireVizWireRef {
  cable: string;
  /** 1-based, matching WireViz's own wire numbering. */
  wireIndex: number;
}

/**
 * One physical conductor between two pins, optionally through one wire of a
 * cable. `from`/`to` carry no electrical meaning beyond identifying the two
 * ends — every comparison in this codebase treats the pair as unordered.
 */
export interface WireVizConductor {
  kind: 'connection' | 'loop';
  /** Index of the `connections` set this conductor came from, for error/report paths. */
  setIndex: number;
  from: WireVizPinRef;
  to: WireVizPinRef;
  wire?: WireVizWireRef;
  /** Pin-level WireViz arrow when the conductor has no cable. */
  link?: WireVizLinkStyle;
}

export interface WireVizDocument {
  connectors: WireVizConnector[];
  cables: WireVizCable[];
  conductors: WireVizConductor[];
  /** Top-level keys that are neither `connectors`, `cables` nor `connections`. */
  extras: WireVizFieldBag;
  report: WireVizCompatibilityReport;
}

export class WireVizModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WireVizModelError';
  }
}

const CONNECTOR_KNOWN_KEYS = WIREVIZ_CONNECTOR_CANONICAL_KEYS;

const CABLE_KNOWN_KEYS = WIREVIZ_CABLE_CANONICAL_KEYS;

const DOCUMENT_KNOWN_KEYS = new Set(['connectors', 'cables', 'connections']);

/**
 * Recognized cable keys whose *meaning* this codebase does not model. They
 * are preserved verbatim and re-emitted, but a warning says so rather than
 * letting a reader assume shield/bundle behaviour was honoured.
 */
const CABLE_UNMODELED_KEYS = ['shield', 'category'] as const;

export function parseWireVizDocument(raw: YamlValue): WireVizDocument {
  const report = new WireVizReportBuilder();
  const root = expectObject(raw, 'document root');

  const connectors = parseConnectors(root['connectors'], report);
  const cables = parseCables(root['cables'], report);
  assertDisjointNames(connectors, cables);
  const conductors = [
    ...parseConnectorLoops(connectors, report),
    ...parseConnections(root['connections'], connectors, cables, report),
  ];

  const extras = collectExtras(root, DOCUMENT_KNOWN_KEYS, '', report, false);

  return { connectors, cables, conductors, extras, report: report.build() };
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

function parseConnectors(
  raw: YamlValue | undefined,
  report: WireVizReportBuilder,
): WireVizConnector[] {
  const obj = expectObject(raw, 'connectors');
  return Object.entries(obj).map(([name, value]) => parseConnector(name, value, report));
}

function parseConnector(
  name: string,
  value: YamlValue,
  report: WireVizReportBuilder,
): WireVizConnector {
  const path = `connectors.${name}`;
  const entry = expectObject(value, path);

  const pinLabels =
    entry['pinlabels'] === undefined
      ? undefined
      : expectStringArray(entry['pinlabels'], `${path}.pinlabels`);
  const pins = resolvePins(entry, name, path, report, pinLabels);

  if (pinLabels && pinLabels.length !== pins.length) {
    throw new WireVizModelError(
      `${path}.pinlabels: has ${pinLabels.length} entries but the connector declares ${pins.length} pins`,
    );
  }

  const style = optionalString(entry['style'], `${path}.style`);
  const loops = parseLoops(entry['loops'], { name, pins, pinLabels }, path);
  const isJunction = style === 'simple' && pins.length === 1;
  if (isJunction) {
    report.info(
      'junction-detected',
      path,
      `O conector "${name}" declara style: simple com um pino e foi importado como junção explícita.`,
    );
  } else if (style === 'simple') {
    report.warn(
      'unsupported-semantics',
      `${path}.style`,
      `O conector "${name}" usa style: simple, mas possui ${pins.length} pinos ` +
        'eletricamente distintos; foi mantido como componente para não curto-circuitá-los.',
    );
  } else if (style !== undefined) {
    report.warn(
      'unsupported-semantics',
      `${path}.style`,
      `O style "${style}" foi preservado, mas não altera a semântica elétrica nesta implementação.`,
    );
  }

  return {
    name,
    type: optionalString(entry['type'], `${path}.type`),
    subtype: optionalString(entry['subtype'], `${path}.subtype`),
    pins,
    pinLabels,
    loops,
    notes: optionalString(entry['notes'], `${path}.notes`),
    color: optionalString(entry['color'], `${path}.color`),
    manufacturer: optionalString(entry['manufacturer'], `${path}.manufacturer`),
    mpn: optionalString(entry['mpn'], `${path}.mpn`),
    style,
    showName: optionalBoolean(entry['show_name'], `${path}.show_name`),
    isJunction,
    extras: collectExtras(entry, CONNECTOR_KNOWN_KEYS, path, report),
  };
}

/**
 * WireViz lets a connector declare `pins` explicitly, or infer numbered
 * designators from `pincount` / `pinlabels`. All forms are supported; an
 * inferred list is reported so a reader knows it was not in the document.
 */
function resolvePins(
  entry: Record<string, YamlValue>,
  name: string,
  path: string,
  report: WireVizReportBuilder,
  pinLabels: readonly string[] | undefined,
): string[] {
  const declaredCount =
    entry['pincount'] === undefined
      ? undefined
      : expectPositiveInteger(entry['pincount'], `${path}.pincount`);

  if (entry['pins'] !== undefined) {
    const pins = expectStringArray(entry['pins'], `${path}.pins`);
    if (pins.length === 0) {
      throw new WireVizModelError(`${path}.pins must not be empty`);
    }
    assertUnique(pins, `${path}.pins`);
    if (declaredCount !== undefined && declaredCount !== pins.length) {
      throw new WireVizModelError(
        `${path}.pincount: declares ${declaredCount}, but pins has ${pins.length} entries`,
      );
    }
    return pins;
  }

  const count = declaredCount ?? pinLabels?.length;
  if (count !== undefined && count > 0) {
    report.info(
      'inferred-pins',
      declaredCount === undefined ? `${path}.pinlabels` : `${path}.pincount`,
      `O conector "${name}" não lista "pins"; os designadores 1..${count} foram ` +
        `gerados a partir de ${declaredCount === undefined ? 'pinlabels' : 'pincount'}.`,
    );
    return Array.from({ length: count }, (_, i) => String(i + 1));
  }

  throw new WireVizModelError(`${path}: expected "pins", "pincount" or "pinlabels"`);
}

function parseLoops(
  raw: YamlValue | undefined,
  connector: Pick<WireVizConnector, 'name' | 'pins' | 'pinLabels'>,
  path: string,
): [string, string][] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new WireVizModelError(`${path}.loops: expected a list of two-pin pairs`);
  }

  const seen = new Set<string>();
  return raw.map((value, index) => {
    const label = `${path}.loops[${index}]`;
    if (!Array.isArray(value) || value.length !== 2) {
      throw new WireVizModelError(`${label}: expected exactly two pins`);
    }
    const from = resolvePin(connector, expectScalarString(value[0], `${label}[0]`), label);
    const to = resolvePin(connector, expectScalarString(value[1], `${label}[1]`), label);
    if (from === to) {
      throw new WireVizModelError(`${label}: both ends resolve to pin "${from}"`);
    }
    const key = [from, to].sort().join('\u0000');
    if (seen.has(key)) {
      throw new WireVizModelError(`${label}: duplicate loop between "${from}" and "${to}"`);
    }
    seen.add(key);
    return [from, to] as [string, string];
  });
}

function parseConnectorLoops(
  connectors: readonly WireVizConnector[],
  report: WireVizReportBuilder,
): WireVizConductor[] {
  const conductors: WireVizConductor[] = [];
  for (const connector of connectors) {
    connector.loops.forEach(([from, to], index) => {
      conductors.push({
        kind: 'loop',
        setIndex: -1,
        from: { connector: connector.name, pin: from },
        to: { connector: connector.name, pin: to },
      });
      report.info(
        'loop-detected',
        `connectors.${connector.name}.loops[${index}]`,
        `Loop interno entre os pinos "${from}" e "${to}" importado como conectividade elétrica do conector.`,
      );
    });
  }
  return conductors;
}

function assertDisjointNames(
  connectors: readonly WireVizConnector[],
  cables: readonly WireVizCable[],
): void {
  const connectorNames = new Set(connectors.map((connector) => connector.name));
  for (const cable of cables) {
    if (connectorNames.has(cable.name)) {
      throw new WireVizModelError(
        `"${cable.name}" is declared as both connector and cable; connection references would be ambiguous`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cables
// ---------------------------------------------------------------------------

function parseCables(raw: YamlValue | undefined, report: WireVizReportBuilder): WireVizCable[] {
  if (raw === undefined) return [];
  const obj = expectObject(raw, 'cables');
  return Object.entries(obj).map(([name, value]) => parseCable(name, value, report));
}

function parseCable(name: string, value: YamlValue, report: WireVizReportBuilder): WireVizCable {
  const path = `cables.${name}`;
  const entry = expectObject(value, path);

  const sourceColors =
    entry['colors'] === undefined ? [] : expectStringArray(entry['colors'], `${path}.colors`);
  const declaredCount =
    entry['wirecount'] === undefined
      ? undefined
      : expectPositiveInteger(entry['wirecount'], `${path}.wirecount`);

  const wireCount = declaredCount ?? sourceColors.length;
  if (wireCount === 0) {
    throw new WireVizModelError(`${path}: expected either "colors" or "wirecount"`);
  }
  const colors =
    declaredCount !== undefined && sourceColors.length > 0
      ? Array.from({ length: wireCount }, (_, index) => sourceColors[index % sourceColors.length])
      : sourceColors;
  if (colors.length !== sourceColors.length) {
    report.info(
      'colors-normalized',
      `${path}.colors`,
      `A lista de ${sourceColors.length} cor(es) foi ` +
        `${sourceColors.length < wireCount ? 'repetida' : 'truncada'} para os ${wireCount} ` +
        'condutores declarados, preservando a semântica efetiva do WireViz.',
    );
  }

  const wireLabels =
    entry['wirelabels'] === undefined
      ? undefined
      : expectStringArray(entry['wirelabels'], `${path}.wirelabels`);
  if (wireLabels && wireLabels.length !== wireCount) {
    throw new WireVizModelError(
      `${path}.wirelabels: has ${wireLabels.length} entries but the cable declares ${wireCount} wires`,
    );
  }

  for (const key of CABLE_UNMODELED_KEYS) {
    if (entry[key] !== undefined) {
      report.warn(
        'unsupported-semantics',
        `${path}.${key}`,
        `"${key}" é preservado no projeto e reemitido, mas sua semântica não é modelada nesta implementação.`,
      );
    }
  }

  return {
    name,
    wireCount,
    colors,
    wireLabels,
    gauge: optionalScalarString(entry['gauge'], `${path}.gauge`),
    length: optionalScalarString(entry['length'], `${path}.length`),
    notes: optionalString(entry['notes'], `${path}.notes`),
    colorCode: optionalString(entry['color_code'], `${path}.color_code`),
    type: optionalString(entry['type'], `${path}.type`),
    manufacturer: optionalString(entry['manufacturer'], `${path}.manufacturer`),
    mpn: optionalString(entry['mpn'], `${path}.mpn`),
    extras: collectExtras(entry, CABLE_KNOWN_KEYS, path, report),
  };
}

// ---------------------------------------------------------------------------
// Connections -> conductors
// ---------------------------------------------------------------------------

function parseConnections(
  raw: YamlValue | undefined,
  connectors: readonly WireVizConnector[],
  cables: readonly WireVizCable[],
  report: WireVizReportBuilder,
): WireVizConductor[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new WireVizModelError('connections must be a list of connection sets');
  }

  const connectorsByName = new Map(connectors.map((c) => [c.name, c]));
  const cablesByName = new Map(cables.map((c) => [c.name, c]));

  const conductors: WireVizConductor[] = [];
  const seen = new Map<string, number>();

  raw.forEach((entry, index) => {
    for (const conductor of parseConnectionSet(
      entry,
      index,
      connectorsByName,
      cablesByName,
      report,
    )) {
      const key = conductorKey(conductor);
      const firstSet = seen.get(key);
      if (firstSet !== undefined) {
        report.info(
          'duplicate-conductor',
          `connections[${index}]`,
          `Condutor idêntico já declarado em connections[${firstSet}]; foi mantida uma única ocorrência.`,
        );
        continue;
      }
      seen.set(key, index);
      conductors.push(conductor);
    }
  });

  return conductors;
}

/** Order-independent identity of a conductor: unordered endpoint pair plus the wire it runs through. */
function conductorKey(conductor: WireVizConductor): string {
  const a = `${conductor.from.connector}\u0000${conductor.from.pin}`;
  const b = `${conductor.to.connector}\u0000${conductor.to.pin}`;
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const path =
    conductor.kind === 'loop'
      ? 'loop'
      : conductor.wire
        ? `wire\u0000${conductor.wire.cable}\u0000${conductor.wire.wireIndex}`
        : `link\u0000${normalizeLinkDirection(conductor.link ?? '--', a <= b)}`;
  return `${lo}\u0001${hi}\u0001${path}`;
}

function normalizeLinkDirection(
  link: WireVizLinkStyle,
  followsSortedEndpoints: boolean,
): WireVizLinkStyle {
  if (followsSortedEndpoints) return link;
  if (link === '-->') return '<--';
  if (link === '<--') return '-->';
  return link;
}

type Stop =
  | { kind: 'pin'; ref: WireVizPinRef }
  | { kind: 'wire'; ref: WireVizWireRef }
  | { kind: 'link'; style: WireVizLinkStyle };

const PIN_LINKS = new Set<WireVizLinkStyle>(['--', '<--', '<-->', '-->']);

function parseConnectionSet(
  raw: YamlValue,
  index: number,
  connectorsByName: ReadonlyMap<string, WireVizConnector>,
  cablesByName: ReadonlyMap<string, WireVizCable>,
  report: WireVizReportBuilder,
): WireVizConductor[] {
  const label = `connections[${index}]`;
  if (!Array.isArray(raw)) {
    throw new WireVizModelError(`${label}: expected a list of connector/cable references`);
  }
  if (raw.length === 0) {
    throw new WireVizModelError(`${label}: a connection set needs at least one reference`);
  }

  if (
    raw.length === 1 &&
    typeof raw[0] === 'string' &&
    (connectorsByName.has(raw[0]) || cablesByName.has(raw[0]))
  ) {
    report.info(
      'unconnected-reference',
      label,
      `O elemento "${raw[0]}" foi declarado como não conectado e permanece no projeto.`,
    );
    return [];
  }

  const refs = raw.map((item, i) => parseConnectionRef(item, `${label}[${i}]`, connectorsByName));

  // WireViz zips the references of a set position by position: entry k of
  // every reference belongs to the same conductor. WireViz requires every
  // mapping/list reference to have exactly the same width. A scalar arrow
  // is the only supported broadcastable item; bare
  // simple connectors that imply autogenerated instances are deliberately
  // rejected for parallel sets because this importer does not mint hidden
  // instances whose identity depends on textual order.
  const width = Math.max(...refs.map((ref) => ref.values.length));
  for (const ref of refs) {
    if (ref.values.length !== width && !(ref.kind === 'link' && ref.values.length === 1)) {
      throw new WireVizModelError(
        `${label}: reference "${ref.key}" has ${ref.values.length} entries, expected ${width}`,
      );
    }
  }

  const conductors: WireVizConductor[] = [];
  for (let position = 0; position < width; position++) {
    const stops = refs.map((ref) =>
      resolveStop(ref, position, connectorsByName, cablesByName, `${label}[pos ${position}]`),
    );
    const derived = walkStops(stops, index, `${label}[pos ${position}]`);
    if (derived.length === 0) {
      report.info(
        'unconnected-reference',
        `${label}[pos ${position}]`,
        'Elemento sem ligação preservado no projeto, sem condutor a criar.',
      );
    }
    conductors.push(...derived);
  }
  return conductors;
}

/**
 * Walks the resolved references of one zip position left to right, emitting
 * one conductor per pair of consecutive pins. A cable reference between two
 * pins becomes that conductor's wire; a pin-level arrow between two pins
 * becomes a direct link without a cable.
 */
function walkStops(stops: readonly Stop[], setIndex: number, label: string): WireVizConductor[] {
  const conductors: WireVizConductor[] = [];
  let previousPin: WireVizPinRef | undefined;
  let pending:
    | { kind: 'wire'; ref: WireVizWireRef }
    | { kind: 'link'; style: WireVizLinkStyle }
    | undefined;

  for (const stop of stops) {
    if (stop.kind !== 'pin') {
      if (previousPin === undefined) {
        throw new WireVizModelError(
          `${label}: a connection set cannot start with a cable or arrow`,
        );
      }
      if (pending !== undefined) {
        throw new WireVizModelError(
          `${label}: cable/arrow references must alternate with connectors`,
        );
      }
      pending = stop;
      continue;
    }

    if (previousPin !== undefined) {
      if (pending === undefined) {
        throw new WireVizModelError(
          `${label}: adjacent connectors need a cable or a pin-level WireViz arrow between them`,
        );
      }
      conductors.push({
        kind: 'connection',
        setIndex,
        from: previousPin,
        to: stop.ref,
        wire: pending.kind === 'wire' ? pending.ref : undefined,
        link: pending.kind === 'link' ? pending.style : undefined,
      });
      pending = undefined;
    }
    previousPin = stop.ref;
  }

  if (pending !== undefined) {
    throw new WireVizModelError(`${label}: a connection set cannot end with a cable or arrow`);
  }
  if (conductors.length === 0 && stops.length !== 1) {
    throw new WireVizModelError(`${label}: no conductor could be derived from this connection set`);
  }
  return conductors;
}

function resolveStop(
  ref: ConnectionRef,
  position: number,
  connectorsByName: ReadonlyMap<string, WireVizConnector>,
  cablesByName: ReadonlyMap<string, WireVizCable>,
  label: string,
): Stop {
  if (ref.kind === 'link') {
    return { kind: 'link', style: ref.values[ref.values.length === 1 ? 0 : position] };
  }

  const designator = expectScalarString(
    ref.values[ref.values.length === 1 ? 0 : position],
    `${label}: "${ref.key}" entry`,
  );

  const connector = connectorsByName.get(ref.key);
  if (connector) {
    const pin = resolvePin(connector, designator, label);
    return { kind: 'pin', ref: { connector: connector.name, pin } };
  }

  const cable = cablesByName.get(ref.key);
  if (cable) {
    const wireIndex = resolveWire(cable, designator, label);
    return { kind: 'wire', ref: { cable: cable.name, wireIndex } };
  }

  throw new WireVizModelError(`${label}: "${ref.key}" is neither a declared connector nor cable`);
}

/** Resolves a pin id/label only when the alias identifies exactly one pin. */
function resolvePin(
  connector: Pick<WireVizConnector, 'name' | 'pins' | 'pinLabels'>,
  designator: string,
  label: string,
): string {
  const matches = new Set<number>();
  connector.pins.forEach((pin, index) => {
    if (pin === designator) matches.add(index);
  });
  connector.pinLabels?.forEach((pinLabel, index) => {
    if (pinLabel === designator) matches.add(index);
  });

  if (matches.size > 1) {
    throw new WireVizModelError(
      `${label}: connector "${connector.name}" pin reference "${designator}" is ambiguous`,
    );
  }
  const match = [...matches][0];
  if (match !== undefined) return connector.pins[match];

  throw new WireVizModelError(
    `${label}: connector "${connector.name}" has no pin "${designator}" ` +
      `(declared pins: ${connector.pins.join(', ')})`,
  );
}

/** Resolves cable wire number, wirelabel or color, rejecting every ambiguous alias. */
function resolveWire(cable: WireVizCable, designator: string, label: string): number {
  const matches = new Set<number>();
  const numeric = Number(designator);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= cable.wireCount) {
    matches.add(numeric);
  }

  cable.wireLabels?.forEach((wireLabel, index) => {
    if (wireLabel !== '' && wireLabel === designator) matches.add(index + 1);
  });
  cable.colors.forEach((color, index) => {
    if (color !== '' && color.toLowerCase() === designator.toLowerCase()) matches.add(index + 1);
  });

  if (matches.size > 1) {
    throw new WireVizModelError(
      `${label}: cable "${cable.name}" wire reference "${designator}" is ambiguous`,
    );
  }
  const match = [...matches][0];
  if (match !== undefined) return match;

  throw new WireVizModelError(
    `${label}: cable "${cable.name}" has no wire number, wirelabel or unambiguous color "${designator}"`,
  );
}

type ConnectionRef = NamedConnectionRef | LinkConnectionRef;

interface NamedConnectionRef {
  kind: 'named';
  key: string;
  values: YamlValue[];
}

interface LinkConnectionRef {
  kind: 'link';
  key: 'arrow';
  values: WireVizLinkStyle[];
}

function parseConnectionRef(
  raw: YamlValue,
  label: string,
  connectorsByName: ReadonlyMap<string, WireVizConnector>,
): ConnectionRef {
  if (typeof raw === 'string') {
    if (isPinLink(raw)) return { kind: 'link', key: 'arrow', values: [raw] };
    const connector = connectorsByName.get(raw);
    if (connector?.isJunction) {
      return { kind: 'named', key: raw, values: [connector.pins[0]] };
    }
    throw new WireVizModelError(
      `${label}: bare references are supported only for one-pin style: simple connectors or pin-level arrows`,
    );
  }

  if (Array.isArray(raw)) {
    if (raw.length > 0 && raw.every(isPinLink)) {
      return { kind: 'link', key: 'arrow', values: raw };
    }
    throw new WireVizModelError(`${label}: unsupported list reference (expected WireViz arrows)`);
  }

  const obj = expectObject(raw, label);
  const keys = Object.keys(obj);
  if (keys.length !== 1) {
    throw new WireVizModelError(`${label}: expected a single-key mapping, got ${keys.length} keys`);
  }
  const key = keys[0];
  const value = obj[key];
  const values = Array.isArray(value) ? value : [value];
  if (values.length === 0) {
    throw new WireVizModelError(`${label}.${key}: expected at least one pin/wire reference`);
  }
  return {
    kind: 'named',
    key,
    values: values.flatMap((item) => expandRange(item)),
  };
}

function isPinLink(value: YamlValue): value is WireVizLinkStyle {
  return typeof value === 'string' && PIN_LINKS.has(value as WireVizLinkStyle);
}

/**
 * Expands WireViz's `N-M` shorthand inside a reference list (`X1: [1-4]`),
 * including descending ranges such as `9-7`.
 */
function expandRange(raw: YamlValue): YamlValue[] {
  if (typeof raw !== 'string') return [raw];
  const match = /^(\d+)-(\d+)$/.exec(raw.trim());
  if (!match) return [raw];

  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  const step = end >= start ? 1 : -1;
  return Array.from({ length: Math.abs(end - start) + 1 }, (_, i) => String(start + i * step));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Every key of `entry` that is not in `known`, kept verbatim plus one report
 * entry so it stays visible. `reemitted` distinguishes connector/cable bags
 * from document-level fields that have no canonical project owner.
 */
function collectExtras(
  entry: Record<string, YamlValue>,
  known: ReadonlySet<string>,
  path: string,
  report: WireVizReportBuilder,
  reemitted = true,
): WireVizFieldBag {
  const extras: Record<string, YamlValue> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (known.has(key)) continue;
    if (isDangerousObjectKey(key)) {
      throw new WireVizModelError(
        `${path === '' ? key : `${path}.${key}`}: dangerous mapping key is not allowed`,
      );
    }
    assertSafeYamlValue(value, path === '' ? key : `${path}.${key}`);
    extras[key] = value;
    report.warn(
      'unknown-field',
      path === '' ? key : `${path}.${key}`,
      reemitted
        ? 'Campo não interpretado por esta implementação; preservado no projeto e ' +
            'reemitido na exportação.'
        : 'Campo global não interpretado; permanece no documento importado e no ' +
            'relatório, mas não é incorporado ao projeto.',
    );
  }
  return extras;
}

function assertSafeYamlValue(value: YamlValue, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertSafeYamlValue(item, `${label}[${index}]`);
    });
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    if (isDangerousObjectKey(key)) {
      throw new WireVizModelError(`${label}.${key}: dangerous mapping key is not allowed`);
    }
    assertSafeYamlValue(nested, `${label}.${key}`);
  }
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new WireVizModelError(`${label}: duplicate entry "${value}"`);
    }
    seen.add(value);
  }
}

function expectObject(raw: YamlValue | undefined, label: string): Record<string, YamlValue> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new WireVizModelError(`${label}: expected a mapping`);
  }
  for (const key of Object.keys(raw)) {
    if (isDangerousObjectKey(key)) {
      throw new WireVizModelError(`${label}.${key}: dangerous mapping key is not allowed`);
    }
  }
  return raw;
}

function expectStringArray(raw: YamlValue | undefined, label: string): string[] {
  if (!Array.isArray(raw)) {
    throw new WireVizModelError(`${label}: expected a list`);
  }
  return raw.map((value, index) => expectScalarString(value, `${label}[${index}]`));
}

function expectScalarString(raw: YamlValue | undefined, label: string): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new WireVizModelError(`${label}: expected a string or number`);
  }
  return String(raw);
}

function expectPositiveInteger(raw: YamlValue | undefined, label: string): number {
  const value = typeof raw === 'number' ? raw : Number(expectScalarString(raw, label));
  if (!Number.isInteger(value) || value <= 0) {
    throw new WireVizModelError(
      `${label}: expected a positive integer, got ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function optionalString(raw: YamlValue | undefined, label: string): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    throw new WireVizModelError(`${label}: expected a string`);
  }
  return raw;
}

function optionalBoolean(raw: YamlValue | undefined, label: string): boolean | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'boolean') {
    throw new WireVizModelError(`${label}: expected a boolean`);
  }
  return raw;
}

/** Like `optionalString`, but also accepts a bare number (WireViz writes `gauge: 0.25`). */
function optionalScalarString(raw: YamlValue | undefined, label: string): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  return expectScalarString(raw, label);
}
