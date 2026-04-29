import type { Node, Port } from 'ng-diagram';
import type { DeviceNodeData, DevicePort } from '../../diagram/model/interfaces';
import { DxfLwPolyline, DxfText } from '../dxf/dxf-entity';
import type { DxfNodeRenderer, DxfRenderContext } from '../dxf/dxf-types';
import {
  DEFAULT_NODE_WIDTH,
  FALLBACK_PORT_ROW_HEIGHT,
  FONT_CONNECTOR,
  FONT_DEVICE_ID,
  FONT_INFO,
  FONT_LABEL,
  HEADER_PADDING_BOTTOM,
  HEADER_PADDING_TOP,
  LAYERS,
  LINE_WEIGHT,
  PORT_HEIGHT,
  PORT_WIDTH,
  ROW_PADDING_X,
  TEXT_LINE_HEIGHT_RATIO,
  TEXT_STYLE,
} from './av-dxf-constants';

/**
 * Height of a fully-populated 3-line header (deviceId + manufacturer + model).
 * Used by both the fallback port layout (when measurements are missing) and
 * the default-height estimate. The actual rendered header may be shorter if
 * some fields are blank — that's fine; the reserved space just leaves a bit
 * more room above the first port row.
 */
const HEADER_HEIGHT =
  HEADER_PADDING_TOP +
  Math.ceil(FONT_DEVICE_ID * TEXT_LINE_HEIGHT_RATIO) +
  Math.ceil(FONT_INFO * TEXT_LINE_HEIGHT_RATIO) +
  Math.ceil(FONT_INFO * TEXT_LINE_HEIGHT_RATIO) +
  HEADER_PADDING_BOTTOM;

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
  const nodeX = node.position.x;
  const nodeY = node.position.y;
  const nodeWidth = node.size?.width ?? DEFAULT_NODE_WIDTH;

  const inputData = data.ports.filter((p) => p.direction === 'input');
  const outputData = data.ports.filter((p) => p.direction === 'output');
  const inputRects = collectPortRects(inputData, node, nodeX, nodeY, true);
  const outputRects = collectPortRects(outputData, node, nodeX, nodeY, false);

  const nodeHeight = node.size?.height ?? estimateDefaultHeight(inputRects, outputRects);
  const sectionTopY = computeSectionTopY(inputRects, outputRects, nodeY, nodeHeight);

  renderBox(ctx, nodeX, nodeY, nodeWidth, nodeHeight);
  renderHeader(ctx, data, nodeX, nodeY, nodeWidth, sectionTopY);

  drawLine(ctx, nodeX, sectionTopY, nodeX + nodeWidth, sectionTopY, LAYERS.DEVICES, LINE_WEIGHT.FRAME);
  if (inputRects.length + outputRects.length > 0) {
    drawLine(
      ctx,
      nodeX + nodeWidth / 2,
      sectionTopY,
      nodeX + nodeWidth / 2,
      nodeY + nodeHeight,
      LAYERS.DEVICES,
      LINE_WEIGHT.FRAME,
    );
  }

  renderColumn(ctx, inputRects, nodeX, nodeWidth, true);
  renderColumn(ctx, outputRects, nodeX, nodeWidth, false);
};

