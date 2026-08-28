import {
  BOARD_MARGIN,
  holeKey,
  isBoardHoleAvailable,
  nearestAvailableHole,
  type BoardGrid,
  type BoardHoleClaim,
} from './board-geometry';
import { resolveFootprint, type Footprint, type FootprintCell } from './footprint';
import {
  type BoardHole,
  type BoardNodeData,
  type BoardRotation,
  type DeviceNodeData,
  type DevicePlacement,
} from './interfaces';

/** Padding (px, at pitch scale 1) around a footprint's cell box, so leads aren't clipped. */
export const FOOTPRINT_PADDING_CELLS = 0.75;

export interface CellBox {
  rows: number;
  cols: number;
}

/**
 * A footprint's bounding box after rotation. 90 and 270 swap the axes; 0 and
 * 180 leave them alone.
 */
export function rotatedFootprintBox(footprint: CellBox, rotation: BoardRotation): CellBox {
  return rotation === 90 || rotation === 270
    ? { rows: footprint.cols, cols: footprint.rows }
    : { rows: footprint.rows, cols: footprint.cols };
}

/**
 * Rotates one cell clockwise inside the footprint's bounding box, so the
 * result is still measured from the rotated box's own top-left corner.
 *
 * 90 deg: (r, c) -> (c, rows - 1 - r). Checked against the box swap above -
 * the new row index is bounded by the old column count and vice versa, which
 * is what makes `anchor + rotatedCell` always land inside the rotated box.
 */
export function rotateCell(
  cell: FootprintCell,
  rotation: BoardRotation,
  box: CellBox,
): FootprintCell {
  switch (rotation) {
    case 0:
      return { row: cell.row, col: cell.col };
    case 90:
      return { row: cell.col, col: box.rows - 1 - cell.row };
    case 180:
      return { row: box.rows - 1 - cell.row, col: box.cols - 1 - cell.col };
    case 270:
      return { row: box.cols - 1 - cell.col, col: cell.row };
  }
}

/** Next rotation clockwise (or counter-clockwise for `step: -1`). */
export function stepRotation(rotation: BoardRotation, step: 1 | -1): BoardRotation {
  const next = (((rotation + step * 90) % 360) + 360) % 360;
  return next as BoardRotation;
}

/** The board hole a footprint cell lands on for a given placement. */
export function cellToHole(
  cell: FootprintCell,
  footprint: CellBox,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
): BoardHole {
  const rotated = rotateCell(cell, placement.rotation, footprint);
  return {
    row: placement.anchor.row + rotated.row,
    col: placement.anchor.col + rotated.col,
  };
}

export interface FootprintPinHole {
  pinId: string;
  label: string;
  hole: BoardHole;
  /** Cell coordinates after rotation - where the pin is drawn inside the node. */
  cell: FootprintCell;
}

/** Every pin's board hole (and its rotated draw cell) for a placement. */
export function footprintPinHoles(
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
): FootprintPinHole[] {
  return footprint.pins.map((pin) => {
    const cell = rotateCell(pin.cell, placement.rotation, footprint);
    return {
      pinId: pin.id,
      label: pin.label,
      cell,
      hole: {
        row: placement.anchor.row + cell.row,
        col: placement.anchor.col + cell.col,
      },
    };
  });
}

/**
 * Every hole a seated footprint physically occupies - its pins plus whatever
 * else its body sits on top of. `bodyCells` narrows it for parts that only
 * touch the board at their leads (a jumper link, an axial resistor lying
 * across a gap); without it the whole bounding box counts, which is the right
 * answer for a module whose PCB covers the holes under it.
 */
export function footprintOccupiedHoles(
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
): BoardHole[] {
  const bodyCells: FootprintCell[] =
    footprint.bodyCells ??
    Array.from({ length: footprint.rows }, (_, row) =>
      Array.from({ length: footprint.cols }, (_, col) => ({ row, col })),
    ).flat();
  // Pins always occupy holes, even when a custom bodyCells list omits them.
  const cells = [...bodyCells, ...footprint.pins.map((pin) => pin.cell)];

  const seen = new Set<string>();
  const holes: BoardHole[] = [];
  for (const cell of cells) {
    const hole = cellToHole(cell, footprint, placement);
    const key = holeKey(hole);
    if (seen.has(key)) continue;
    seen.add(key);
    holes.push(hole);
  }
  return holes;
}

/** Whether every hole a placement occupies exists on the board. */
export function isPlacementInBounds(
  board: BoardGrid,
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
): boolean {
  return footprintOccupiedHoles(footprint, placement).every((hole) =>
    isBoardHoleAvailable(board, hole),
  );
}

