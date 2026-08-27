import { type Edge, type Node } from 'ng-diagram';
import {
  MINIMAL_TWO_NETS_PLACEMENT,
  MINIMAL_TWO_NETS_WIREVIZ_YAML,
} from '../wireviz-import/fixtures/minimal-two-nets.fixture';
import { importWireViz } from '../wireviz-import/import-wireviz';
import { fromCanonicalProject, toCanonicalProject } from './model/canonical-project';
import {
  NodeTemplateType,
  type AvSchematicEdgeData,
  type AvSchematicNodeData,
  type BoardNodeData,
  type DeviceNodeData,
} from './model/interfaces';

/**
 * Tracer bullet seed (issue #1 / talus-wiring-editor): board A (6 x 11
 * holes), an Arduino Nano and a TB6612FNG breakout, and the two nets
 * produced by actually importing the minimal WireViz fixture below — this
 * is the real import pipeline running at load time, not hand-authored
 * edges that happen to match it.
 *
 * See docs/wiring-tracer-bullet.md for the integration decision this seed
 * exercises, and docs/wireviz-import-limits.md for the parser's supported
 * subset.
 */

const boardA: Node<BoardNodeData> = {
  id: 'board-a',
  type: NodeTemplateType.BoardNode,
  position: { x: 60, y: 60 },
  data: {
    type: 'board',
    boardId: 'board-a',
    label: 'Placa A (6x11)',
    rows: 6,
    cols: 11,
    pitch: 20,
  },
};

// Nano and TB6612FNG are positioned so their illustrated cards overlap board
// A's own footprint (x: 60..292, y: 60..192 for rows=6/cols=11/pitch=20 — see
// board-geometry.ts::boardSize) in the visual plane. `nodes` below keeps the
// board first so it renders behind both components (see NgDiagramConfig's
// `zIndex.elevateOnSelection: false` in diagram.component.ts — nodes stack
// in array order). Still just one ng-diagram canvas: the board is an
// ordinary node, not a background layer.
const nano: Node<DeviceNodeData> = {
  id: 'nano-1',
  type: NodeTemplateType.DeviceNode,
  position: { x: 70, y: 66 },
  data: {
    type: 'device',
    deviceId: 'NANO-1',
    manufacturer: 'Arduino',
    model: 'Nano',
    category: 'microcontroller',
    location: 'Board A',
    boardId: 'board-a',
    ports: [
      {
        id: 'vin',
        label: 'VIN',
        direction: 'input',
        connectorType: 'Power',
        hole: { row: 1, col: 4 },
      },
      {
        id: 'd9',
        label: 'D9',
        direction: 'output',
        connectorType: 'PWM',
        hole: { row: 1, col: 1 },
      },
      {
        id: 'd8',
        label: 'D8',
        direction: 'output',
        connectorType: 'GPIO',
        hole: { row: 1, col: 2 },
      },
      {
        id: 'gnd',
        label: 'GND',
        direction: 'output',
        connectorType: 'Power',
        hole: { row: 1, col: 3 },
      },
      {
        id: '5v',
        label: '5V',
        direction: 'output',
        connectorType: 'Power',
        hole: { row: 1, col: 5 },
      },
    ],
  },
};

const tb6612: Node<DeviceNodeData> = {
  id: 'tb6612-1',
  type: NodeTemplateType.DeviceNode,
  position: { x: 185, y: 66 },
  data: {
    type: 'device',
    deviceId: 'DRV-1',
    manufacturer: 'Toshiba',
    model: 'TB6612FNG',
    category: 'motor-driver',
    location: 'Board A',
    boardId: 'board-a',
    ports: [
      {
        id: 'pwma',
        label: 'PWMA',
        direction: 'input',
        connectorType: 'PWM',
        hole: { row: 4, col: 1 },
      },
      {
        id: 'ain1',
        label: 'AIN1',
        direction: 'input',
        connectorType: 'GPIO',
        hole: { row: 4, col: 2 },
      },
      {
        id: 'stby',
        label: 'STBY',
        direction: 'input',
        connectorType: 'GPIO',
        hole: { row: 4, col: 3 },
      },
      {
        id: 'vcc',
        label: 'VCC',
        direction: 'input',
        connectorType: 'Power',
        hole: { row: 4, col: 4 },
      },
      {
        id: 'gnd',
        label: 'GND',
        direction: 'input',
        connectorType: 'Power',
        hole: { row: 4, col: 5 },
      },
      { id: 'ao1', label: 'AO1', direction: 'output', connectorType: 'Motor' },
      { id: 'ao2', label: 'AO2', direction: 'output', connectorType: 'Motor' },
    ],
  },
};

const baseNodes: Node<AvSchematicNodeData>[] = [boardA, nano, tb6612];
const baseProject = toCanonicalProject(baseNodes, []);
const imported = importWireViz(MINIMAL_TWO_NETS_WIREVIZ_YAML, {
  placement: MINIMAL_TWO_NETS_PLACEMENT,
  components: baseProject.electrical.components,
});
const importedModel = fromCanonicalProject({
  ...baseProject,
  electrical: imported.electrical,
});
const nodes = importedModel.nodes;

// Give the direction-line net (W2) a manual bend, demonstrating that manually
// routed points survive being produced by the WireViz import (they're just
// ordinary edge points from here on — edge-reshaping owns editing them).
const edges: Edge<AvSchematicEdgeData>[] = importedModel.edges.map((edge) =>
  edge.data.wireId === 'W2'
    ? ({
        ...edge,
        routingMode: 'manual',
        points: [
          { x: 178, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 150 },
          { x: 185, y: 150 },
        ],
      } satisfies Edge<AvSchematicEdgeData>)
    : edge,
);

export const diagramModel: {
  nodes: Node<AvSchematicNodeData>[];
  edges: Edge<AvSchematicEdgeData>[];
} = { nodes, edges };
