import { describe, expect, it } from 'vitest';
import { ARDUINO_NANO_ARTWORK, TB6612FNG_ARTWORK } from '../artwork/trusted-component-artwork';
import { createBreadboard830 } from './breadboard';
import { holeLocalPoint } from './board-geometry';
import {
  anchorAfterRotation,
  anchorForNodePosition,
  cellToHole,
  deviceHoleClaims,
  findFreeAnchor,
  footprintArtworkPoints,
  footprintDrawnExtent,
  footprintNodeSize,
  footprintOccupiedHoles,
  footprintPinHoles,
  resolveFootprintPinHoles,
  isPlacementInBounds,
  placementNodePosition,
  rotateCell,
  rotatedFootprintBox,
  stepRotation,
  syncPortHolesToPlacement,
  validatePlacement,
} from './footprint-geometry';
import {
  ARDUINO_NANO_FOOTPRINT,
  BUZZER_ACTIVE_12MM_FOOTPRINT,
  CAP_100N_FOOTPRINT,
  CAP_470U_25V_FOOTPRINT,
  RESISTOR_1K_FOOTPRINT,
  TB6612FNG_FOOTPRINT,
  resizeAxialFootprintSpan,
  type Footprint,
} from './footprint';
import { type BoardNodeData, type DeviceNodeData, type DevicePlacement } from './interfaces';
import { footprintPinViews } from '../node/footprint-node.component';

const board: BoardNodeData = {
  type: 'board',
  boardId: 'board-test',
  label: 'Board test',
  rows: 5,
  cols: 7,
  pitch: 20,
};

const footprint: Footprint = {
  id: 'test-module',
  label: 'Test module',
  rows: 2,
  cols: 3,
  pins: [
    { id: 'a', label: 'A', cell: { row: 0, col: 0 } },
    { id: 'b', label: 'B', cell: { row: 1, col: 2 } },
  ],
  shapes: [],
};

describe('footprint rotation', () => {
  it('rotates cells clockwise inside the footprint box', () => {
    expect(rotateCell({ row: 0, col: 0 }, 0, footprint)).toEqual({ row: 0, col: 0 });
    expect(rotateCell({ row: 0, col: 0 }, 90, footprint)).toEqual({ row: 0, col: 1 });
    expect(rotateCell({ row: 0, col: 0 }, 180, footprint)).toEqual({ row: 1, col: 2 });
    expect(rotateCell({ row: 0, col: 0 }, 270, footprint)).toEqual({ row: 2, col: 0 });
  });

  it('swaps the bounding axes at 90 and 270 degrees', () => {
    expect(rotatedFootprintBox(footprint, 0)).toEqual({ rows: 2, cols: 3 });
    expect(rotatedFootprintBox(footprint, 90)).toEqual({ rows: 3, cols: 2 });
    expect(rotatedFootprintBox(footprint, 270)).toEqual({ rows: 3, cols: 2 });
  });

  it('steps through all four allowed rotations in both directions', () => {
    expect(stepRotation(0, 1)).toBe(90);
    expect(stepRotation(270, 1)).toBe(0);
    expect(stepRotation(0, -1)).toBe(270);
  });

  it('maps pins to rotated board holes', () => {
    const placement: DevicePlacement = {
      boardId: board.boardId,
      anchor: { row: 1, col: 2 },
      rotation: 90,
    };
    expect(footprintPinHoles(footprint, placement)).toEqual([
      { pinId: 'a', label: 'A', cell: { row: 0, col: 1 }, hole: { row: 1, col: 3 } },
      { pinId: 'b', label: 'B', cell: { row: 2, col: 0 }, hole: { row: 3, col: 2 } },
    ]);
    expect(cellToHole({ row: 1, col: 2 }, footprint, placement)).toEqual({ row: 3, col: 2 });
  });

  it('returns to the exact anchor after four rotations without pixel rounding drift', () => {
    const initial: DevicePlacement = {
      boardId: board.boardId,
      anchor: { row: 2, col: 3 },
      rotation: 0,
    };
    const pivot = footprint.pins[0].cell;
    const pivotHole = cellToHole(pivot, footprint, initial);
    let placement = initial;

    for (let turn = 0; turn < 4; turn++) {
      const rotation = stepRotation(placement.rotation, 1);
      placement = {
        ...placement,
        anchor: anchorAfterRotation(footprint, placement, rotation),
        rotation,
      };
      expect(cellToHole(pivot, footprint, placement)).toEqual(pivotHole);
    }

    expect(placement).toEqual(initial);
  });
});

