// One adversarial corpus consumed unchanged by the TypeScript and plain-Node
// validators. Keep this file free of framework imports so either runner can
// load it without coupling the server to the Angular build.

function basePhysicalProject() {
  return {
    formatVersion: 1,
    boards: [
      {
        id: 'board-17',
        label: 'Board 17',
        rows: 3,
        cols: 4,
        pitch: 17,
        holes: Array.from({ length: 12 }, (_, index) => ({
          row: Math.floor(index / 4),
          col: index % 4,
        })),
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
        id: 'link-1',
        deviceId: 'LINK-1',
        manufacturer: 'project',
        model: 'link',
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
          shapes: [{ kind: 'line', x1: 0, y1: 0, x2: 1, y2: 0, stroke: 'lead' }],
          bodyCells: [],
        },
        placement: { boardId: 'board-17', anchor: { row: 0, col: 1 }, rotation: 0 },
        position: { x: 999, y: -999 },
        pins: [
          { id: 'a', label: 'A', direction: 'input', hole: { row: 2, col: 3 } },
          { id: 'b', label: 'B', direction: 'output', hole: { row: 2, col: 3 } },
        ],
      },
    ],
    nets: [
      {
        id: 'wire-1',
        wireId: 'W1',
        source: { componentId: 'link-1', pinId: 'a' },
        target: { componentId: 'board-17', pinId: 'trace:vcc' },
      },
    ],
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
delete completeGridWithoutHoleList.boards[0].holes;

const emptyBoard = {
  formatVersion: 1,
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
  nets: [],
};

export const canonicalValidationCorpus = [
  {
    name: 'accepts and reconciles a self-contained pitch-17 project',
    accepted: true,
    raw: basePhysicalProject(),
  },
  {
    name: 'accepts an omitted hole list as a complete rectangular grid',
    accepted: true,
    raw: completeGridWithoutHoleList,
  },
  {
    name: 'accepts an explicit empty hole list as a board with no holes',
    accepted: true,
    raw: emptyBoard,
  },
  changed('rejects footprintId without an embedded footprint', (raw) => {
    delete raw.components[0].footprint;
  }),
  changed('rejects a mismatched embedded footprint id', (raw) => {
    raw.components[0].footprint.id = 'different-footprint';
  }),
  changed('rejects a placement beyond board bounds', (raw) => {
    raw.components[0].placement.anchor.col = 3;
  }),
  changed('rejects an occupied hole omitted by a sparse board', (raw) => {
    raw.boards[0].holes = raw.boards[0].holes.filter(
      (hole) => hole.row !== 0 || hole.col !== 2,
    );
  }),
  changed('rejects colliding footprint placements', (raw) => {
    const duplicate = clone(raw.components[0]);
    duplicate.id = 'link-2';
    duplicate.deviceId = 'LINK-2';
    raw.components.push(duplicate);
  }),
  changed('rejects a component pin absent from its footprint', (raw) => {
    raw.components[0].pins[0].id = 'unknown-pin';
  }),
  changed('rejects a footprint pin cell outside its box', (raw) => {
    raw.components[0].footprint.pins[1].cell.col = 2;
  }),
  changed('rejects physical net metadata that disagrees with copper', (raw) => {
    raw.nets[0].netId = 'GND';
  }),
  changed('rejects a board endpoint whose hole is absent', (raw) => {
    raw.nets[0].target.pinId = 'hole:9:9';
  }),
  changed('rejects a non-canonical board hole endpoint id', (raw) => {
    raw.nets[0].target.pinId = 'hole::2';
  }),
  changed('rejects unsafe integer board dimensions', (raw) => {
    raw.boards[0].rows = Number.MAX_SAFE_INTEGER + 1;
  }),
  changed('rejects placement on an explicit board with no holes', (raw) => {
    raw.boards[0].holes = [];
    raw.boards[0].traces = [];
    raw.nets = [];
  }),
];
