import { TestBed } from '@angular/core/testing';
import { NgDiagramModelService, NgDiagramService, type Edge, type Node } from 'ng-diagram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_FORMAT_VERSION,
  fromCanonicalProject,
  type CanonicalProjectV2,
} from '../diagram/model/canonical-project';
import { parseCanonicalProject } from '../diagram/model/canonical-project-parse';
import { electricallyEquivalent } from '../diagram/model/electrical-equivalence';
import { isWireEdge } from '../diagram/model/guards';
import { type WireEdgeData } from '../diagram/model/interfaces';
import { ProjectStorageService } from '../project-storage/project-storage.service';
import { exportWireViz } from '../wireviz-import/export-wireviz';
import {
  MULTIDROP_RAIL_PLACEMENT,
  MULTIDROP_RAIL_WIREVIZ_YAML,
} from '../wireviz-import/fixtures/multidrop-rail.fixture';
import { importWireViz } from '../wireviz-import/import-wireviz';
import { buildImportedProject } from '../wireviz-import/wireviz-exchange.service';
import { type WireVizImportOptions } from '../wireviz-import/wireviz-to-diagram';
import { stringifyYamlSubset } from '../wireviz-import/wireviz-yaml-emit';
import { ElementMutationService } from './element-mutation.service';
import {
  CUSTOM_COLOR_CHOICE,
  wireDataToFormData,
} from './components/wire-form/wire-form.mappers';

class ModelStub {
  nodes: Node[] = [];
  edges: Edge[] = [];

  readonly getModel = vi.fn(() => ({
    getNodes: () => this.nodes,
    getEdges: () => this.edges,
  }));
  readonly getEdgeById = vi.fn((id: string) => this.edges.find((edge) => edge.id === id));
  readonly updateEdgeData = vi.fn((id: string, data: WireEdgeData) => {
    const index = this.edges.findIndex((candidate) => candidate.id === id);
    if (index >= 0) this.edges[index] = { ...this.edges[index], data };
    return Promise.resolve();
  });
  readonly deleteEdges = vi.fn((ids: readonly string[]) => {
    const removed = new Set(ids);
    this.edges = this.edges.filter((edge) => !removed.has(edge.id));
    return Promise.resolve();
  });
  readonly deleteNodes = vi.fn((ids: readonly string[]) => {
    const removed = new Set(ids);
    this.nodes = this.nodes.filter((node) => !removed.has(node.id));
    return Promise.resolve();
  });
  readonly addNodes = vi.fn((nodes: readonly Node[]) => {
    this.nodes.push(...nodes);
    return Promise.resolve();
  });
  readonly addEdges = vi.fn((edges: readonly Edge[]) => {
    this.edges.push(...edges);
    return Promise.resolve();
  });
}

const diagramStub = {
  transaction: vi.fn((action: () => void) => {
    action();
    return Promise.resolve();
  }),
};

function emptyProject(): CanonicalProjectV2 {
  return {
    formatVersion: CANONICAL_FORMAT_VERSION,
    electrical: { components: [], junctions: [], cables: [], nets: [] },
    layout: { boards: [], components: [], junctions: [], conductors: [] },
  };
}

function identityOptions(project: CanonicalProjectV2): WireVizImportOptions {
  const placement: Record<string, string> = {};
  for (const component of project.electrical.components) {
    placement[component.wirevizName ?? component.deviceId] = component.id;
  }
  for (const junction of project.electrical.junctions) {
    placement[junction.wirevizName ?? junction.label] = junction.id;
  }

  return {
    placement,
    components: project.electrical.components.map((component) => ({
      id: component.id,
      deviceId: component.deviceId,
      manufacturer: component.manufacturer,
      model: component.model,
      category: component.category,
      location: component.location,
      pins: component.pins.map((pin) => ({
        id: pin.id,
        label: pin.label,
        direction: pin.direction,
        connectorType: pin.connectorType,
        wirevizDesignator: pin.wirevizDesignator,
        wirevizLabel: pin.wirevizLabel,
      })),
    })),
    junctions: project.electrical.junctions.map((junction) => ({
      id: junction.id,
      label: junction.label,
      kind: junction.kind,
    })),
  };
}

