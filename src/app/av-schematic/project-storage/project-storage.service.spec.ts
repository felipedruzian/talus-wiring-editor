import { TestBed } from '@angular/core/testing';
import { NgDiagramModelService, NgDiagramViewportService, type Edge, type Node } from 'ng-diagram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EdgeTemplateType,
  NodeTemplateType,
  type DeviceNodeData,
  type WireEdgeData,
} from '../diagram/model/interfaces';
import { ArtworkAssetStore } from '../diagram/artwork/artwork-asset.store';
import { ProjectStorageService } from './project-storage.service';
import { InMemoryModelAdapter } from '../diagram/model/testing/in-memory-model-adapter';
import { UndoableDiagramModelAdapter } from '../diagram/model/undoable-model';

const component = (
  id: string,
  portId: string,
  direction: 'input' | 'output',
  x: number,
): Node<DeviceNodeData> => ({
  id,
  type: NodeTemplateType.DeviceNode,
  position: { x, y: 0 },
  data: {
    type: 'device',
    deviceId: id.toUpperCase(),
    manufacturer: 'Talus',
    model: id,
    ports: [{ id: portId, label: portId.toUpperCase(), direction }],
  },
});

const wire = (): Edge<WireEdgeData> => ({
  id: 'wire-1',
  type: EdgeTemplateType.WireEdge,
  source: 'source',
  sourcePort: 'out',
  target: 'target',
  targetPort: 'in',
  routingMode: 'manual',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 40 },
    { x: 200, y: 40 },
  ],
  data: {
    type: 'wire',
    wireId: 'W1',
    netId: 'motor',
    color: '#123456',
    colorCode: '#123456',
    gauge: '22 AWG',
    length: '120 mm',
    notes: 'Passar pela borda da placa',
  },
});