/**
 * Clamps an anchor so the whole rotated footprint stays on the board. Returns
 * null when the footprint simply cannot fit at that rotation - a 7-row
 * Arduino Nano on a 6-row perfboard has no valid anchor, and saying so is more
 * useful than snapping it to a lie.
 */
export function clampAnchorToBoard(
  board: BoardGrid,
  footprint: Footprint,
  anchor: BoardHole,
  rotation: BoardRotation,
): BoardHole | null {
  const box = rotatedFootprintBox(footprint, rotation);
  const maxRow = board.rows - box.rows;
  const maxCol = board.cols - box.cols;
  if (maxRow < 0 || maxCol < 0) return null;
  return {
    row: Math.min(Math.max(anchor.row, 0), maxRow),
    col: Math.min(Math.max(anchor.col, 0), maxCol),
  };
}

export interface BoardFrame {
  board: Pick<BoardNodeData, 'rows' | 'cols' | 'pitch' | 'holes'>;
  /** Board node position in diagram (flow) coordinates. */
  position: { x: number; y: number };
}

/**
 * Top-left pixel position a footprinted node must take, in diagram
 * coordinates, so that its anchor cell sits exactly on the anchor hole.
 *
 * The node's own box is the rotated cell box grown by `FOOTPRINT_PADDING_CELLS`
 * on every side, so cell (0, 0) is `padding * pitch` in from the node corner.
 */
export function placementNodePosition(
  frame: BoardFrame,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
): { x: number; y: number } {
  const pad = FOOTPRINT_PADDING_CELLS * frame.board.pitch;
  return {
    x: frame.position.x + BOARD_MARGIN + placement.anchor.col * frame.board.pitch - pad,
    y: frame.position.y + BOARD_MARGIN + placement.anchor.row * frame.board.pitch - pad,
  };
}

/**
 * The anchor hole a node dropped at `nodePosition` should snap to - the
 * inverse of `placementNodePosition`, rounded to the nearest hole. Not clamped
 * (see `clampAnchorToBoard`) so callers can tell "off the edge" from "fits".
 * Returns null when an explicit hole list is empty.
 */
export function anchorForNodePosition(
  frame: BoardFrame,
  nodePosition: { x: number; y: number },
): BoardHole | null {
  const pad = FOOTPRINT_PADDING_CELLS * frame.board.pitch;
  return nearestAvailableHole(frame.board, {
    x: nodePosition.x - frame.position.x + pad,
    y: nodePosition.y - frame.position.y + pad,
  });
}

/**
 * Anchor for a new rotation while keeping one physical footprint cell fixed.
 * The first pin is the stable pivot when present; otherwise cell 0,0 is used.
 * Integer cell transforms make four turns exactly reversible (no half-cell
 * rounding drift).
 */
export function anchorAfterRotation(
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
  rotation: BoardRotation,
): BoardHole {
  const pivot = footprint.pins[0]?.cell ?? { row: 0, col: 0 };
  const pivotHole = cellToHole(pivot, footprint, placement);
  const nextPivot = rotateCell(pivot, rotation, footprint);
  return {
    row: pivotHole.row - nextPivot.row,
    col: pivotHole.col - nextPivot.col,
  };
}

/** Pixel size of a footprinted node's own box at a board's pitch. */
export function footprintNodeSize(
  footprint: CellBox,
  rotation: BoardRotation,
  pitch: number,
): { width: number; height: number } {
  const box = rotatedFootprintBox(footprint, rotation);
  const pad = FOOTPRINT_PADDING_CELLS * pitch;
  return {
    width: (box.cols - 1) * pitch + pad * 2,
    height: (box.rows - 1) * pitch + pad * 2,
  };
}

// ---------------------------------------------------------------------------
// Device -> claims
// ---------------------------------------------------------------------------

/**
 * Every hole this device claims, whichever way it is addressed.
 *
 * A device with a `footprintId` + `placement` derives its claims from the
 * footprint (pins *and* body), so the placement is the single source of truth
 * and rotation is automatically accounted for. A device without one falls back
 * to the hand-addressed `port.hole` values the issue #1 tracer bullet uses, so
 * that path keeps working untouched.
 */
export function deviceHoleClaims(nodeId: string, data: DeviceNodeData): BoardHoleClaim[] {
  const footprint = resolveFootprint(data);
  if (footprint && data.placement) {
    const placement = data.placement;
    return footprintOccupiedHoles(footprint, placement).map((hole) => ({
      boardId: placement.boardId,
      ownerId: nodeId,
      hole,
    }));
  }

  const boardId = data.boardId;
  if (boardId === undefined) return [];
  return data.ports.flatMap((port): BoardHoleClaim[] => {
    if (port.hole === undefined) return [];
    return [{ boardId, ownerId: nodeId, hole: port.hole }];
  });
}

