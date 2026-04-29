import type { Node, Port } from 'ng-diagram';
import type { DeviceNodeData, DevicePort } from '../../diagram/model/interfaces';
import { DxfLwPolyline, DxfText } from '../dxf/dxf-entity';
import type { DxfNodeRenderer, DxfRenderContext } from '../dxf/dxf-types';
import {
  DEFAULT_NODE_WIDTH_PX,
  FALLBACK_PORT_ROW_HEIGHT_PX,
  FONT_CONNECTOR_PX,
  FONT_DEVICE_ID_PX,
  FONT_INFO_PX,
  FONT_LABEL_PX,
  HEADER_PADDING_BOTTOM_PX,
  HEADER_PADDING_TOP_PX,
  LAYERS,
  LINE_WEIGHT,
  PORT_HEIGHT_PX,
  PORT_WIDTH_PX,
  ROW_PADDING_X_PX,
  TEXT_LINE_HEIGHT_RATIO,
  TEXT_STYLE,
} from './av-dxf-constants';

interface PortRect {
  readonly port: DevicePort;
  /** Diagram x of the port-shape's left edge. */
  readonly x: number;
  /** Diagram y of the port-shape's top edge. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Diagram x of the port-shape's horizontal center. */
  readonly centerX: number;
  /** Diagram y of the port-shape's vertical center (= row center for that port). */
  readonly centerY: number;
}

/**
 * Renders an av-schematic `device` node into DXF entities.
 *
 * Geometry mirrors device-node.component.{html,scss}: a header band with
 * deviceId / manufacturer / model centered, a separator, and two columns
 * of ports below. Port rectangles sit just outside the node edge — input
 * ports on the left, output ports on the right.
 *
 * Port positions and sizes are taken from `node.measuredPorts` so they
 * align with where ng-diagram routes wires (`edge.points` reflect the same
 * DOM measurements). When measuredPorts is unavailable, falls back to a
 * data-derived layout using a fixed row height.
 */
export const renderDeviceNode: DxfNodeRenderer = (ctx, node) => {
  const data = node.data as DeviceNodeData;
  const nx = node.position.x;
  const ny = node.position.y;
  const w = node.size?.width ?? DEFAULT_NODE_WIDTH_PX;

  const inputData = data.ports.filter((p) => p.direction === 'input');
  const outputData = data.ports.filter((p) => p.direction === 'output');
  const inputRects = collectPortRects(inputData, node, nx, ny, true);
  const outputRects = collectPortRects(outputData, node, nx, ny, false);

  const h = node.size?.height ?? estimateDefaultHeight(data, inputRects, outputRects);
  const sectionTopY = computeSectionTopY(inputRects, outputRects, ny, h);

  renderBox(ctx, nx, ny, w, h);
  renderHeader(ctx, data, nx, ny, w, sectionTopY);

  drawLine(ctx, nx, sectionTopY, nx + w, sectionTopY, LAYERS.DEVICES, LINE_WEIGHT.FRAME);
  if (inputRects.length + outputRects.length > 0) {
    drawLine(ctx, nx + w / 2, sectionTopY, nx + w / 2, ny + h, LAYERS.DEVICES, LINE_WEIGHT.FRAME);
  }

  renderColumn(ctx, inputRects, nx, w, true);
  renderColumn(ctx, outputRects, nx, w, false);
};

const collectPortRects = (
  ports: readonly DevicePort[],
  node: Node,
  nx: number,
  ny: number,
  isInput: boolean,
): PortRect[] => {
  const measuredById = new Map<string, Port>();
  for (const mp of node.measuredPorts ?? []) {
    measuredById.set(mp.id, mp);
  }

  return ports.map((port, index) => {
    const measured = measuredById.get(port.id);
    if (measured?.position && measured.size && measured.size.width > 0 && measured.size.height > 0) {
      // Use the measured center, but render with a fixed PORT_WIDTH × PORT_HEIGHT
      // rect. The device-node template applies a 1px parity toggle to port-shape
      // height (workaround for an ng-diagram measurement issue), which would
      // otherwise show up as alternating port sizes in the DXF.
      const centerX = nx + measured.position.x + measured.size.width / 2;
      const centerY = ny + measured.position.y + measured.size.height / 2;
      return {
        port,
        x: centerX - PORT_WIDTH_PX / 2,
        y: centerY - PORT_HEIGHT_PX / 2,
        width: PORT_WIDTH_PX,
        height: PORT_HEIGHT_PX,
        centerX,
        centerY,
      };
    }
    return fallbackPortRect(port, index, nx, ny, node.size?.width ?? DEFAULT_NODE_WIDTH_PX, isInput);
  });
};