describe('pitch and snap', () => {
  const frame = { board, position: { x: 100, y: 200 } };
  const placement: DevicePlacement = {
    boardId: board.boardId,
    anchor: { row: 2, col: 3 },
    rotation: 0,
  };

  it('derives node pixels from the board pitch and anchor', () => {
    expect(placementNodePosition(frame, placement)).toEqual({ x: 161, y: 241 });
    expect(footprintNodeSize(footprint, 0, board.pitch)).toEqual({ width: 70, height: 50 });
  });

  it('snaps a nearby dropped node back to the same hole', () => {
    const exact = placementNodePosition(frame, placement);
    expect(anchorForNodePosition(frame, { x: exact.x + 7, y: exact.y - 8 })).toEqual(
      placement.anchor,
    );
  });

  it('derives exact geometry for a pitch other than 20', () => {
    const pitch17Board = { ...board, pitch: 17 };
    const pitch17Frame = { board: pitch17Board, position: { x: 100, y: 200 } };

    expect(placementNodePosition(pitch17Frame, placement)).toEqual({ x: 154.25, y: 237.25 });
    expect(footprintNodeSize(footprint, 0, pitch17Board.pitch)).toEqual({
      width: 59.5,
      height: 42.5,
    });
    expect(anchorForNodePosition(pitch17Frame, { x: 158.25, y: 232.25 })).toEqual(placement.anchor);
  });

  it('cannot derive an anchor when the board explicitly has no holes', () => {
    expect(
      anchorForNodePosition(
        { board: { ...board, holes: [] }, position: { x: 100, y: 200 } },
        { x: 101, y: 201 },
      ),
    ).toBeNull();
  });
});

