import { describe, expect, it } from 'vitest';
import { findHoleCollisions, findOutOfBoundsHoleClaims } from '../model/board-geometry';
import {
  findTraceDefects,
  findTraceOverlaps,
  holesOnSameTrace,
  netForHole,
} from '../model/board-trace';
import { deviceHoleClaims } from '../model/footprint-geometry';
import { NodeTemplateType } from '../model/interfaces';
import {
  PHYSICAL_BOARDS,
  PHYSICAL_BOARD_NODES,
  PHYSICAL_WIRE_EDGES,
  PLACA_A_BOARD,
  PLACA_ORIGEM_BOARD,
  PECA_D_BOARD,
  PECA_E_BOARD,
  PECA_F_BOARD,
  PECA_G_BOARD,
  SEATED_COMPONENT_NODES,
} from './physical-boards.fixture';

describe('physical board fixtures', () => {
  const boards = [PLACA_A_BOARD, ...PHYSICAL_BOARDS];

  it('contains placa A, the 6x28 origin board, and pieces D/E/F/G', () => {
    expect(PLACA_A_BOARD).toMatchObject({ rows: 6, cols: 11 });
    expect(PLACA_ORIGEM_BOARD).toMatchObject({ rows: 6, cols: 28 });
    expect(PECA_D_BOARD).toMatchObject({ rows: 6, cols: 3 });
    expect(PECA_E_BOARD).toMatchObject({ rows: 6, cols: 3 });
    expect(PECA_F_BOARD).toMatchObject({ rows: 6, cols: 3 });
    expect(PECA_G_BOARD).toMatchObject({ rows: 6, cols: 4 });
    expect(new Set(boards.map((board) => board.boardId)).size).toBe(6);
  });

  it('defines only valid, non-overlapping traces', () => {
    for (const board of boards) {
      expect(findTraceDefects(board), board.boardId).toEqual([]);
      expect(findTraceOverlaps(board), board.boardId).toEqual([]);
    }
  });

  it('keeps each runtime board node id equal to its boardId', () => {
    expect(PHYSICAL_BOARD_NODES.every((node) => node.id === node.data.boardId)).toBe(true);
  });
});

describe('physical component fixtures', () => {
  it('uses the footprint template for every seated component', () => {
    expect(SEATED_COMPONENT_NODES.length).toBeGreaterThan(0);
    expect(
      SEATED_COMPONENT_NODES.every(
        (node) => node.type === NodeTemplateType.FootprintNode && node.data.footprint !== undefined,
      ),
    ).toBe(true);
  });

  it('keeps every occupied hole in bounds and collision-free', () => {
    const boardsById = new Map(
      [PLACA_A_BOARD, ...PHYSICAL_BOARDS].map((board) => [board.boardId, board]),
    );
    const claims = SEATED_COMPONENT_NODES.flatMap((node) => deviceHoleClaims(node.id, node.data));
    expect(findOutOfBoundsHoleClaims(claims, boardsById)).toEqual([]);
    expect(findHoleCollisions(claims)).toEqual([]);
  });

  it('seeds a persisted non-zero rotation', () => {
    const rotated = SEATED_COMPONENT_NODES.find((node) => node.data.placement?.rotation !== 0);
    expect(rotated?.data.placement?.rotation).toBe(180);
  });

  it('associates seated pins with their board holes and copper traces', () => {
    const capacitor = SEATED_COMPONENT_NODES.find((node) => node.id === 'cap-d-bulk');
    const plus = capacitor?.data.ports.find((port) => port.id === 'plus')?.hole;
    const minus = capacitor?.data.ports.find((port) => port.id === 'minus')?.hole;
    if (!plus || !minus) throw new Error('capacitor fixture has no resolved pin holes');
    expect(netForHole(PECA_D_BOARD, plus)).toBe('8V_MOT');
    expect(netForHole(PECA_D_BOARD, minus)).toBe('GND_MOT');
  });

  it('keeps the rotated UART divider junction separate from ground', () => {
    const r1 = SEATED_COMPONENT_NODES.find((node) => node.id === 'res-e-r1');
    const r2 = SEATED_COMPONENT_NODES.find((node) => node.id === 'res-e-r2');
    const r1Junction = r1?.data.ports.find((port) => port.id === 'b')?.hole;
    const r2Junction = r2?.data.ports.find((port) => port.id === 'b')?.hole;
    const r2Ground = r2?.data.ports.find((port) => port.id === 'a')?.hole;
    if (!r1Junction || !r2Junction || !r2Ground) {
      throw new Error('UART divider fixture has no resolved pin holes');
    }
    expect(holesOnSameTrace(PECA_E_BOARD, r1Junction, r2Junction)).toBe(true);
    expect(netForHole(PECA_E_BOARD, r2Junction)).toBeUndefined();
    expect(netForHole(PECA_E_BOARD, r2Ground)).toBe('GND_SYS');
  });

  it('connects external components directly to board holes and traces', () => {
    expect(PHYSICAL_WIRE_EDGES.some((edge) => edge.targetPort?.startsWith('hole:'))).toBe(true);
    expect(PHYSICAL_WIRE_EDGES.some((edge) => edge.targetPort?.startsWith('trace:'))).toBe(true);
  });
});
