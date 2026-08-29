// Shared adversarial corpus for the TypeScript and plain-Node validators.

import { OPERATIONAL_LIMITS } from './operational-limits.mjs';

function holes(rows, cols) {
  return Array.from({ length: rows * cols }, (_, index) => ({
    row: Math.floor(index / cols),
    col: index % cols,
  }));
}

function basePhysicalProject() {
  const junctionId = 'copper:board-17/trace%3Avcc';
  return {
    formatVersion: 2,
    electrical: {
      components: [
        {
          id: 'link-1',
          deviceId: 'LINK-1',
          manufacturer: 'project',
          model: 'link',
          pins: [
            { id: 'a', label: 'A', direction: 'input' },
            { id: 'b', label: 'B', direction: 'output' },
          ],
        },
      ],
      junctions: [
        { id: junctionId, label: 'VCC rail', kind: 'rail', wirevizName: junctionId },
      ],
      cables: [],
      nets: [
        {
          id: 'net-authored',
          name: 'AUTHORED',
          endpoints: [
            { kind: 'pin', componentId: 'link-1', pinId: 'a' },
            { kind: 'pin', componentId: 'link-1', pinId: 'b' },
            { kind: 'junction', junctionId },
          ],
          conductors: [
            {
              id: 'binding:link-1/a',
              from: { kind: 'pin', componentId: 'link-1', pinId: 'a' },
              to: { kind: 'junction', junctionId },
            },
            {
              id: 'binding:link-1/b',
              from: { kind: 'pin', componentId: 'link-1', pinId: 'b' },
              to: { kind: 'junction', junctionId },
            },
          ],
        },
      ],
    },
    layout: {
      boards: [
        {
          id: 'board-17',
          label: 'Board 17',
          rows: 3,
          cols: 4,
          pitch: 17,
          holes: holes(3, 4),
          holeDiameter: 5,
          traces: [
            {
              id: 'vcc',
              label: 'L3',
              net: 'VCC',
              segments: [{ from: { row: 2, col: 0 }, to: { row: 2, col: 3 } }],
            },
          ],
          position: { x: 10, y: 20 },
        },
      ],
      components: [
        {
          componentId: 'link-1',
          position: { x: 999, y: -999 },
          boardId: 'board-17',
          footprintId: 'inline-link',
          footprint: {
            id: 'inline-link',
            label: 'Inline link',
            rows: 1,
            cols: 2,
            pins: [
              { id: 'a', label: 'A', cell: { row: 0, col: 0 }, primary: true },
              { id: 'b', label: 'B', cell: { row: 0, col: 1 } },
            ],
            shapes: [
              { kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, stroke: 'lead' },
            ],
            bodyCells: [],
          },
          placement: { boardId: 'board-17', anchor: { row: 2, col: 1 }, rotation: 0 },
          pinHoles: [
            { pinId: 'a', hole: { row: 0, col: 0 } },
            { pinId: 'b', hole: { row: 0, col: 1 } },
          ],
        },
      ],
      junctions: [
        {
          junctionId,
          position: { x: -1, y: -1 },
          taps: 4,
          boardId: 'board-17',
          hole: { row: 2, col: 0 },
          boardPort: 'trace:vcc',
        },
      ],
      conductors: [
        { conductorId: 'binding:link-1/a', toTap: 1, physicalBinding: true },
        { conductorId: 'binding:link-1/b', toTap: 2, physicalBinding: true },
      ],
    },
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function changed(name, change) {
  const raw = basePhysicalProject();
  change(raw);
  return { name, accepted: false, raw };
}

const completeGridWithoutHoleList = basePhysicalProject();
delete completeGridWithoutHoleList.layout.boards[0].holes;

const boardWithCenterGapAndNotes = basePhysicalProject();
boardWithCenterGapAndNotes.layout.boards[0].centerGap = 12;
boardWithCenterGapAndNotes.layout.boards[0].notes = 'Canal central e bulk incorporado';

const emptyBoard = {
  formatVersion: 2,
  electrical: { components: [], junctions: [], cables: [], nets: [] },
  layout: {
    boards: [
      {
        id: 'empty-board',
        label: 'Empty board',
        rows: 2,
        cols: 2,
        pitch: 17,
        holes: [],
        position: { x: 0, y: 0 },
      },
    ],
    components: [],
    junctions: [],
    conductors: [],
  },
};

export const canonicalValidationCorpus = [
  {
    name: 'accepts, normalizes and preserves authored net names over copper labels',
    accepted: true,
    raw: basePhysicalProject(),
  },
  {
    name: 'accepts an omitted hole list as a complete rectangular grid',
    accepted: true,
    raw: completeGridWithoutHoleList,
  },
  {
    name: 'accepts centerGap and notes on a physical board',
    accepted: true,
    raw: boardWithCenterGapAndNotes,
  },
  {
    name: 'accepts an explicit empty hole list as a board with no holes',
    accepted: true,
    raw: emptyBoard,
  },
  changed('rejects footprintId without an embedded footprint', (raw) => {
    delete raw.layout.components[0].footprint;
  }),
  changed('rejects a mismatched embedded footprint id', (raw) => {
    raw.layout.components[0].footprint.id = 'different-footprint';
  }),
  changed('rejects a placement beyond board bounds', (raw) => {
    raw.layout.components[0].placement.anchor.col = 3;
  }),
  changed('rejects an occupied hole omitted by a sparse board', (raw) => {
    raw.layout.boards[0].holes = raw.layout.boards[0].holes.filter(
      (hole) => hole.row !== 2 || hole.col !== 2,
    );
  }),
  changed('rejects colliding manual hole claims', (raw) => {
    raw.electrical.components.push({
      id: 'probe',
      deviceId: 'PROBE',
      manufacturer: '',
      model: '',
      pins: [{ id: 'p', label: 'P', direction: 'input' }],
    });
    raw.layout.components.push({
      componentId: 'probe',
      position: { x: 0, y: 0 },
      boardId: 'board-17',
      pinHoles: [{ pinId: 'p', hole: { row: 2, col: 1 } }],
    });
  }),
  changed('rejects a component pin absent from its footprint', (raw) => {
    raw.layout.components[0].footprint.pins[0].id = 'unknown-pin';
  }),
  changed('rejects a footprint pin cell outside its box', (raw) => {
    raw.layout.components[0].footprint.pins[1].cell.col = 2;
  }),
  changed('rejects a missing pin-to-copper binding', (raw) => {
    raw.layout.conductors.pop();
  }),
  changed('rejects a boardPort for a missing trace', (raw) => {
    raw.layout.junctions[0].boardPort = 'trace:missing';
  }),
  changed('rejects dimensions above the operational limit', (raw) => {
    raw.layout.boards[0].rows = 129;
  }),
  changed('rejects a hole diameter larger than pitch', (raw) => {
    raw.layout.boards[0].holeDiameter = 18;
  }),
  changed('rejects a negative centerGap', (raw) => {
    raw.layout.boards[0].centerGap = -1;
  }),
  changed('rejects a zero centerGap', (raw) => {
    raw.layout.boards[0].centerGap = 0;
  }),
  changed('rejects a non-numeric centerGap', (raw) => {
    raw.layout.boards[0].centerGap = '12';
  }),
  changed('rejects a centerGap above the board-pitch limit', (raw) => {
    raw.layout.boards[0].centerGap = OPERATIONAL_LIMITS.maxBoardPitch + 1;
  }),
  changed('rejects non-string board notes', (raw) => {
    raw.layout.boards[0].notes = ['bulk'];
  }),
  changed('rejects a diagonal trace', (raw) => {
    raw.layout.boards[0].traces[0].segments[0].to = { row: 1, col: 3 };
  }),
  changed('rejects overlapping traces', (raw) => {
    raw.layout.boards[0].traces.push({
      id: 'overlap',
      label: 'Overlap',
      segments: [{ from: { row: 1, col: 1 }, to: { row: 2, col: 1 } }],
    });
  }),
  changed('rejects one electrical net that shorts distinct named copper', (raw) => {
    const junctionId = 'copper:board-17/trace%3Agnd';
    raw.layout.boards[0].traces.push({
      id: 'gnd',
      label: 'L2',
      net: 'GND',
      segments: [{ from: { row: 1, col: 0 }, to: { row: 1, col: 3 } }],
    });
    raw.electrical.junctions.push({
      id: junctionId,
      label: 'GND rail',
      kind: 'rail',
      wirevizName: junctionId,
    });
    raw.electrical.nets[0].endpoints.push({ kind: 'junction', junctionId });
    raw.electrical.nets[0].conductors.push({
      id: 'copper-short',
      from: { kind: 'junction', junctionId: raw.electrical.junctions[0].id },
      to: { kind: 'junction', junctionId },
    });
    raw.layout.junctions.push({
      junctionId,
      position: { x: -1, y: -1 },
      taps: 4,
      boardId: 'board-17',
      hole: { row: 1, col: 0 },
      boardPort: 'trace:gnd',
    });
    raw.layout.conductors.push({ conductorId: 'copper-short' });
  }),
  changed('rejects an invalid footprint shape paint', (raw) => {
    raw.layout.components[0].footprint.shapes[0].stroke = 'invisible';
  }),
];

export { basePhysicalProject };