const response = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('ProjectStorageService save/open', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips the committed wire model through PUT, GET, parse and model replacement', async () => {
    let currentNodes: Node[] = [
      component('source', 'out', 'output', 0),
      component('target', 'in', 'input', 200),
    ];
    let currentEdges: Edge[] = [wire()];
    let savedBody: unknown;
    let restoredNodes: Node[] = [];
    let restoredEdges: Edge[] = [];
    const deleteEdges = vi.fn(() => {
      currentEdges = [];
      return Promise.resolve();
    });
    const deleteNodes = vi.fn(() => {
      currentNodes = [];
      return Promise.resolve();
    });
    const addNodes = vi.fn((nodes: Node[]) => {
      restoredNodes = nodes;
      currentNodes = nodes;
      return Promise.resolve();
    });
    const addEdges = vi.fn((edges: Edge[]) => {
      restoredEdges = edges;
      currentEdges = edges;
      return Promise.resolve();
    });
    const modelService = {
      getModel: () => ({
        getNodes: () => currentNodes,
        getEdges: () => currentEdges,
      }),
      getNodeById: (nodeId: string) => currentNodes.find((node) => node.id === nodeId),
      deleteEdges,
      deleteNodes,
      addNodes,
      addEdges,
      updateEdges: vi.fn(() => Promise.resolve()),
    };
    const zoomToFit = vi.fn(() => Promise.resolve());
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        if (typeof init.body !== 'string') {
          throw new TypeError('Expected the saved project body to be a JSON string');
        }
        savedBody = JSON.parse(init.body);
        return Promise.resolve(response({ id: 'project-1', saved: true }));
      }
      return Promise.resolve(response(savedBody));
    });
    vi.stubGlobal('fetch', fetchMock);
    TestBed.configureTestingModule({
      providers: [
        ProjectStorageService,
        { provide: NgDiagramModelService, useValue: modelService },
        { provide: NgDiagramViewportService, useValue: { zoomToFit } },
      ],
    });
    const storage = TestBed.inject(ProjectStorageService);

    await storage.save('project-1');

    expect(savedBody).toMatchObject({
      formatVersion: 6,
      electrical: {
        cables: [{ name: 'W1', colors: ['#123456'] }],
        nets: [
          {
            conductors: [
              expect.objectContaining({
                id: 'wire-1',
                gauge: '22 AWG',
                length: '120 mm',
                notes: 'Passar pela borda da placa',
              }),
            ],
          },
        ],
      },
      layout: {
        conductors: [
          expect.objectContaining({
            conductorId: 'wire-1',
            routingMode: 'manual',
            points: wire().points,
          }),
        ],
      },
      resources: { artworkAssets: {}, categories: {} },
    });
    expect(storage.status()).toBe('success');

    currentNodes = [component('old-node', 'old-port', 'output', 0)];
    currentEdges = [{ ...wire(), id: 'old-wire' }];
    await storage.open('project-1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/projects/project-1', { method: 'GET' });
    expect(deleteEdges).toHaveBeenCalledWith(['old-wire']);
    expect(deleteNodes).toHaveBeenCalledWith(['old-node']);
    expect(deleteEdges.mock.invocationCallOrder[0]).toBeLessThan(
      deleteNodes.mock.invocationCallOrder[0],
    );
    expect(addNodes).toHaveBeenCalledWith(expect.any(Array), { waitForMeasurements: true });
    expect(restoredNodes).toHaveLength(2);
    expect(restoredEdges).toHaveLength(1);
    expect(restoredEdges[0]).toMatchObject({
      id: 'wire-1',
      routingMode: 'manual',
      points: wire().points,
      data: {
        type: 'wire',
        wireId: 'W1',
        color: '#123456',
        colorCode: '#123456',
        gauge: '22 AWG',
        length: '120 mm',
        notes: 'Passar pela borda da placa',
      },
    });
    const restoredWireData = restoredEdges[0]?.data as WireEdgeData | undefined;
    expect(typeof restoredWireData?.netId).toBe('string');
    expect(storage.status()).toBe('success');
    expect(storage.message()).toContain('carregado com sucesso');
    expect(zoomToFit).toHaveBeenCalledOnce();
  });

  it('does not undo into the previous project after model replacement', async () => {
    const oldNode: Node = { id: 'old-project-node', position: { x: 0, y: 0 }, data: {} };
    const history = new UndoableDiagramModelAdapter(new InMemoryModelAdapter([oldNode], []));
    history.updateNodes([{ ...oldNode, position: { x: 20, y: 0 } }]);

    const modelService = {
      getModel: () => history,
      deleteEdges: vi.fn((ids: string[]) => {
        const removed = new Set(ids);
        history.updateEdges((edges) => edges.filter((edge) => !removed.has(edge.id)));
        return Promise.resolve();
      }),
      deleteNodes: vi.fn((ids: string[]) => {
        const removed = new Set(ids);
        history.updateNodes((nodes) => nodes.filter((node) => !removed.has(node.id)));
        return Promise.resolve();
      }),
      addNodes: vi.fn((nodes: Node[]) => {
        history.updateNodes((current) => [...current, ...nodes]);
        return Promise.resolve();
      }),
      addEdges: vi.fn((edges: Edge[]) => {
        history.updateEdges((current) => [...current, ...edges]);
        return Promise.resolve();
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        ProjectStorageService,
        { provide: NgDiagramModelService, useValue: modelService },
        { provide: NgDiagramViewportService, useValue: { zoomToFit: vi.fn() } },
      ],
    });

    await TestBed.inject(ProjectStorageService).replaceProject({
      formatVersion: 6,
      electrical: { components: [], junctions: [], cables: [], nets: [] },
      layout: { boards: [], components: [], junctions: [], conductors: [] },
      resources: { artworkAssets: {}, categories: {} },
    });

    expect(history.getNodes()).toEqual([]);
    history.undo();
    expect(history.getNodes()).toEqual([]);
    expect(history.getEdges()).toEqual([]);
  });

  it('hydrates project artwork before adding pictured nodes to the live model', async () => {
    const hash = '431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460';
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const project = {
      formatVersion: 5,
      electrical: {
        components: [
          {
            id: 'pictured',
            deviceId: 'PIC1',
            manufacturer: 'Talus',
            model: 'Imagem',
            pins: [{ id: 'p1', label: 'P1', direction: 'input' }],
          },
        ],
        junctions: [],
        cables: [],
        nets: [],
      },
      layout: {
        boards: [],
        components: [
          {
            componentId: 'pictured',
            position: { x: 10, y: 20 },
            visualPlane: 10,
            footprintId: 'pictured-footprint',
            footprint: {
              id: 'pictured-footprint',
              label: 'Com imagem',
              rows: 1,
              cols: 1,
              pins: [{ id: 'p1', label: 'P1', cell: { row: 0, col: 0 } }],
              shapes: [],
              artwork: { assetHash: hash, x: 0, y: 0, width: 1, height: 1 },
            },
          },
        ],
        junctions: [],
        conductors: [],
      },
      resources: {
        artworkAssets: {
          [hash]: {
            mimeType: 'image/png',
            width: 1,
            height: 1,
            byteLength: 68,
            dataUrl,
          },
        },
        categories: { uncategorized: { name: 'Não categorizado', prefix: 'DEV' } },
      },
    };
    const artworkStore = new ArtworkAssetStore();
    const registerMany = vi.spyOn(artworkStore, 'registerMany');
    const addNodes = vi.fn(() => {
      expect(registerMany).toHaveBeenCalledWith([expect.objectContaining({ hash, dataUrl })]);
      return Promise.resolve();
    });
    const modelService = {
      getModel: () => ({ getNodes: () => [], getEdges: () => [], resetHistory: vi.fn() }),
      deleteEdges: vi.fn(() => Promise.resolve()),
      deleteNodes: vi.fn(() => Promise.resolve()),
      addNodes,
      addEdges: vi.fn(() => Promise.resolve()),
      updateEdges: vi.fn(() => Promise.resolve()),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response(project))),
    );
    TestBed.configureTestingModule({
      providers: [
        ProjectStorageService,
        { provide: NgDiagramModelService, useValue: modelService },
        { provide: ArtworkAssetStore, useValue: artworkStore },
      ],
    });

    await TestBed.inject(ProjectStorageService).open('pictured-project');

    expect(addNodes).toHaveBeenCalledWith(expect.any(Array), { waitForMeasurements: true });
  });
});