describe('ElementMutationService wire identity edits', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renames every conductor and the cable inventory through export and reimport', async () => {
    const model = new ModelStub();
    TestBed.configureTestingModule({
      providers: [
        ElementMutationService,
        ProjectStorageService,
        { provide: NgDiagramModelService, useValue: model },
        { provide: NgDiagramService, useValue: diagramStub },
      ],
    });
    const storage = TestBed.inject(ProjectStorageService);
    const mutation = TestBed.inject(ElementMutationService);
    const imported = importWireViz(MULTIDROP_RAIL_WIREVIZ_YAML, {
      placement: MULTIDROP_RAIL_PLACEMENT,
    });
    await storage.replaceProject(buildImportedProject(imported.electrical, emptyProject()));
    const harnessEdge = model.edges.find(
      (edge): edge is Edge<WireEdgeData> => isWireEdge(edge) && edge.data.wireId === 'HARNESS',
    );
    if (!harnessEdge) throw new Error('fixture has no HARNESS edge');

    await mutation.handleWireFieldChange({
      edgeId: harnessEdge.id,
      fields: ['wireId'],
      formData: { ...wireDataToFormData(harnessEdge.data), wireId: 'RENAMED' },
    });

    const snapshot = storage.snapshotProject();
    const names = snapshot.electrical.cables.map((cable) => cable.name);
    expect(names).toContain('RENAMED');
    expect(names).toContain('SPARE');
    expect(names).not.toContain('HARNESS');
    expect(names.filter((name) => name === 'RENAMED')).toHaveLength(1);
    expect(snapshot.electrical.cables.find((cable) => cable.name === 'RENAMED')).toMatchObject({
      wireCount: 3,
    });
    expect(
      model.edges.filter(isWireEdge).filter((edge) => edge.data.wireId === 'RENAMED'),
    ).toHaveLength(3);

    const exported = exportWireViz(snapshot.electrical);
    const reimported = importWireViz(exported.yaml, identityOptions(snapshot));
    expect(exported.yaml).toContain('RENAMED:');
    expect(exported.yaml).not.toContain('HARNESS:');
    expect(electricallyEquivalent(snapshot.electrical, reimported.electrical)).toBe(true);
  });

  it('removes direct-link metadata when an imported link receives a cable identity', async () => {
    const model = new ModelStub();
    TestBed.configureTestingModule({
      providers: [
        ElementMutationService,
        ProjectStorageService,
        { provide: NgDiagramModelService, useValue: model },
        { provide: NgDiagramService, useValue: diagramStub },
      ],
    });
    const storage = TestBed.inject(ProjectStorageService);
    const mutation = TestBed.inject(ElementMutationService);
    const imported = importWireViz(
      stringifyYamlSubset({
        connectors: { A: { pins: ['P'] }, B: { pins: ['P'] } },
        connections: [[{ A: ['P'] }, '-->', { B: ['P'] }]],
      }),
    );
    await storage.replaceProject(buildImportedProject(imported.electrical, emptyProject()));
    const directLink = model.edges.find(
      (edge): edge is Edge<WireEdgeData> => isWireEdge(edge) && edge.data.wirevizLink === '-->',
    );
    if (!directLink) throw new Error('fixture has no direct WireViz link');

    await mutation.handleWireFieldChange({
      edgeId: directLink.id,
      fields: ['wireId'],
      formData: { ...wireDataToFormData(directLink.data), wireId: 'W9' },
    });

    const edited = model.edges.find(
      (edge): edge is Edge<WireEdgeData> => isWireEdge(edge) && edge.id === directLink.id,
    );
    expect(edited?.data).toMatchObject({ wireId: 'W9' });
    expect(edited?.data.wirevizLink).toBeUndefined();

    const snapshot = storage.snapshotProject();
    const conductor = snapshot.electrical.nets[0].conductors[0];
    expect(conductor.cable).toEqual({ name: 'W9', wireIndex: 1 });
    expect(conductor.wirevizLink).toBeUndefined();

    const exported = exportWireViz(snapshot.electrical);
    const reimported = importWireViz(exported.yaml, identityOptions(snapshot));
    expect(exported.yaml).toContain('W9:');
    expect(exported.yaml).not.toContain('-->');
    expect(electricallyEquivalent(snapshot.electrical, reimported.electrical)).toBe(true);
  });

  it('edits color and metadata on one conductor without flattening its multi-drop net', async () => {
    const model = new ModelStub();
    TestBed.configureTestingModule({
      providers: [
        ElementMutationService,
        ProjectStorageService,
        { provide: NgDiagramModelService, useValue: model },
        { provide: NgDiagramService, useValue: diagramStub },
      ],
    });
    const storage = TestBed.inject(ProjectStorageService);
    const mutation = TestBed.inject(ElementMutationService);
    const imported = importWireViz(MULTIDROP_RAIL_WIREVIZ_YAML, {
      placement: MULTIDROP_RAIL_PLACEMENT,
    });
    await storage.replaceProject(buildImportedProject(imported.electrical, emptyProject()));
    const harnessEdges = model.edges.filter(
      (edge): edge is Edge<WireEdgeData> => isWireEdge(edge) && edge.data.wireId === 'HARNESS',
    );
    const selected = harnessEdges[1];
    if (!selected) throw new Error('fixture has fewer than two HARNESS conductors');
    const untouchedColors = new Map(
      harnessEdges.filter((edge) => edge.id !== selected.id).map((edge) => [edge.id, edge.data.color]),
    );

    await mutation.handleWireFieldChange({
      edgeId: selected.id,
      fields: ['colorChoice', 'customColor', 'gauge', 'length', 'note'],
      formData: {
        ...wireDataToFormData(selected.data),
        colorChoice: CUSTOM_COLOR_CHOICE,
        customColor: 'rebeccapurple',
        gauge: '22 AWG',
        length: '180 mm',
        note: 'Desvio junto ao painel',
      },
    });

    for (const edge of harnessEdges.filter((candidate) => candidate.id !== selected.id)) {
      const live = model.edges.find((candidate) => candidate.id === edge.id);
      expect(isWireEdge(live) ? live.data.color : undefined).toBe(untouchedColors.get(edge.id));
    }

    const selectedIndex = model.edges.findIndex((edge) => edge.id === selected.id);
    if (selectedIndex < 0) throw new Error('selected conductor disappeared');
    model.edges[selectedIndex] = {
      ...model.edges[selectedIndex],
      routingMode: 'manual',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 80 },
      ],
    };

    const snapshot = storage.snapshotProject();
    const net = snapshot.electrical.nets.find((candidate) =>
      candidate.conductors.some((conductor) => conductor.id === selected.id),
    );
    expect(net?.conductors).toHaveLength(3);
    expect(net?.conductors.find((conductor) => conductor.id === selected.id)).toMatchObject({
      color: 'rebeccapurple',
      gauge: '22 AWG',
      length: '180 mm',
      notes: 'Desvio junto ao painel',
    });
    expect(
      snapshot.layout.conductors.find((layout) => layout.conductorId === selected.id),
    ).toMatchObject({
      conductorId: selected.id,
      routingMode: 'manual',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 80 },
      ],
    });

    const restored = fromCanonicalProject(parseCanonicalProject(structuredClone(snapshot)));
    const restoredSelected = restored.edges.find((edge) => edge.id === selected.id);
    expect(restoredSelected?.data).toMatchObject({
      color: 'rebeccapurple',
      gauge: '22 AWG',
      length: '180 mm',
      notes: 'Desvio junto ao painel',
    });
    expect(restoredSelected?.data.colorCode).toBeUndefined();
    expect(
      restoredSelected ? wireDataToFormData(restoredSelected.data).colorChoice : undefined,
    ).toBe(CUSTOM_COLOR_CHOICE);
    expect(restoredSelected).toMatchObject({
      routingMode: 'manual',
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 80 },
      ],
    });
    const exported = exportWireViz(snapshot.electrical);
    expect(exported.report.entries.some((entry) => entry.code === 'color-not-representable')).toBe(
      true,
    );
    expect(exported.yaml).not.toContain('rebeccapurple');
  });
});
