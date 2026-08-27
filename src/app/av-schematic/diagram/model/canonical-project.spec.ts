import { type Edge } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { diagramModel } from '../data';
import {
  CanonicalProjectError,
  fromCanonicalProject,
  parseCanonicalProject,
  toCanonicalProject,
  type CanonicalProjectV1,
} from './canonical-project';
import { isBoardNode, isDeviceNode } from './guards';
import { type WireEdgeData } from './interfaces';

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value, got undefined');
  return value;
}

/** Deep clone of a plain-JSON value, for mutating a valid fixture into an invalid one. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('canonical project round-trip', () => {
  it('preserves board, components, pins (incl. holes) and nets (incl. color and manual points)', () => {
    const project = toCanonicalProject(diagramModel.nodes, diagramModel.edges);
    const rebuilt = fromCanonicalProject(project);

    expect(rebuilt.nodes.filter(isBoardNode)).toHaveLength(1);
    expect(rebuilt.nodes.filter(isDeviceNode)).toHaveLength(2);
    expect(rebuilt.edges).toHaveLength(diagramModel.edges.length);

    // Acceptance criterion: importing the fixture creates exactly two nets.
    expect(project.nets).toHaveLength(2);

    const board = must(rebuilt.nodes.find(isBoardNode));
    expect(board.data).toMatchObject({ rows: 6, cols: 11, pitch: 20 });

    const nano = must(rebuilt.nodes.find((n) => isDeviceNode(n) && n.data.deviceId === 'NANO-1'));
    expect(isDeviceNode(nano)).toBe(true);
    if (isDeviceNode(nano)) {
      const d9 = nano.data.ports.find((p) => p.label === 'D9');
      expect(d9?.hole).toEqual({ row: 1, col: 1 });
    }

    const pwmNet = must(rebuilt.edges.find((e) => e.data.wireId === 'W1'));
    expect(pwmNet.data.colorCode).toBe('YE');
    expect(typeof pwmNet.data.color).toBe('string');

    const manualNet = must(rebuilt.edges.find((e) => e.data.wireId === 'W2'));
    expect(manualNet.routingMode).toBe('manual');
    expect(manualNet.points).toEqual([
      { x: 178, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 150 },
      { x: 185, y: 150 },
    ]);
  });

  it('is stable under a second round-trip (export -> import -> export produces the same snapshot)', () => {
    const first = toCanonicalProject(diagramModel.nodes, diagramModel.edges);
    const rebuilt = fromCanonicalProject(first);
    const second = toCanonicalProject(rebuilt.nodes, rebuilt.edges);
    expect(second).toEqual(first);
  });

  it('is pure JSON (survives JSON.stringify/parse without change)', () => {
    const project = toCanonicalProject(diagramModel.nodes, diagramModel.edges);
    const roundTripped = JSON.parse(JSON.stringify(project)) as CanonicalProjectV1;
    expect(roundTripped).toEqual(project);
  });

  it('rejects exporting a dangling edge', () => {
    const dangling = {
      ...diagramModel.edges[0],
      target: null,
      targetPort: null,
    } as unknown as Edge<WireEdgeData>;
    expect(() => toCanonicalProject(diagramModel.nodes, [dangling])).toThrow(CanonicalProjectError);
  });
});

describe('parseCanonicalProject', () => {
  const validProject = toCanonicalProject(diagramModel.nodes, diagramModel.edges);
  // A value that has gone through JSON — matches what the storage client / server actually receive.
  const validRaw: unknown = JSON.parse(JSON.stringify(validProject));

  it('accepts a valid project and returns an equal, independent object', () => {
    const parsed = parseCanonicalProject(validRaw);
    expect(parsed).toEqual(validProject);
  });

  it('accepts a project with no boards, components or nets', () => {
    const empty: CanonicalProjectV1 = { formatVersion: 1, boards: [], components: [], nets: [] };
    expect(parseCanonicalProject(clone(empty))).toEqual(empty);
  });

  it.each([
    ['root is not an object', 'not-an-object'],
    ['root is null', null],
    ['root is an array', []],
  ])('rejects when %s', (_label, raw) => {
    expect(() => parseCanonicalProject(raw)).toThrow(CanonicalProjectError);
  });

  it('rejects a missing formatVersion', () => {
    const raw = clone(validRaw) as Record<string, unknown>;
    delete raw['formatVersion'];
    expect(() => parseCanonicalProject(raw)).toThrow(/formatVersion/);
  });

  it('rejects an unsupported formatVersion', () => {
    const raw = clone(validRaw) as Record<string, unknown>;
    raw['formatVersion'] = 2;
    expect(() => parseCanonicalProject(raw)).toThrow(/formatVersion/);
  });

  it('rejects boards that are not an array', () => {
    const raw = clone(validRaw) as Record<string, unknown>;
    raw['boards'] = {};
    expect(() => parseCanonicalProject(raw)).toThrow(/project\.boards/);
  });

  it('rejects a component with a non-string manufacturer', () => {
    const raw = clone(validRaw) as { components: Record<string, unknown>[] };
    raw.components[0]['manufacturer'] = 42;
    expect(() => parseCanonicalProject(raw)).toThrow(/manufacturer/);
  });

  it('rejects a non-finite position coordinate', () => {
    const raw = clone(validRaw) as { components: { position: Record<string, unknown> }[] };
    raw.components[0].position['x'] = 'not-a-number';
    expect(() => parseCanonicalProject(raw)).toThrow(CanonicalProjectError);
  });

  it('rejects a board id that collides with a component id', () => {
    const raw = clone(validRaw) as {
      boards: { id: string }[];
      components: { id: string }[];
    };
    raw.boards[0].id = raw.components[0].id;
    expect(() => parseCanonicalProject(raw)).toThrow(/duplicate id/);
  });

  it('rejects two nets with the same id', () => {
    const raw = clone(validRaw) as { nets: { id: string }[] };
    raw.nets[1].id = raw.nets[0].id;
    expect(() => parseCanonicalProject(raw)).toThrow(/duplicate id/);
  });

  it('rejects two pins with the same id on one component', () => {
    const raw = clone(validRaw) as { components: { pins: { id: string }[] }[] };
    const component = raw.components.find((c) => c.pins.length >= 2);
    if (!component) throw new Error('fixture has no component with >= 2 pins');
    component.pins[1].id = component.pins[0].id;
    expect(() => parseCanonicalProject(raw)).toThrow(/duplicate id/);
  });

  it('rejects a net endpoint referencing a non-existent component', () => {
    const raw = clone(validRaw) as { nets: { source: { componentId: string } }[] };
    raw.nets[0].source.componentId = 'no-such-component';
    expect(() => parseCanonicalProject(raw)).toThrow(/no component/);
  });

  it('rejects a net endpoint referencing a non-existent pin on an existing component', () => {
    const raw = clone(validRaw) as { nets: { source: { pinId: string } }[] };
    raw.nets[0].source.pinId = 'no-such-pin';
    expect(() => parseCanonicalProject(raw)).toThrow(/has no pin/);
  });

  it("rejects a pin hole that does not fit its component's declared board", () => {
    const raw = clone(validRaw) as {
      components: { pins: { hole?: { row: number; col: number } }[] }[];
    };
    const pin = raw.components.flatMap((c) => c.pins).find((p) => p.hole);
    if (!pin?.hole) throw new Error('fixture has no pin with a hole');
    pin.hole.row = 9999;
    expect(() => parseCanonicalProject(raw)).toThrow(/does not fit board/);
  });

  it('rejects a component with a hole but no boardId', () => {
    const raw = clone(validRaw) as { components: { boardId?: string }[] };
    const component = raw.components.find((c) => c.boardId !== undefined);
    if (!component) throw new Error('fixture has no component with a boardId');
    delete component.boardId;
    expect(() => parseCanonicalProject(raw)).toThrow(/no boardId/);
  });

  it('rejects a component boardId that does not match any board', () => {
    const raw = clone(validRaw) as { components: { boardId?: string }[] };
    const component = raw.components.find((c) => c.boardId !== undefined);
    if (!component) throw new Error('fixture has no component with a boardId');
    component.boardId = 'no-such-board';
    expect(() => parseCanonicalProject(raw)).toThrow(/does not match any board/);
  });

  it('rejects a non-positive board pitch', () => {
    const raw = clone(validRaw) as { boards: { pitch: number }[] };
    raw.boards[0].pitch = 0;
    expect(() => parseCanonicalProject(raw)).toThrow(/pitch/);
  });

  it('rejects a negative hole coordinate', () => {
    const raw = clone(validRaw) as {
      components: { pins: { hole?: { row: number; col: number } }[] }[];
    };
    const pin = raw.components.flatMap((c) => c.pins).find((p) => p.hole);
    if (!pin?.hole) throw new Error('fixture has no pin with a hole');
    pin.hole.row = -1;
    expect(() => parseCanonicalProject(raw)).toThrow(CanonicalProjectError);
  });

  it('rejects an unsupported routingMode value', () => {
    const raw = clone(validRaw) as { nets: { routingMode?: string }[] };
    raw.nets[0].routingMode = 'bezier';
    expect(() => parseCanonicalProject(raw)).toThrow(/routingMode/);
  });

  it('accepts routingMode "manual" and rejects "auto" (not a persisted state in this slice)', () => {
    const rawManual = clone(validRaw) as { nets: { routingMode?: string }[] };
    rawManual.nets[0].routingMode = 'manual';
    expect(() => parseCanonicalProject(rawManual)).not.toThrow();

    const rawAuto = clone(validRaw) as { nets: { routingMode?: string }[] };
    rawAuto.nets[0].routingMode = 'auto';
    expect(() => parseCanonicalProject(rawAuto)).toThrow(/routingMode/);
  });

  it('rejects an invalid pin direction', () => {
    const raw = clone(validRaw) as { components: { pins: { direction: string }[] }[] };
    raw.components[0].pins[0].direction = 'inout';
    expect(() => parseCanonicalProject(raw)).toThrow(/direction/);
  });
});
