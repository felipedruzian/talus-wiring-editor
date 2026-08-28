import { type Edge, type Node } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { placementNodePosition } from '../../diagram/model/footprint-geometry';
import { type Footprint } from '../../diagram/model/footprint';
import {
  EdgeTemplateType,
  NodeTemplateType,
  type BoardNodeData,
  type DeviceNodeData,
  type WireEdgeData,
} from '../../diagram/model/interfaces';
import { DxfCircle, DxfLwPolyline } from '../dxf/dxf-entity';
import { CoordinateMapper } from '../dxf/dxf-coordinate-mapper';
import { DxfExporter } from '../dxf/dxf-exporter';
import { buildAvDxfConfig } from './av-dxf-config';
import { DIAGRAM_PADDING, DXF_SCALE_MM_PER_PX, LAYERS } from './av-dxf-constants';

const footprint: Footprint = {
  id: 'vertical-link',
  label: 'Vertical link',
  rows: 1,
  cols: 2,
  pins: [
    { id: 'a', label: 'A', cell: { row: 0, col: 0 }, primary: true },
    { id: 'b', label: 'B', cell: { row: 0, col: 1 } },
  ],
  shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, stroke: 'lead' }],
  bodyCells: [],
};

const board: Node<BoardNodeData> = {
  id: 'board-17',
  type: NodeTemplateType.BoardNode,
  position: { x: 100, y: 200 },
  data: {
    type: 'board',
    boardId: 'board-17',
    label: 'Board 17',
    rows: 2,
    cols: 3,
    pitch: 17,
    traces: [
      {
        id: 'vcc',
        label: 'L1',
        net: 'VCC',
        segments: [{ from: { row: 0, col: 0 }, to: { row: 0, col: 2 } }],
      },
    ],
  },
};

const placement = {
  boardId: board.data.boardId,
  anchor: { row: 0, col: 0 },
  rotation: 90 as const,
};

const component: Node<DeviceNodeData> = {
  id: 'link-1',
  type: NodeTemplateType.FootprintNode,
  position: placementNodePosition({ board: board.data, position: board.position }, placement),
  data: {
    type: 'device',
    deviceId: 'LINK-1',
    manufacturer: 'project',
    model: 'vertical-link',
    boardId: board.data.boardId,
    footprintId: footprint.id,
    footprint,
    placement,
    ports: [
      { id: 'a', label: 'A', direction: 'input' },
      { id: 'b', label: 'B', direction: 'output' },
    ],
  },
};

const sourcePoint = { x: 116, y: 216 };
const targetPoint = { x: 150, y: 216 };
const edge: Edge<WireEdgeData> = {
  id: 'wire-1',
  type: EdgeTemplateType.WireEdge,
  source: component.id,
  sourcePort: 'a',
  target: board.id,
  targetPort: 'hole:0:2',
  points: [sourcePoint, targetPoint],
  data: { type: 'wire', wireId: 'W-PHYSICAL' },
};

describe('physical DXF renderers', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 400 };
  const doc = new DxfExporter(buildAvDxfConfig()).export([board, component], [edge], bounds);
  const mapper = CoordinateMapper.fromScale(bounds, DXF_SCALE_MM_PER_PX, DIAGRAM_PADDING);

  it('registers separate layers and renders every board hole at pitch 17', () => {
    expect(doc.getLayers().map((layer) => layer.name)).toEqual([
      LAYERS.BOARDS,
      LAYERS.DEVICES,
      LAYERS.FOOTPRINTS,
      LAYERS.WIRES,
    ]);
    const holes = doc
      .getEntities()
      .filter(
        (entity): entity is DxfCircle =>
          entity instanceof DxfCircle && entity.layerName === LAYERS.BOARDS,
      );
    expect(holes).toHaveLength(6);
    expect(holes.map((hole) => [hole.x, hole.y])).toContainEqual(
      Object.values(mapper.mapPoint(150, 233)),
    );
  });

  it('rotates footprint geometry in board pitch without using generic card geometry', () => {
    const shapeLine = doc
      .getEntities()
      .find(
        (entity): entity is DxfLwPolyline =>
          entity instanceof DxfLwPolyline &&
          entity.layerName === LAYERS.FOOTPRINTS &&
          !entity.closed,
      );
    expect(shapeLine?.points).toEqual([
      mapper.mapPoint(sourcePoint.x, sourcePoint.y),
      mapper.mapPoint(sourcePoint.x, sourcePoint.y + board.data.pitch),
    ]);
  });

  it('keeps board and footprint wire endpoints on their exact physical centers', () => {
    const wire = doc
      .getEntities()
      .find(
        (entity): entity is DxfLwPolyline =>
          entity instanceof DxfLwPolyline && entity.layerName === LAYERS.WIRES,
      );
    expect(wire?.points).toEqual([
      mapper.mapPoint(sourcePoint.x, sourcePoint.y),
      mapper.mapPoint(targetPoint.x, targetPoint.y),
    ]);
  });
});