describe('bounds and occupancy', () => {
  it('uses the bundled Nano bounds without converting the SVG into a raster upload', () => {
    const extent = footprintDrawnExtent(ARDUINO_NANO_FOOTPRINT, 0, null);
    expect(ARDUINO_NANO_FOOTPRINT.artwork).toBeUndefined();
    expect(extent).toEqual({ left: -1.5, right: 15.5, top: -0.75, bottom: 6.75 });

    for (const rotation of [0, 90, 180, 270] as const) {
      const points = footprintArtworkPoints(
        ARDUINO_NANO_FOOTPRINT,
        ARDUINO_NANO_ARTWORK.bounds,
        rotation,
        null,
      );
      expect(
        Math.hypot(points.horizontal.x - points.origin.x, points.horizontal.y - points.origin.y),
      ).toBe(17);
      expect(
        Math.hypot(points.vertical.x - points.origin.x, points.vertical.y - points.origin.y),
      ).toBe(7);
    }
  });

  it('snaps, rotates and occupies the complete Nano body on integer holes', () => {
    const moduleBoard: BoardNodeData = {
      ...board,
      rows: 20,
      cols: 20,
    };
    const placement: DevicePlacement = {
      boardId: moduleBoard.boardId,
      anchor: { row: 2, col: 3 },
      rotation: 90,
    };

    expect(isPlacementInBounds(moduleBoard, ARDUINO_NANO_FOOTPRINT, placement)).toBe(true);
    expect(
      validatePlacement('nano', moduleBoard, ARDUINO_NANO_FOOTPRINT, placement, []),
    ).toBeNull();
    expect(footprintOccupiedHoles(ARDUINO_NANO_FOOTPRINT, placement)).toHaveLength(7 * 15);
    expect(
      footprintPinHoles(ARDUINO_NANO_FOOTPRINT, placement).find((pin) => pin.pinId === 'd1'),
    ).toMatchObject({ hole: { row: 16, col: 3 } });
  });

  it('maps every passive terminal to integer holes through rotation', () => {
    const passiveBoard: BoardNodeData = { ...board, rows: 20, cols: 20 };
    const passives = [
      BUZZER_ACTIVE_12MM_FOOTPRINT,
      RESISTOR_1K_FOOTPRINT,
      CAP_470U_25V_FOOTPRINT,
      CAP_100N_FOOTPRINT,
    ];
    for (const passive of passives) {
      const placement: DevicePlacement = {
        boardId: passiveBoard.boardId,
        anchor: { row: 2, col: 3 },
        rotation: 90,
      };
      expect(validatePlacement(passive.id, passiveBoard, passive, placement, [])).toBeNull();
      expect(footprintPinHoles(passive, placement)).toHaveLength(2);
      expect(
        footprintPinHoles(passive, placement).every(
          (pin) => Number.isInteger(pin.hole.row) && Number.isInteger(pin.hole.col),
        ),
      ).toBe(true);
    }
  });

  it('claims the complete selected resistor span and reports a collision on it', () => {
    const maximum = resizeAxialFootprintSpan(RESISTOR_1K_FOOTPRINT, 10);
    if (!maximum.ok) throw new Error(maximum.message);
    const placement: DevicePlacement = {
      boardId: board.boardId,
      anchor: { row: 1, col: 0 },
      rotation: 0,
    };
    const wideBoard = { ...board, cols: 12 };

    expect(footprintOccupiedHoles(maximum.footprint, placement)).toHaveLength(11);
    expect(
      validatePlacement('resistor', wideBoard, maximum.footprint, placement, [
        { boardId: board.boardId, ownerId: 'capacitor', hole: { row: 1, col: 6 } },
      ]),
    ).toMatchObject({
      kind: 'occupied',
      holes: [{ row: 1, col: 6 }],
      blockedBy: ['capacitor'],
    });
  });

  it('unites negative fractional artwork with node bounds without stretching it across a channel', () => {
    const artwork = {
      assetHash: 'a'.repeat(64),
      x: -1.5,
      y: -0.5,
      width: 17,
      height: 7,
    };
    const illustrated: Footprint = {
      ...footprint,
      rows: 7,
      cols: 15,
      artwork,
    };
    const channel = { cutY: 2.5, gapCells: 2 };
    const points = footprintArtworkPoints(illustrated, artwork, 0, channel);
    const extent = footprintDrawnExtent(illustrated, 0, channel);

    expect(
      Math.hypot(points.horizontal.x - points.origin.x, points.horizontal.y - points.origin.y),
    ).toBe(17);
    expect(
      Math.hypot(points.vertical.x - points.origin.x, points.vertical.y - points.origin.y),
    ).toBe(7);
    expect(points.origin).toEqual({ x: -1.5, y: 1.5 });
    expect(extent.left).toBe(-1.5);
    expect(extent.right).toBe(15.5);
    expect(footprintNodeSize(illustrated, 0, 20, channel).width).toBe(340);
  });

  it('includes custom vector shapes in the measured footprint extent', () => {
    const shaped: Footprint = {
      ...footprint,
      shapes: [{ kind: 'rect', x: -2, y: -1, width: 7, height: 4 }],
    };

    expect(footprintDrawnExtent(shaped, 0, null)).toMatchObject({
      left: -2,
      top: -1,
      right: 5,
      bottom: 3,
    });
  });

  it('reports whether the rotated box fits the arbitrary board grid', () => {
    expect(
      isPlacementInBounds(board, footprint, {
        anchor: { row: 3, col: 4 },
        rotation: 0,
      }),
    ).toBe(true);
    expect(
      isPlacementInBounds(board, footprint, {
        anchor: { row: 4, col: 5 },
        rotation: 0,
      }),
    ).toBe(false);
  });

  it('rejects a placement over a missing hole on a sparse board', () => {
    const sparseBoard: BoardNodeData = {
      ...board,
      holes: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 1, col: 0 },
        { row: 1, col: 2 },
      ],
    };
    expect(
      isPlacementInBounds(sparseBoard, footprint, {
        anchor: { row: 0, col: 0 },
        rotation: 0,
      }),
    ).toBe(false);
  });

  it('occupies every body cell by default, not only exposed pins', () => {
    const placement: DevicePlacement = {
      boardId: board.boardId,
      anchor: { row: 1, col: 1 },
      rotation: 0,
    };
    expect(footprintOccupiedHoles(footprint, placement)).toEqual([
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
    ]);
  });

  it('always claims pin holes even when sparse bodyCells omit them', () => {
    const sparseBody: Footprint = {
      ...footprint,
      bodyCells: [{ row: 0, col: 1 }],
    };
    const placement: DevicePlacement = {
      boardId: board.boardId,
      anchor: { row: 1, col: 1 },
      rotation: 0,
    };

    expect(footprintOccupiedHoles(sparseBody, placement)).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 1 },
      { row: 2, col: 3 },
    ]);
  });

  it('rejects a silent overlap and names the blocking component', () => {
    const placement: DevicePlacement = {
      boardId: board.boardId,
      anchor: { row: 1, col: 1 },
      rotation: 0,
    };
    expect(
      validatePlacement('moving', board, footprint, placement, [
        { boardId: board.boardId, ownerId: 'already-there', hole: { row: 2, col: 2 } },
      ]),
    ).toMatchObject({
      kind: 'occupied',
      holes: [{ row: 2, col: 2 }],
      blockedBy: ['already-there'],
    });
  });

  it('finds the next free seat when the preferred one is occupied', () => {
    expect(
      findFreeAnchor('moving', board, footprint, 0, { row: 0, col: 0 }, [
        { boardId: board.boardId, ownerId: 'blocker', hole: { row: 0, col: 0 } },
      ]),
    ).toEqual({ row: 0, col: 1 });
  });
});

