import {
  BOARD_MARGIN,
  boardHoles,
  holeLocalPoint,
  holeKey,
  isBoardHoleAvailable,
  lowerBoardHalfStartRow,
  nearestAvailableHole,
  type BoardGrid,
  type BoardHoleClaim,
} from './board-geometry';
import {
  resolveFootprint,
  type Footprint,
  type FootprintArtwork,
  type FootprintCell,
  type FootprintShape,
} from './footprint';
import { trustedArtworkForFootprintDefinition } from '../artwork/trusted-component-artwork';
import {
  type BoardHole,
  type BoardNodeData,
  type BoardRotation,
  type DeviceNodeData,
  type DevicePlacement,
} from './interfaces';

/** Padding (px, at pitch scale 1) around a footprint's cell box, so leads aren't clipped. */
export const FOOTPRINT_PADDING_CELLS = 0.75;

/** Visual pitch used by detached legacy footprints that do not persist one yet. */
export const DETACHED_FOOTPRINT_FALLBACK_PITCH = 20;

export interface CellBox {
  rows: number;
  cols: number;
}

export interface DrawableFootprint extends CellBox {
  id?: string;
  artwork?: FootprintArtwork;
  physicalBounds?: Footprint['physicalBounds'];
  pins?: readonly Pick<Footprint['pins'][number], 'id' | 'cell' | 'artworkPoint' | 'primary'>[];
  shapes?: readonly FootprintShape[];
}

export type PhysicalBoardGrid = BoardGrid & Pick<BoardNodeData, 'pitch' | 'centerGap'>;

/** A raster or reviewed SVG is one physical object and may never be channel-stretched. */
export function isRigidFootprint(footprint: DrawableFootprint): boolean {
  return (
    footprint.artwork !== undefined ||
    footprint.physicalBounds !== undefined ||
    footprint.pins?.some((pin) => pin.artworkPoint !== undefined) === true ||
    trustedArtworkForFootprintDefinition(footprint) !== undefined
  );
}

