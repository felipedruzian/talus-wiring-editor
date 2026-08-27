import { type BoardHole, type BoardNodeData } from './interfaces';

/** Outer margin (px) around the hole grid, so holes don't sit flush on the board edge. */
export const BOARD_MARGIN = 16;

export interface BoardSize {
  width: number;
  height: number;
}

/**
 * Pixel size of a board's rendered body, derived from its hole grid.
 * `rows`/`cols` count holes, so the grid spans `(n - 1) * pitch` between the
 * first and last hole on each axis.
 */
export function boardSize(board: Pick<BoardNodeData, 'rows' | 'cols' | 'pitch'>): BoardSize {
  return {
    width: (board.cols - 1) * board.pitch + BOARD_MARGIN * 2,
    height: (board.rows - 1) * board.pitch + BOARD_MARGIN * 2,
  };
}

/**
 * Pixel position of a hole's center, relative to the board node's own
 * top-left corner (i.e. add the board node's `position` to place it in
 * diagram space).
 */
export function holeLocalPoint(
  board: Pick<BoardNodeData, 'pitch'>,
  hole: BoardHole,
): { x: number; y: number } {
  return { x: BOARD_MARGIN + hole.col * board.pitch, y: BOARD_MARGIN + hole.row * board.pitch };
}

/** Every hole address on a board's grid, row-major. */
export function allHoles(board: Pick<BoardNodeData, 'rows' | 'cols'>): BoardHole[] {
  const holes: BoardHole[] = [];
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      holes.push({ row, col });
    }
  }
  return holes;
}

export function isHoleInBounds(
  board: Pick<BoardNodeData, 'rows' | 'cols'>,
  hole: BoardHole,
): boolean {
  return hole.row >= 0 && hole.row < board.rows && hole.col >= 0 && hole.col < board.cols;
}

/**
 * One pin's claim on a board hole — the minimal shape needed to validate
 * hole placement without depending on `DeviceNodeData`/ng-diagram `Node`
 * types, so the checks below stay pure and framework-agnostic.
 */
export interface BoardHoleClaim {
  /** `BoardNodeData.boardId` this hole is addressed against. */
  boardId: string;
  /** Opaque id identifying the claiming pin, e.g. `${deviceId}:${portId}`, for error reporting. */
  ownerId: string;
  hole: BoardHole;
}

/**
 * Every claim whose hole falls outside its declared board's grid. Empty
 * means every claim addresses a real hole on its board — a physical
 * precondition for a pin to be "encaixado" (fitted) on that board at all.
 */
export function findOutOfBoundsHoleClaims(
  claims: readonly BoardHoleClaim[],
  boardsById: ReadonlyMap<string, Pick<BoardNodeData, 'rows' | 'cols'>>,
): BoardHoleClaim[] {
  return claims.filter((claim) => {
    const board = boardsById.get(claim.boardId);
    return !board || !isHoleInBounds(board, claim.hole);
  });
}

/**
 * Groups claims that physically collide: two or more pins addressing the
 * same hole on the same board, which no real board can seat at once. Holes
 * are board-local addresses, so claims on different boards never collide
 * even if their `row`/`col` match. Returns one group per colliding hole
 * (each group has length >= 2); an empty result means every claimed hole on
 * every board is used by at most one pin.
 */
export function findHoleCollisions(claims: readonly BoardHoleClaim[]): BoardHoleClaim[][] {
  const byKey = new Map<string, BoardHoleClaim[]>();
  for (const claim of claims) {
    const key = `${claim.boardId}:${claim.hole.row}:${claim.hole.col}`;
    const group = byKey.get(key);
    if (group) {
      group.push(claim);
    } else {
      byKey.set(key, [claim]);
    }
  }
  return [...byKey.values()].filter((group) => group.length > 1);
}