/**
 * The hole each *electrically exposed* pin of a device lands on: the subset of
 * the footprint's pins that the device actually declares as ports, mapped to
 * board holes. This is the pin <-> hole association a net endpoint depends on.
 */
export function devicePortHoles(data: DeviceNodeData): Map<string, BoardHole> {
  const result = new Map<string, BoardHole>();
  const footprint = resolveFootprint(data);
  if (footprint && data.placement) {
    const portIds = new Set(data.ports.map((port) => port.id));
    for (const pin of footprintPinHoles(footprint, data.placement)) {
      if (portIds.has(pin.pinId)) result.set(pin.pinId, pin.hole);
    }
    return result;
  }
  for (const port of data.ports) {
    if (port.hole) result.set(port.id, port.hole);
  }
  return result;
}

/**
 * Rewrites a device's `ports[].hole` so the stored addresses match what its
 * placement actually produces. Called whenever a placement changes, so the
 * persisted per-pin address never drifts from the geometry that derived it.
 */
export function syncPortHolesToPlacement(data: DeviceNodeData): DeviceNodeData {
  const footprint = resolveFootprint(data);
  if (!footprint || !data.placement) return data;
  const holes = devicePortHoles(data);
  return {
    ...data,
    boardId: data.placement.boardId,
    ports: data.ports.map((port) => {
      const hole = holes.get(port.id);
      return hole ? { ...port, hole } : port;
    }),
  };
}

export interface PlacementConflict {
  kind: 'out-of-bounds' | 'occupied' | 'net-conflict' | 'unknown-board' | 'unknown-footprint';
  nodeId: string;
  boardId: string;
  /** Holes that caused the rejection. Empty for the `unknown-*` kinds. */
  holes: BoardHole[];
  /** Blocking node ids for `occupied`, or physical net ids for `net-conflict`. */
  blockedBy: string[];
}

/**
 * Validates a candidate placement against the board and everything already
 * seated on it. Returns null when the seat is free.
 *
 * `existingClaims` is expected to include the moving node's own current claims;
 * they're filtered out by `ownerId` so a part never blocks itself.
 */
export function validatePlacement(
  nodeId: string,
  board: BoardGrid & Pick<BoardNodeData, 'boardId'>,
  footprint: Footprint,
  placement: DevicePlacement,
  existingClaims: readonly BoardHoleClaim[],
): PlacementConflict | null {
  const occupied = footprintOccupiedHoles(footprint, placement);
  const outOfBounds = occupied.filter((hole) => !isBoardHoleAvailable(board, hole));
  if (outOfBounds.length > 0) {
    return {
      kind: 'out-of-bounds',
      nodeId,
      boardId: board.boardId,
      holes: outOfBounds,
      blockedBy: [],
    };
  }

  const takenByHole = new Map<string, string>();
  for (const claim of existingClaims) {
    if (claim.boardId !== board.boardId || claim.ownerId === nodeId) continue;
    takenByHole.set(holeKey(claim.hole), claim.ownerId);
  }

  const clashes = occupied.filter((hole) => takenByHole.has(holeKey(hole)));
  if (clashes.length > 0) {
    return {
      kind: 'occupied',
      nodeId,
      boardId: board.boardId,
      holes: clashes,
      blockedBy: [
        ...new Set(
          clashes.map((hole) => takenByHole.get(holeKey(hole))).filter((id): id is string => !!id),
        ),
      ],
    };
  }

  return null;
}

/**
 * The first free seat at or after `preferred`, scanning row-major. Used to
 * place a part dropped from the palette without silently stacking it on top of
 * whatever is already there. Returns null when the board has no room at all.
 */
export function findFreeAnchor(
  nodeId: string,
  board: BoardGrid & Pick<BoardNodeData, 'boardId'>,
  footprint: Footprint,
  rotation: BoardRotation,
  preferred: BoardHole,
  existingClaims: readonly BoardHoleClaim[],
): BoardHole | null {
  const box = rotatedFootprintBox(footprint, rotation);
  const maxRow = board.rows - box.rows;
  const maxCol = board.cols - box.cols;
  if (maxRow < 0 || maxCol < 0) return null;

  const startRow = Math.min(Math.max(preferred.row, 0), maxRow);
  const startCol = Math.min(Math.max(preferred.col, 0), maxCol);
  const total = (maxRow + 1) * (maxCol + 1);
  const startIndex = startRow * (maxCol + 1) + startCol;

  for (let step = 0; step < total; step++) {
    const index = (startIndex + step) % total;
    const anchor: BoardHole = {
      row: Math.floor(index / (maxCol + 1)),
      col: index % (maxCol + 1),
    };
    const conflict = validatePlacement(
      nodeId,
      board,
      footprint,
      { boardId: board.boardId, anchor, rotation },
      existingClaims,
    );
    if (!conflict) return anchor;
  }
  return null;
}