const collectPortRects = (
  ports: readonly DevicePort[],
  node: Node,
  nodeX: number,
  nodeY: number,
  isInput: boolean,
): PortRect[] => {
  const measuredById = new Map<string, Port>();
  for (const measuredPort of node.measuredPorts ?? []) {
    measuredById.set(measuredPort.id, measuredPort);
  }

  const nodeWidth = node.size?.width ?? DEFAULT_NODE_WIDTH;

  return ports.map((port, index) => {
    const measured = measuredById.get(port.id);
    if (measured?.position && measured.size && measured.size.width > 0 && measured.size.height > 0) {
      // Y comes from the measurement so port rects align with `edge.points`.
      // X is snapped to the node outline so the port-shape's adjacent edge
      // sits flush against the device frame:
      //   - In the DOM, the port-shape's edge aligns with the node's *inner*
      //     border (1px inside the outer edge).
      //   - In the DXF, the device frame is drawn at the outer edge — snapping
      //     X here cancels that 1px gap.
      // Rect is rendered at fixed PORT_WIDTH × PORT_HEIGHT so all ports look
      // identical (the device-node template uses a 1px height parity toggle
      // as a workaround for an ng-diagram measurement issue).
      const centerY = nodeY + measured.position.y + measured.size.height / 2;
      const centerX = isInput ? nodeX - PORT_WIDTH / 2 : nodeX + nodeWidth + PORT_WIDTH / 2;
      return {
        port,
        x: centerX - PORT_WIDTH / 2,
        y: centerY - PORT_HEIGHT / 2,
        width: PORT_WIDTH,
        height: PORT_HEIGHT,
        centerX,
        centerY,
      };
    }
    return fallbackPortRect(port, index, nodeX, nodeY, nodeWidth, isInput);
  });
};