const fallbackPortRect = (
  port: DevicePort,
  index: number,
  nx: number,
  ny: number,
  w: number,
  isInput: boolean,
): PortRect => {
  const centerY = ny + 60 + (index + 0.5) * FALLBACK_PORT_ROW_HEIGHT_PX;
  const centerX = isInput ? nx - PORT_WIDTH_PX / 2 : nx + w + PORT_WIDTH_PX / 2;
  return {
    port,
    x: centerX - PORT_WIDTH_PX / 2,
    y: centerY - PORT_HEIGHT_PX / 2,
    width: PORT_WIDTH_PX,
    height: PORT_HEIGHT_PX,
    centerX,
    centerY,
  };
};

/**
 * Top edge of the ports section (= header separator y, = column separator
 * top). Derives the actual row height from consecutive port centers in
 * each column — port-shapes are vertically *centered* in their rows, so
 * with label + connectorType the row may be ~40px while the port-shape is
 * only 13px, putting the row top well above the port-shape top.
 */
const computeSectionTopY = (
  inputRects: readonly PortRect[],
  outputRects: readonly PortRect[],
  ny: number,
  h: number,
): number => {
  if (inputRects.length === 0 && outputRects.length === 0) {
    return ny + h - 1;
  }
  const inputTop = firstRowTop(inputRects);
  const outputTop = firstRowTop(outputRects);
  const candidates = [inputTop, outputTop].filter((y): y is number => y !== null);
  return Math.max(ny, Math.min(...candidates));
};

const firstRowTop = (rects: readonly PortRect[]): number | null => {
  if (rects.length === 0) return null;
  const rowH =
    rects.length >= 2
      ? rects[1].centerY - rects[0].centerY
      : FALLBACK_PORT_ROW_HEIGHT_PX;
  return rects[0].centerY - rowH / 2;
};

const estimateDefaultHeight = (
  data: DeviceNodeData,
  inputRects: readonly PortRect[],
  outputRects: readonly PortRect[],
): number => {
  const headerH =
    HEADER_PADDING_TOP_PX +
    Math.ceil(FONT_DEVICE_ID_PX * TEXT_LINE_HEIGHT_RATIO) +
    Math.ceil(FONT_INFO_PX * TEXT_LINE_HEIGHT_RATIO) +
    Math.ceil(FONT_INFO_PX * TEXT_LINE_HEIGHT_RATIO) +
    HEADER_PADDING_BOTTOM_PX;
  const rows = Math.max(inputRects.length, outputRects.length, 1);
  return headerH + 1 + rows * FALLBACK_PORT_ROW_HEIGHT_PX;
};

const renderBox = (
  ctx: DxfRenderContext,
  nx: number,
  ny: number,
  w: number,
  h: number,
): void => {
  const corners = [
    ctx.mapper.mapPoint(nx, ny),
    ctx.mapper.mapPoint(nx + w, ny),
    ctx.mapper.mapPoint(nx + w, ny + h),
    ctx.mapper.mapPoint(nx, ny + h),
  ];
  ctx.doc.addEntity(new DxfLwPolyline(LAYERS.DEVICES, corners, true, undefined, LINE_WEIGHT.FRAME));
};

const renderHeader = (
  ctx: DxfRenderContext,
  data: DeviceNodeData,
  nx: number,
  ny: number,
  w: number,
  sectionTopY: number,
): void => {
  const lines: TextLine[] = [];
  if (data.deviceId) {
    lines.push({ text: data.deviceId, fontPx: FONT_DEVICE_ID_PX, style: TEXT_STYLE.BOLD });
  }
  if (data.manufacturer) {
    lines.push({ text: data.manufacturer, fontPx: FONT_INFO_PX });
  }
  if (data.model) {
    lines.push({ text: data.model, fontPx: FONT_INFO_PX });
  }
  if (lines.length === 0) return;

  const totalContentH = lines.reduce(
    (sum, line) => sum + line.fontPx * TEXT_LINE_HEIGHT_RATIO,
    0,
  );
  const availableH = sectionTopY - ny;
  const startY =
    totalContentH + HEADER_PADDING_TOP_PX + HEADER_PADDING_BOTTOM_PX <= availableH
      ? ny + HEADER_PADDING_TOP_PX
      : ny + Math.max(0, (availableH - totalContentH) / 2);

  let cursorY = startY;
  for (const line of lines) {
    const lineH = line.fontPx * TEXT_LINE_HEIGHT_RATIO;
    const centerY = cursorY + lineH / 2;
    const pos = ctx.mapper.mapPoint(nx + w / 2, centerY);
    const heightMm = ctx.mapper.mapLength(line.fontPx);
    ctx.doc.addEntity(
      new DxfText(LAYERS.DEVICES, line.text, pos.x, pos.y, heightMm, line.style ?? TEXT_STYLE.STANDARD, 1, 2),
    );
    cursorY += lineH;
  }
};

