import { TestBed } from '@angular/core/testing';
import { NgDiagramModelService, NgDiagramService, type Edge, type Node } from 'ng-diagram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_FORMAT_VERSION,
  type CanonicalProjectV2,
} from '../diagram/model/canonical-project';
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
import { ElementMutationService } from './element-mutation.service';

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
      formData: { wireId: 'RENAMED', wireType: '' },
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
});