const fallbackPortRect = (
  port: DevicePort,
  index: number,
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  isInput: boolean,
): PortRect => {
  const centerY = nodeY + HEADER_HEIGHT + (index + 0.5) * FALLBACK_PORT_ROW_HEIGHT;
  const centerX = isInput ? nodeX - PORT_WIDTH / 2 : nodeX + nodeWidth + PORT_WIDTH / 2;
  return {
    port,
    x: centerX - PORT_WIDTH / 2,
    y: centerY - PORT_HEIGHT / 2,
    width: PORT_WIDTH,
    height: PORT_HEIGHT,
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
  nodeY: number,
  nodeHeight: number,
): number => {
  if (inputRects.length === 0 && outputRects.length === 0) {
    return nodeY + nodeHeight - 1;
  }
  const inputTop = firstRowTop(inputRects);
  const outputTop = firstRowTop(outputRects);
  const candidates = [inputTop, outputTop].filter((y): y is number => y !== null);
  return Math.max(nodeY, Math.min(...candidates));
};

const firstRowTop = (rects: readonly PortRect[]): number | null => {
  if (rects.length === 0) return null;
  const rowHeight =
    rects.length >= 2
      ? rects[1].centerY - rects[0].centerY
      : FALLBACK_PORT_ROW_HEIGHT;
  return rects[0].centerY - rowHeight / 2;
};

const estimateDefaultHeight = (
  inputRects: readonly PortRect[],
  outputRects: readonly PortRect[],
): number => {
  const rows = Math.max(inputRects.length, outputRects.length, 1);
  return HEADER_HEIGHT + 1 + rows * FALLBACK_PORT_ROW_HEIGHT;
};

const renderBox = (
  ctx: DxfRenderContext,
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
): void => {
  const corners = [
    ctx.mapper.mapPoint(nodeX, nodeY),
    ctx.mapper.mapPoint(nodeX + nodeWidth, nodeY),
    ctx.mapper.mapPoint(nodeX + nodeWidth, nodeY + nodeHeight),
    ctx.mapper.mapPoint(nodeX, nodeY + nodeHeight),
  ];
  ctx.doc.addEntity(new DxfLwPolyline(LAYERS.DEVICES, corners, true, undefined, LINE_WEIGHT.FRAME));
};

const renderHeader = (
  ctx: DxfRenderContext,
  data: DeviceNodeData,
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  sectionTopY: number,
): void => {
  const lines: TextLine[] = [];
  if (data.deviceId) {
    lines.push({ text: data.deviceId, fontSize: FONT_DEVICE_ID, style: TEXT_STYLE.BOLD });
  }
  if (data.manufacturer) {
    lines.push({ text: data.manufacturer, fontSize: FONT_INFO });
  }
  if (data.model) {
    lines.push({ text: data.model, fontSize: FONT_INFO });
  }
  if (lines.length === 0) return;

  const totalContentHeight = lines.reduce(
    (sum, line) => sum + line.fontSize * TEXT_LINE_HEIGHT_RATIO,
    0,
  );
  const availableHeight = sectionTopY - nodeY;
  const startY =
    totalContentHeight + HEADER_PADDING_TOP + HEADER_PADDING_BOTTOM <= availableHeight
      ? nodeY + HEADER_PADDING_TOP
      : nodeY + Math.max(0, (availableHeight - totalContentHeight) / 2);

  let cursorY = startY;
  for (const line of lines) {
    const lineHeight = line.fontSize * TEXT_LINE_HEIGHT_RATIO;
    const centerY = cursorY + lineHeight / 2;
    const mappedPoint = ctx.mapper.mapPoint(nodeX + nodeWidth / 2, centerY);
    const heightMm = ctx.mapper.mapLength(line.fontSize);
    ctx.doc.addEntity(
      new DxfText(
        LAYERS.DEVICES,
        line.text,
        mappedPoint.x,
        mappedPoint.y,
        heightMm,
        line.style ?? TEXT_STYLE.STANDARD,
        1,
        2,
      ),
    );
    cursorY += lineHeight;
  }
};

const renderColumn = (
  ctx: DxfRenderContext,
  rects: readonly PortRect[],
  nodeX: number,
  nodeWidth: number,
  isInput: boolean,
): void => {
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    renderPortRect(ctx, rect);
    renderPortLabel(ctx, rect, nodeX, nodeWidth, isInput);

    if (i < rects.length - 1) {
      const dividerY = (rect.centerY + rects[i + 1].centerY) / 2;
      const fromX = isInput ? nodeX : nodeX + nodeWidth / 2;
      const toX = isInput ? nodeX + nodeWidth / 2 : nodeX + nodeWidth;
      drawLine(ctx, fromX, dividerY, toX, dividerY, LAYERS.DEVICES, LINE_WEIGHT.SUBTLE);
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
  nodeX: number,
  nodeWidth: number,
  isInput: boolean,
): void => {
  const lines: TextLine[] = [{ text: rect.port.label, fontSize: FONT_LABEL }];
  if (rect.port.connectorType) {
    lines.push({ text: rect.port.connectorType, fontSize: FONT_CONNECTOR });
  }
  const anchorX = isInput ? nodeX + ROW_PADDING_X : nodeX + nodeWidth - ROW_PADDING_X;
  const halign: 0 | 2 = isInput ? 0 : 2;
  renderStackedText(ctx, lines, anchorX, rect.centerY, halign, LAYERS.DEVICES);
};

const drawLine = (
  ctx: DxfRenderContext,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  layer: string,
  lineweight: number,
): void => {
  const from = ctx.mapper.mapPoint(fromX, fromY);
  const to = ctx.mapper.mapPoint(toX, toY);
  ctx.doc.addEntity(new DxfLwPolyline(layer, [from, to], false, undefined, lineweight));
};

interface TextLine {
  readonly text: string;
  readonly fontSize: number;
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
  const totalHeight = lines.reduce((sum, line) => sum + line.fontSize * TEXT_LINE_HEIGHT_RATIO, 0);
  let cursorY = anchorCenterY - totalHeight / 2;
  for (const line of lines) {
    const lineHeight = line.fontSize * TEXT_LINE_HEIGHT_RATIO;
    const centerY = cursorY + lineHeight / 2;
    const mappedPoint = ctx.mapper.mapPoint(anchorX, centerY);
    const heightMm = ctx.mapper.mapLength(line.fontSize);
    const style = line.style ?? TEXT_STYLE.STANDARD;
    ctx.doc.addEntity(
      new DxfText(layer, line.text, mappedPoint.x, mappedPoint.y, heightMm, style, halign, 2),
    );
    cursorY += lineHeight;
  }
};