const renderColumn = (
  ctx: DxfRenderContext,
  rects: readonly PortRect[],
  nx: number,
  nodeW: number,
  isInput: boolean,
): void => {
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    renderPortRect(ctx, rect);
    renderPortLabel(ctx, rect, nx, nodeW, isInput);

    if (i < rects.length - 1) {
      const dividerY = (rect.centerY + rects[i + 1].centerY) / 2;
      const x1 = isInput ? nx : nx + nodeW / 2;
      const x2 = isInput ? nx + nodeW / 2 : nx + nodeW;
      drawLine(ctx, x1, dividerY, x2, dividerY, LAYERS.DEVICES, LINE_WEIGHT.SUBTLE);
    }
  }
};

const renderPortRect = (ctx: DxfRenderContext, rect: PortRect): void => {
  const corners = [
    ctx.mapper.mapPoint(rect.x, rect.y),
    ctx.mapper.mapPoint(rect.x + rect.width, rect.y),
    ctx.mapper.mapPoint(rect.x + rect.width, rect.y + rect.height),
    ctx.mapper.mapPoint(rect.x, rect.y + rect.height),
  ];
  ctx.doc.addEntity(new DxfLwPolyline(LAYERS.DEVICES, corners, true, undefined, LINE_WEIGHT.DETAIL));
};

const renderPortLabel = (
  ctx: DxfRenderContext,
  rect: PortRect,
  nx: number,
  nodeW: number,
  isInput: boolean,
): void => {
  const lines: TextLine[] = [{ text: rect.port.label, fontPx: FONT_LABEL_PX }];
  if (rect.port.connectorType) {
    lines.push({ text: rect.port.connectorType, fontPx: FONT_CONNECTOR_PX });
  }
  const anchorX = isInput ? nx + ROW_PADDING_X_PX : nx + nodeW - ROW_PADDING_X_PX;
  const halign: 0 | 2 = isInput ? 0 : 2;
  renderStackedText(ctx, lines, anchorX, rect.centerY, halign, LAYERS.DEVICES);
};

const drawLine = (
  ctx: DxfRenderContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layer: string,
  lineweight: number,
): void => {
  const p1 = ctx.mapper.mapPoint(x1, y1);
  const p2 = ctx.mapper.mapPoint(x2, y2);
  ctx.doc.addEntity(new DxfLwPolyline(layer, [p1, p2], false, undefined, lineweight));
};

interface TextLine {
  readonly text: string;
  readonly fontPx: number;
  readonly style?: string;
}

const renderStackedText = (
  ctx: DxfRenderContext,
  lines: readonly TextLine[],
  anchorX: number,
  anchorCenterY: number,
  halign: 0 | 1 | 2,
  layer: string,
): void => {
  if (lines.length === 0) return;
  const totalH = lines.reduce((sum, line) => sum + line.fontPx * TEXT_LINE_HEIGHT_RATIO, 0);
  let cursorY = anchorCenterY - totalH / 2;
  for (const line of lines) {
    const lineH = line.fontPx * TEXT_LINE_HEIGHT_RATIO;
    const centerY = cursorY + lineH / 2;
    const pos = ctx.mapper.mapPoint(anchorX, centerY);
    const heightMm = ctx.mapper.mapLength(line.fontPx);
    const style = line.style ?? TEXT_STYLE.STANDARD;
    ctx.doc.addEntity(new DxfText(layer, line.text, pos.x, pos.y, heightMm, style, halign, 2));
    cursorY += lineH;
  }
};