describe('rigid module geometry on non-uniform boards', () => {
  const breadboard = createBreadboard830({
    boardId: 'bb-830',
    label: 'Breadboard 830',
    pitch: 20,
  });
  const boardPosition = { x: 80, y: 120 };

  for (const [name, module, artwork] of [
    ['Arduino Nano', ARDUINO_NANO_FOOTPRINT, ARDUINO_NANO_ARTWORK],
    ['TB6612FNG', TB6612FNG_FOOTPRINT, TB6612FNG_ARTWORK],
  ] as const) {
    for (const rotation of [0, 180] as const) {
      it(`keeps ${name} marker, port and hole coincident over the channel at ${rotation} degrees`, () => {
        const placement: DevicePlacement = {
          boardId: breadboard.boardId,
          anchor: { row: 5, col: 3 },
          rotation,
        };
        const resolution = resolveFootprintPinHoles(module, placement, breadboard);
        expect(resolution.missingPinIds).toEqual([]);
        expect(validatePlacement(name, breadboard, module, placement, [])).toBeNull();

        const nodePosition = placementNodePosition(
          { board: breadboard, position: boardPosition },
          placement,
          module,
        );
        const ports = module.pins.map((pin) => ({
          id: pin.id,
          label: pin.label,
          direction: 'input' as const,
        }));
        const views = new Map(
          footprintPinViews(module, rotation, breadboard.pitch, ports).map((pin) => [pin.id, pin]),
        );
        for (const pin of resolution.pins) {
          const view = views.get(pin.pinId);
          const marker = artwork.pins.find((candidate) => candidate.id === pin.pinId)?.marker;
          expect(view).toBeDefined();
          expect(marker).toBeDefined();
          const hole = holeLocalPoint(breadboard, pin.hole);
          expect(nodePosition.x + (view?.x ?? 0)).toBeCloseTo(boardPosition.x + hole.x);
          expect(nodePosition.y + (view?.y ?? 0)).toBeCloseTo(boardPosition.y + hole.y);
        }
        expect(new Set(resolution.pins.map((pin) => pin.hole.row))).toEqual(new Set([5, 9]));
      });
    }
  }

  it('rejects the formerly accepted Nano placement whose lower markers land in the trench', () => {
    const placement: DevicePlacement = {
      boardId: breadboard.boardId,
      anchor: { row: 4, col: 3 },
      rotation: 0,
    };
    const resolution = resolveFootprintPinHoles(ARDUINO_NANO_FOOTPRINT, placement, breadboard);
    expect(resolution.missingPinIds).toHaveLength(15);
    expect(
      validatePlacement('nano', breadboard, ARDUINO_NANO_FOOTPRINT, placement, []),
    ).toMatchObject({ kind: 'incompatible-grid' });
  });

  it('rejects a long-axis rotation that crosses spacer rows or the channel', () => {
    for (const rotation of [90, 270] as const) {
      expect(
        validatePlacement(
          'nano',
          breadboard,
          ARDUINO_NANO_FOOTPRINT,
          { boardId: breadboard.boardId, anchor: { row: 4, col: 20 }, rotation },
          [],
        ),
      ).toMatchObject({ kind: 'incompatible-grid' });
    }
  });

  it('supports all four rigid rotations on a uniform hole grid', () => {
    const uniform: BoardNodeData = {
      type: 'board',
      boardId: 'uniform',
      label: 'Uniform',
      rows: 30,
      cols: 30,
      pitch: 20,
    };
    for (const rotation of [0, 90, 180, 270] as const) {
      const placement = {
        boardId: uniform.boardId,
        anchor: { row: 3, col: 3 },
        rotation,
      };
      expect(validatePlacement('nano', uniform, ARDUINO_NANO_FOOTPRINT, placement, [])).toBeNull();
      expect(
        resolveFootprintPinHoles(ARDUINO_NANO_FOOTPRINT, placement, uniform).pins,
      ).toHaveLength(ARDUINO_NANO_FOOTPRINT.pins.length);
    }
  });

  it('uses the rendered board margin as physical surface at every rotation', () => {
    const uniform: BoardNodeData = {
      type: 'board',
      boardId: 'uniform-margin',
      label: 'Uniform with margin',
      rows: 6,
      cols: 6,
      pitch: 20,
    };
    const marginFootprint: Footprint = {
      id: 'margin-rigid',
      label: 'Margin rigid',
      rows: 2,
      cols: 3,
      pins: [
        {
          id: 'a',
          label: 'A',
          cell: { row: 0, col: 0 },
          artworkPoint: { x: 0, y: 0 },
        },
        {
          id: 'b',
          label: 'B',
          cell: { row: 1, col: 2 },
          artworkPoint: { x: 2, y: 1 },
        },
      ],
      shapes: [],
      physicalBounds: { x: -0.5, y: -0.5, width: 3, height: 2 },
    };

    for (const rotation of [0, 90, 180, 270] as const) {
      expect(
        validatePlacement(
          `margin-${rotation}`,
          uniform,
          marginFootprint,
          { boardId: uniform.boardId, anchor: { row: 0, col: 0 }, rotation },
          [],
        ),
      ).toBeNull();
    }
  });

  it('allows the Nano body to use the plastic margin at column one', () => {
    expect(
      validatePlacement(
        'nano-margin',
        breadboard,
        ARDUINO_NANO_FOOTPRINT,
        {
          boardId: breadboard.boardId,
          anchor: { row: 5, col: 1 },
          rotation: 0,
        },
        [],
      ),
    ).toBeNull();
  });

  it('claims holes below the Nano artwork overhang, not only its 7 x 15 header grid', () => {
    const placement: DevicePlacement = {
      boardId: breadboard.boardId,
      anchor: { row: 5, col: 3 },
      rotation: 0,
    };
    const occupied = footprintOccupiedHoles(ARDUINO_NANO_FOOTPRINT, placement, breadboard);
    expect(occupied).toContainEqual({ row: 5, col: 2 });
    expect(occupied).toContainEqual({ row: 5, col: 18 });
  });
});

describe('persisted pin association', () => {
  it('synchronizes exposed pin holes from placement and rotation', () => {
    const data: DeviceNodeData = {
      type: 'device',
      deviceId: 'TEST-1',
      manufacturer: 'Test',
      model: 'Module',
      footprintId: footprint.id,
      placement: { boardId: board.boardId, anchor: { row: 1, col: 2 }, rotation: 90 },
      ports: [
        { id: 'a', label: 'A', direction: 'input' },
        { id: 'b', label: 'B', direction: 'output' },
      ],
    };

    // This fixture footprint is local to the test and therefore is not in the
    // catalog. Exercise the catalog-backed path with the registered wire link.
    const catalogData: DeviceNodeData = {
      ...data,
      footprintId: 'wire-link',
      placement: { boardId: board.boardId, anchor: { row: 2, col: 1 }, rotation: 90 },
    };
    const synced = syncPortHolesToPlacement(catalogData);
    expect(synced.boardId).toBe(board.boardId);
    expect(synced.ports.map((port) => port.hole)).toEqual([
      { row: 2, col: 1 },
      { row: 4, col: 1 },
    ]);
    expect(deviceHoleClaims('wire-1', synced)).toHaveLength(2);
  });
});