/** Physical marker center for a pin, falling back to its legacy grid cell. */
export function footprintPinPoint(pin: Pick<Footprint['pins'][number], 'cell' | 'artworkPoint'>): {
  x: number;
  y: number;
} {
  return pin.artworkPoint ?? { x: pin.cell.col, y: pin.cell.row };
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

/**
 * `rotateCell` for a continuous point rather than a whole cell.
 *
 * Illustration shapes live between cells - a lead at `y: -0.3`, a body edge at
 * `x: 1.5` - so they cannot go through `rotateCell`, but they have to land in
 * exactly the same rotated frame its cells do or the drawing would come apart
 * from the pins at 90 and 270 degrees.
 */
export function rotateFootprintPoint(
  x: number,
  y: number,
  box: CellBox,
  rotation: BoardRotation,
): { x: number; y: number } {
  switch (rotation) {
    case 0:
      return { x, y };
    case 90:
      return { x: box.rows - 1 - y, y: x };
    case 180:
      return { x: box.cols - 1 - x, y: box.rows - 1 - y };
    case 270:
      return { x: y, y: box.cols - 1 - x };
  }
}

/**
 * The host board's central channel, seen from a seated footprint's own anchor
 * cell.
 *
 * A board with a `centerGap` is not a uniform grid: `holeLocalPoint` pushes
 * every row at or below the split down by the whole gap. A footprint drawn as
 * `cell.row * pitch` therefore agrees with its holes only while it stays on one
 * side of the channel; a part that straddles the trench of an 830-point
 * breadboard would have its lower half drawn a full `centerGap` above the holes
 * its pins are actually in.
 *
 * This is the same piecewise mapping, expressed relative to the anchor so it
 * composes with `placementNodePosition` (which already resolves the anchor
 * through `holeLocalPoint` and must not be given an offset of its own).
 *
 * The cut is half a cell after the last row above the split - exactly where
 * `boardCenterGap` starts drawing. The full `centerGap` is what moves; the
 * narrower groove a breadboard *paints* inside that clearance is a surface
 * detail and never enters this geometry.
 */
export interface FootprintChannel {
  /** Cell-space Y at which the channel opens, measured from the anchor cell. */
  cutY: number;
  /** Channel height in cell units: `centerGap / pitch`. */
  gapCells: number;
}

export function footprintChannel(
  board: Pick<BoardNodeData, 'rows' | 'pitch' | 'centerGap'>,
  footprint: DrawableFootprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
): FootprintChannel | null {
  if (isRigidFootprint(footprint)) return null;
  const gap = board.centerGap ?? 0;
  if (gap <= 0 || board.rows < 2 || board.pitch <= 0) return null;
  const split = lowerBoardHalfStartRow(board);
  const box = rotatedFootprintBox(footprint, placement.rotation);
  const firstRow = placement.anchor.row;
  const lastRow = firstRow + box.rows - 1;

  // A channel changes the component geometry only when the footprint's actual
  // hole-cell box occupies both halves. Artwork may extend into the clearance,
  // but a component seated wholly above or below remains one rigid object; in
  // particular, negative-Y labels on the first lower row must not jump across
  // the trench and outside the node's shared padded origin.
  if (firstRow >= split || lastRow < split) return null;

  const cutY = split - firstRow - 0.5;
  return { cutY, gapCells: gap / board.pitch };
}

/**
 * A footprint-local Y in the board's own piecewise space.
 *
 * A channel exists only for a footprint whose cell box straddles the split, so
 * its anchor is always above the cut and cell (0, 0) remains pinned to the
 * anchor hole.
 */
export function applyFootprintChannel(y: number, channel: FootprintChannel | null): number {
  if (!channel) return y;
  return y + (y > channel.cutY ? channel.gapCells : 0);
}

/** Rotation then channel: the one mapping every drawn part of a footprint takes. */
export function footprintDrawPoint(
  x: number,
  y: number,
  box: CellBox,
  rotation: BoardRotation,
  channel: FootprintChannel | null,
): { x: number; y: number } {
  const rotated = rotateFootprintPoint(x, y, box, rotation);
  return { x: rotated.x, y: applyFootprintChannel(rotated.y, channel) };
}

/**
 * Rigid artwork mapping. A raster cannot be split across the board channel:
 * rotate every point together and, when its center belongs below the cut,
 * translate the whole image by the gap exactly once.
 */
export function footprintArtworkPoints(
  footprint: CellBox,
  artwork: Pick<FootprintArtwork, 'x' | 'y' | 'width' | 'height'>,
  rotation: BoardRotation,
  channel: FootprintChannel | null,
): {
  origin: { x: number; y: number };
  horizontal: { x: number; y: number };
  vertical: { x: number; y: number };
  opposite: { x: number; y: number };
} {
  const center = rotateFootprintPoint(
    artwork.x + artwork.width / 2,
    artwork.y + artwork.height / 2,
    footprint,
    rotation,
  );
  const shift = channel && center.y > channel.cutY ? channel.gapCells : 0;
  const at = (x: number, y: number) => {
    const point = rotateFootprintPoint(x, y, footprint, rotation);
    return { x: point.x, y: point.y + shift };
  };
  return {
    origin: at(artwork.x, artwork.y),
    horizontal: at(artwork.x + artwork.width, artwork.y),
    vertical: at(artwork.x, artwork.y + artwork.height),
    opposite: at(artwork.x + artwork.width, artwork.y + artwork.height),
  };
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

export interface FootprintPinResolution {
  pins: FootprintPinHole[];
  /** Pins whose physical marker has no exact hole at this rigid placement. */
  missingPinIds: string[];
}

const PHYSICAL_POINT_EPSILON = 1e-6;

function exactHoleAtPoint(
  board: PhysicalBoardGrid,
  point: { x: number; y: number },
): BoardHole | null {
  const candidate = nearestAvailableHole(board, point);
  if (!candidate) return null;
  const actual = holeLocalPoint(board, candidate);
  const tolerance = Math.max(1, board.pitch) * PHYSICAL_POINT_EPSILON;
  return Math.abs(actual.x - point.x) <= tolerance && Math.abs(actual.y - point.y) <= tolerance
    ? candidate
    : null;
}

function rigidPointOnBoard(
  board: PhysicalBoardGrid,
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
  point: { x: number; y: number },
): { x: number; y: number } {
  const anchor = holeLocalPoint(board, placement.anchor);
  const rotated = rotateFootprintPoint(point.x, point.y, footprint, placement.rotation);
  return {
    x: anchor.x + rotated.x * board.pitch,
    y: anchor.y + rotated.y * board.pitch,
  };
}

/**
 * Resolves pin markers to board holes. Rigid artwork uses physical coordinates
 * and only accepts exact hole centers; ordinary vector footprints retain the
 * legacy address-grid mapping.
 */
export function resolveFootprintPinHoles(
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
  board?: PhysicalBoardGrid,
): FootprintPinResolution {
  if (!board || !isRigidFootprint(footprint)) {
    return {
      pins: footprint.pins.map((pin) => {
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
      }),
      missingPinIds: [],
    };
  }

  const pins: FootprintPinHole[] = [];
  const missingPinIds: string[] = [];
  for (const pin of footprint.pins) {
    const marker = footprintPinPoint(pin);
    const point = rigidPointOnBoard(board, footprint, placement, marker);
    const hole = exactHoleAtPoint(board, point);
    if (!hole) {
      missingPinIds.push(pin.id);
      continue;
    }
    const rotated = rotateFootprintPoint(marker.x, marker.y, footprint, placement.rotation);
    pins.push({
      pinId: pin.id,
      label: pin.label,
      cell: { row: rotated.y, col: rotated.x },
      hole,
    });
  }
  return { pins, missingPinIds };
}

/** Every pin's board hole (and its rotated draw cell) for a placement. */
export function footprintPinHoles(
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
  board?: PhysicalBoardGrid,
): FootprintPinHole[] {
  return resolveFootprintPinHoles(footprint, placement, board).pins;
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
  board?: PhysicalBoardGrid,
): BoardHole[] {
  const bodyCells: FootprintCell[] =
    footprint.bodyCells ??
    Array.from({ length: footprint.rows }, (_, row) =>
      Array.from({ length: footprint.cols }, (_, col) => ({ row, col })),
    ).flat();
  // Pins always occupy holes, even when a custom bodyCells list omits them.
  if (board && isRigidFootprint(footprint)) {
    const seen = new Set<string>();
    const holes: BoardHole[] = [];
    const include = (hole: BoardHole | null): void => {
      if (!hole) return;
      const key = holeKey(hole);
      if (seen.has(key)) return;
      seen.add(key);
      holes.push(hole);
    };

    for (const cell of bodyCells) {
      include(
        exactHoleAtPoint(
          board,
          rigidPointOnBoard(board, footprint, placement, { x: cell.col, y: cell.row }),
        ),
      );
    }
    for (const pin of resolveFootprintPinHoles(footprint, placement, board).pins) {
      include(pin.hole);
    }

    // Artwork is physical body too. Conservatively claim every hole whose
    // center is under its rotated rectangle, including overhang beyond the
    // logical header grid (the Nano USB end extends 1.5 pitches each side).
    const artwork =
      footprint.artwork ??
      footprint.physicalBounds ??
      trustedArtworkForFootprintDefinition(footprint)?.bounds;
    if (artwork) {
      const points = footprintArtworkPoints(footprint, artwork, placement.rotation, null);
      const xs = [points.origin.x, points.horizontal.x, points.vertical.x, points.opposite.x];
      const ys = [points.origin.y, points.horizontal.y, points.vertical.y, points.opposite.y];
      const minX = Math.min(...xs) - PHYSICAL_POINT_EPSILON;
      const maxX = Math.max(...xs) + PHYSICAL_POINT_EPSILON;
      const minY = Math.min(...ys) - PHYSICAL_POINT_EPSILON;
      const maxY = Math.max(...ys) + PHYSICAL_POINT_EPSILON;
      const anchor = holeLocalPoint(board, placement.anchor);
      for (const hole of boardHoles(board)) {
        const point = holeLocalPoint(board, hole);
        const x = (point.x - anchor.x) / board.pitch;
        const y = (point.y - anchor.y) / board.pitch;
        if (x >= minX && x <= maxX && y >= minY && y <= maxY) include(hole);
      }
    }
    return holes;
  }

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
  board: PhysicalBoardGrid,
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
): boolean {
  const resolution = resolveFootprintPinHoles(footprint, placement, board);
  if (resolution.missingPinIds.length > 0) return false;
  if (isRigidFootprint(footprint) && !rigidArtworkFitsBoard(board, footprint, placement)) {
    return false;
  }
  return footprintOccupiedHoles(footprint, placement, board).every((hole) =>
    isBoardHoleAvailable(board, hole),
  );
}

function rigidArtworkFitsBoard(
  board: PhysicalBoardGrid,
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
): boolean {
  const artwork =
    footprint.artwork ??
    footprint.physicalBounds ??
    trustedArtworkForFootprintDefinition(footprint)?.bounds;
  if (!artwork) return true;
  const anchor = holeLocalPoint(board, placement.anchor);
  const points = footprintArtworkPoints(footprint, artwork, placement.rotation, null);
  const maxX = (board.cols - 1) * board.pitch;
  const maxY = (board.rows - 1) * board.pitch + (board.centerGap ?? 0);
  return [points.origin, points.horizontal, points.vertical, points.opposite].every((point) => {
    const x = anchor.x + point.x * board.pitch - BOARD_MARGIN;
    const y = anchor.y + point.y * board.pitch - BOARD_MARGIN;
    const tolerance = board.pitch * PHYSICAL_POINT_EPSILON;
    return x >= -tolerance && x <= maxX + tolerance && y >= -tolerance && y <= maxY + tolerance;
  });
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
  board: Pick<BoardNodeData, 'rows' | 'cols' | 'pitch' | 'holes' | 'centerGap'>;
  /** Board node position in diagram (flow) coordinates. */
  position: { x: number; y: number };
}

/**
 * Top-left pixel position a footprinted node must take, in diagram
 * coordinates, so that its anchor cell sits exactly on the anchor hole.
 *
 * The node's own box unites the padded rotated cell box with vector shapes and
 * raster artwork. Using the resulting left/top extent here keeps cell (0, 0)
 * aligned with the anchor even when an illustration extends into negative
 * coordinates.
 */
export function placementNodePosition(
  frame: BoardFrame,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
  footprint?: DrawableFootprint,
): { x: number; y: number } {
  const anchor = holeLocalPoint(frame.board, placement.anchor);
  const channel = footprint ? footprintChannel(frame.board, footprint, placement) : null;
  const extent = footprint
    ? footprintDrawnExtent(footprint, placement.rotation, channel)
    : {
        left: -FOOTPRINT_PADDING_CELLS,
        top: -FOOTPRINT_PADDING_CELLS,
      };
  return {
    x: frame.position.x + anchor.x + extent.left * frame.board.pitch,
    y: frame.position.y + anchor.y + extent.top * frame.board.pitch,
  };
}

/**
 * The anchor hole a node dropped at `nodePosition` should snap to - the
 * inverse of `placementNodePosition`, rounded to the nearest hole. Not clamped
 * (see `clampAnchorToBoard`) so callers can tell "off the edge" from "fits".
 * `nodePitch` preserves the node's current visual padding while it moves
 * between boards whose pitches differ.
 * Returns null when an explicit hole list is empty.
 */
export function anchorForNodePosition(
  frame: BoardFrame,
  nodePosition: { x: number; y: number },
  nodePitch = frame.board.pitch,
  footprint?: DrawableFootprint,
  rotation: BoardRotation = 0,
): BoardHole | null {
  const findAnchor = (extent: Pick<ReturnType<typeof footprintDrawnExtent>, 'left' | 'top'>) =>
    nearestAvailableHole(frame.board, {
      x: nodePosition.x - frame.position.x - extent.left * nodePitch,
      y: nodePosition.y - frame.position.y - extent.top * nodePitch,
    });
  if (!footprint) {
    return findAnchor({ left: -FOOTPRINT_PADDING_CELLS, top: -FOOTPRINT_PADDING_CELLS });
  }
  const initial = findAnchor(footprintDrawnExtent(footprint, rotation, null));
  if (!initial) return null;
  const channel = footprintChannel(frame.board, footprint, { anchor: initial, rotation });
  return findAnchor(footprintDrawnExtent(footprint, rotation, channel));
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
): BoardHole;
export function anchorAfterRotation(
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
  rotation: BoardRotation,
  board: PhysicalBoardGrid,
): BoardHole | null;
export function anchorAfterRotation(
  footprint: Footprint,
  placement: Pick<DevicePlacement, 'anchor' | 'rotation'>,
  rotation: BoardRotation,
  board?: PhysicalBoardGrid,
): BoardHole | null {
  const pivot = footprint.pins[0]?.cell ?? { row: 0, col: 0 };
  if (board && isRigidFootprint(footprint)) {
    const pin = footprint.pins.find((candidate) => candidate.primary) ?? footprint.pins[0];
    const pivotPoint = pin ? footprintPinPoint(pin) : { x: 0, y: 0 };
    const fixed = rigidPointOnBoard(board, footprint, placement, pivotPoint);
    const nextPivot = rotateFootprintPoint(pivotPoint.x, pivotPoint.y, footprint, rotation);
    return exactHoleAtPoint(board, {
      x: fixed.x - nextPivot.x * board.pitch,
      y: fixed.y - nextPivot.y * board.pitch,
    });
  }
  const pivotHole = cellToHole(pivot, footprint, placement);
  const nextPivot = rotateCell(pivot, rotation, footprint);
  return {
    row: pivotHole.row - nextPivot.row,
    col: pivotHole.col - nextPivot.col,
  };
}

/**
 * The footprint's drawn extent in cell units, in the board's piecewise space.
 *
 * The padded cell box is the baseline. Vector shapes and rigid artwork (a
 * bundled trusted SVG or an explicit raster upload) may extend any side,
 * including into negative fractional coordinates. The bottom grows by the
 * channel when the footprint straddles it, while artwork is translated as one
 * rigid rectangle rather than stretched across the cut.
 */
export function footprintDrawnExtent(
  footprint: DrawableFootprint,
  rotation: BoardRotation,
  channel: FootprintChannel | null,
): { top: number; bottom: number; left: number; right: number } {
  const box = rotatedFootprintBox(footprint, rotation);
  const pad = FOOTPRINT_PADDING_CELLS;
  const extent = {
    top: -pad,
    bottom: applyFootprintChannel(box.rows - 1 + pad, channel),
    left: -pad,
    right: box.cols - 1 + pad,
  };
  const includePoints = (points: readonly { x: number; y: number }[], margin = 0): void => {
    extent.top = Math.min(extent.top, ...points.map((point) => point.y - margin));
    extent.bottom = Math.max(extent.bottom, ...points.map((point) => point.y + margin));
    extent.left = Math.min(extent.left, ...points.map((point) => point.x - margin));
    extent.right = Math.max(extent.right, ...points.map((point) => point.x + margin));
  };
  for (const shape of footprint.shapes ?? []) {
    switch (shape.kind) {
      case 'rect':
        includePoints([
          footprintDrawPoint(shape.x, shape.y, footprint, rotation, channel),
          footprintDrawPoint(shape.x + shape.width, shape.y, footprint, rotation, channel),
          footprintDrawPoint(
            shape.x + shape.width,
            shape.y + shape.height,
            footprint,
            rotation,
            channel,
          ),
          footprintDrawPoint(shape.x, shape.y + shape.height, footprint, rotation, channel),
        ]);
        break;
      case 'circle':
        includePoints(
          [footprintDrawPoint(shape.cx, shape.cy, footprint, rotation, channel)],
          shape.r,
        );
        break;
      case 'line':
        includePoints(
          [
            footprintDrawPoint(shape.x1, shape.y1, footprint, rotation, channel),
            footprintDrawPoint(shape.x2, shape.y2, footprint, rotation, channel),
          ],
          (shape.width ?? 0.08) / 2,
        );
        break;
      case 'text': {
        const size = shape.size ?? 0.42;
        const width = Math.max(size * 0.5, shape.text.length * size * 0.6);
        const left =
          shape.anchor === 'end'
            ? shape.x - width
            : shape.anchor === 'middle'
              ? shape.x - width / 2
              : shape.x;
        const rotatedAnchor = rotateFootprintPoint(shape.x, shape.y, footprint, rotation);
        const mappedAnchor = footprintDrawPoint(shape.x, shape.y, footprint, rotation, channel);
        const shiftY = mappedAnchor.y - rotatedAnchor.y;
        includePoints(
          [
            { x: left, y: shape.y - size / 2 },
            { x: left + width, y: shape.y - size / 2 },
            { x: left + width, y: shape.y + size / 2 },
            { x: left, y: shape.y + size / 2 },
          ].map((corner) => {
            const point = rotateFootprintPoint(corner.x, corner.y, footprint, rotation);
            return { x: point.x, y: point.y + shiftY };
          }),
        );
        break;
      }
    }
  }
  const artwork =
    footprint.artwork ??
    footprint.physicalBounds ??
    trustedArtworkForFootprintDefinition(footprint)?.bounds;
  if (!artwork) return extent;
  const points = footprintArtworkPoints(footprint, artwork, rotation, channel);
  const corners = [points.origin, points.horizontal, points.vertical, points.opposite];
  includePoints(corners);
  return extent;
}

/**
 * Pixel size of a footprinted node's own box at a board's pitch.
 *
 * A seated footprint that straddles its board's central channel is that much
 * taller: its lower half really is a `centerGap` further down the board.
 */
export function footprintNodeSize(
  footprint: DrawableFootprint,
  rotation: BoardRotation,
  pitch: number,
  channel: FootprintChannel | null = null,
): { width: number; height: number } {
  const extent = footprintDrawnExtent(footprint, rotation, channel);
  return {
    width: (extent.right - extent.left) * pitch,
    height: (extent.bottom - extent.top) * pitch,
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
export function deviceHoleClaims(
  nodeId: string,
  data: DeviceNodeData,
  board?: PhysicalBoardGrid,
): BoardHoleClaim[] {
  const footprint = resolveFootprint(data);
  if (footprint && data.placement) {
    const placement = data.placement;
    return footprintOccupiedHoles(footprint, placement, board).map((hole) => ({
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
export function devicePortHoles(
  data: DeviceNodeData,
  board?: PhysicalBoardGrid,
): Map<string, BoardHole> {
  const result = new Map<string, BoardHole>();
  const footprint = resolveFootprint(data);
  if (footprint && data.placement) {
    const portIds = new Set(data.ports.map((port) => port.id));
    if (!board && isRigidFootprint(footprint)) {
      for (const port of data.ports) {
        if (port.hole) result.set(port.id, port.hole);
      }
      return result;
    }
    for (const pin of footprintPinHoles(footprint, data.placement, board)) {
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
export function syncPortHolesToPlacement(
  data: DeviceNodeData,
  board?: PhysicalBoardGrid,
): DeviceNodeData {
  const footprint = resolveFootprint(data);
  if (!footprint || !data.placement) return data;
  const holes = devicePortHoles(data, board);
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
  kind:
    | 'out-of-bounds'
    | 'incompatible-grid'
    | 'occupied'
    | 'net-conflict'
    | 'unknown-board'
    | 'unknown-footprint';
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
  board: PhysicalBoardGrid & Pick<BoardNodeData, 'boardId'>,
  footprint: Footprint,
  placement: DevicePlacement,
  existingClaims: readonly BoardHoleClaim[],
): PlacementConflict | null {
  const resolvedPins = resolveFootprintPinHoles(footprint, placement, board);
  if (resolvedPins.missingPinIds.length > 0 && isRigidFootprint(footprint)) {
    return {
      kind: 'incompatible-grid',
      nodeId,
      boardId: board.boardId,
      holes: [],
      blockedBy: resolvedPins.missingPinIds,
    };
  }
  const occupied = footprintOccupiedHoles(footprint, placement, board);
  if (isRigidFootprint(footprint) && !rigidArtworkFitsBoard(board, footprint, placement)) {
    return {
      kind: 'out-of-bounds',
      nodeId,
      boardId: board.boardId,
      holes: [],
      blockedBy: [],
    };
  }
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
  board: PhysicalBoardGrid & Pick<BoardNodeData, 'boardId'>,
  footprint: Footprint,
  rotation: BoardRotation,
  preferred: BoardHole,
  existingClaims: readonly BoardHoleClaim[],
): BoardHole | null {
  if (isRigidFootprint(footprint)) {
    const candidates = boardHoles(board);
    if (candidates.length === 0) return null;
    const startIndex = candidates.findIndex(
      (hole) =>
        hole.row > preferred.row || (hole.row === preferred.row && hole.col >= preferred.col),
    );
    const start = startIndex < 0 ? 0 : startIndex;
    for (let step = 0; step < candidates.length; step++) {
      const anchor = candidates[(start + step) % candidates.length];
      if (
        !validatePlacement(
          nodeId,
          board,
          footprint,
          { boardId: board.boardId, anchor, rotation },
          existingClaims,
        )
      ) {
        return anchor;
      }
    }
    return null;
  }
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
