export const LAYERS = {
  DEVICES: 'DEVICES',
  WIRES: 'WIRES',
} as const;

export const ACI = {
  WHITE: 7,
} as const;

export const TEXT_STYLE = {
  STANDARD: 'STANDARD',
  BOLD: 'BOLD',
} as const;

/**
 * Lineweights in 1/100 mm (DXF group code 370). Must use values from the
 * DXF standard lineweight enum: 0, 5, 9, 13, 15, 18, 20, 25, 30, 35, ...
 */
export const LINE_WEIGHT = {
  WIRE: 35,
  FRAME: 25,
  DETAIL: 25,
  SUBTLE: 13,
} as const;

/** Fixed px→mm scale for DXF export. Keeps device size constant across diagram sizes. */
export const DXF_SCALE_MM_PER_PX = 0.3;

export const DIAGRAM_PADDING_PX = 50;

/**
 * Approximates the browser's default line-height for the project font (Poppins).
 * Used to lay out header text with breathing room close to the rendered DOM.
 */
export const TEXT_LINE_HEIGHT_RATIO = 1.4;

/**
 * Mirrors --av-node-width / --av-port-width / --av-port-height in tokens.css.
 * Used as fallbacks when measurement data is unavailable.
 */
export const DEFAULT_NODE_WIDTH_PX = 240;
export const PORT_WIDTH_PX = 8;
export const PORT_HEIGHT_PX = 13;

/** Mirrors `.port-row { min-height: 36px }` — fallback when measuredPorts is missing. */
export const FALLBACK_PORT_ROW_HEIGHT_PX = 36;

/**
 * How far past `edge.points[0]` / `points[last]` to extend the wire so it
 * reaches the outer edge of the snapped port rectangle. ng-diagram routes to
 * the port's measured center, which sits ~5px inside the snapped outer edge
 * (PORT_WIDTH/2 + the 1px node border).
 */
export const WIRE_ENDPOINT_EXTENSION_PX = 5;

export const HEADER_PADDING_TOP_PX = 4;
export const HEADER_PADDING_BOTTOM_PX = 8;
export const ROW_PADDING_TOP_PX = 4;
export const ROW_PADDING_X_PX = 12;

export const FONT_DEVICE_ID_PX = 14;
export const FONT_INFO_PX = 10;
export const FONT_LABEL_PX = 12;
export const FONT_CONNECTOR_PX = 10;
