import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import {
  CANONICAL_FORMAT_VERSION,
  type CanonicalConductorLayout,
  type CanonicalElectrical,
  type CanonicalJunctionLayout,
  type CanonicalProjectV2,
} from '../diagram/model/canonical-project';
import { ProjectStorageService } from '../project-storage/project-storage.service';
import { exportWireViz, type WireVizExportResult } from './export-wireviz';
import {
  MULTIDROP_EXISTING_RAIL,
  MULTIDROP_RAIL_PLACEMENT,
  MULTIDROP_RAIL_WIREVIZ_YAML,
} from './fixtures/multidrop-rail.fixture';
import { importWireViz } from './import-wireviz';
import { type WireVizCompatibilityReport, type WireVizReportEntry } from './wireviz-report';
import { type WireVizImportOptions } from './wireviz-to-diagram';

export type WireVizExchangeStatus = 'idle' | 'loading' | 'success' | 'error';

export const WIREVIZ_YAML_DOWNLOAD = new InjectionToken<(yaml: string, filename: string) => void>(
  'WIREVIZ_YAML_DOWNLOAD',
  {
    factory: () => (yaml, filename) => {
      const url = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  },
);

@Injectable()
export class WireVizExchangeService {
  private readonly storage = inject(ProjectStorageService);
  private readonly download = inject(WIREVIZ_YAML_DOWNLOAD);

  private readonly _status = signal<WireVizExchangeStatus>('idle');
  private readonly _message = signal<string | null>(null);
  private readonly _report = signal<WireVizCompatibilityReport>({ entries: [] });

  readonly status = this._status.asReadonly();
  readonly message = this._message.asReadonly();
  readonly report = this._report.asReadonly();
  readonly reportEntries = computed<readonly WireVizReportEntry[]>(() => this._report().entries);
  readonly isBusy = computed(() => this._status() === 'loading');

  async importYaml(yaml: string, options?: WireVizImportOptions): Promise<boolean> {
    this.begin('Importando YAML WireViz...');
    try {
      const current = this.storage.snapshotImportSkeleton();
      const effectiveOptions = options ?? inferImportOptions(current);
      const imported = importWireViz(yaml, effectiveOptions);
      const project = buildImportedProject(imported.electrical, current);
      await this.storage.replaceProject(project);
      this._report.set(imported.report);
      this.succeed(
        `YAML importado: ${imported.electrical.nets.length} net(s), ` +
          `${imported.electrical.cables.length} cabo(s).`,
      );
      return true;
    } catch (error) {
      this.fail('import', `Falha ao importar WireViz: ${describeError(error)}`);
      return false;
    }
  }

  async loadMultidropFixture(): Promise<boolean> {
    return this.importYaml(MULTIDROP_RAIL_WIREVIZ_YAML, {
      placement: MULTIDROP_RAIL_PLACEMENT,
      junctions: [MULTIDROP_EXISTING_RAIL],
    });
  }

  exportYaml(): WireVizExportResult | null {
    this.begin('Exportando YAML WireViz...');
    try {
      const result = exportWireViz(this.storage.snapshotProject().electrical);
      this._report.set(result.report);
      this.succeed(`WireViz exportado com ${result.report.entries.length} item(ns) no relatório.`);
      return result;
    } catch (error) {
      this.fail('export', `Falha ao exportar WireViz: ${describeError(error)}`);
      return null;
    }
  }

  downloadYaml(filename = 'wiring.yml'): boolean {
    const result = this.exportYaml();
    if (!result) return false;
    this.download(result.yaml, filename);
    return true;
  }

  private begin(message: string): void {
    this._status.set('loading');
    this._message.set(message);
  }

  private succeed(message: string): void {
    this._status.set('success');
    this._message.set(message);
  }

  private fail(path: 'import' | 'export', message: string): void {
    this._status.set('error');
    this._message.set(message);
    this._report.set({
      entries: [{ severity: 'error', code: 'operation-failed', path, message }],
    });
  }
}

/**
 * Reuses only the identity/placement skeleton of the live project. WireViz
 * metadata always comes from the new import, so a previous snapshot cannot
 * conceal a lossy export by filling fields back in.
 */
function inferImportOptions(project: CanonicalProjectV2): WireVizImportOptions {
  const placement: Record<string, string> = {};
  for (const component of project.electrical.components) {
    const name = component.wirevizName ?? component.deviceId;
    if (name && placement[name] === undefined) placement[name] = component.id;
  }
  for (const junction of project.electrical.junctions) {
    const name = junction.wirevizName ?? junction.label;
    if (name && placement[name] === undefined) placement[name] = junction.id;
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

export function buildImportedProject(
  electrical: CanonicalElectrical,
  previous: CanonicalProjectV2,
): CanonicalProjectV2 {
  const previousComponents = new Map(
    previous.layout.components.map((layout) => [layout.componentId, layout]),
  );
  const previousJunctions = new Map(
    previous.layout.junctions.map((layout) => [layout.junctionId, layout]),
  );
  const previousConductors = new Map(
    previous.layout.conductors.map((layout) => [layout.conductorId, layout]),
  );
  const junctionDegree = junctionDegrees(electrical);

  const components = electrical.components.map((component, index) => {
    const existing = previousComponents.get(component.id);
    return (
      existing ?? {
        componentId: component.id,
        position: autoPosition(index, 0),
      }
    );
  });

  const junctions: CanonicalJunctionLayout[] = electrical.junctions.map((junction, index) => {
    const existing = previousJunctions.get(junction.id);
    const taps = Math.max(existing?.taps ?? 1, junctionDegree.get(junction.id) ?? 1);
    return existing
      ? { ...existing, taps }
      : {
          junctionId: junction.id,
          position: autoPosition(index, 1),
          taps,
        };
  });

  const tapCursor = new Map<string, number>();
  const conductors: CanonicalConductorLayout[] = electrical.nets.flatMap((net) =>
    net.conductors.map((conductor) => {
      const existing = previousConductors.get(conductor.id);
      if (existing) return existing;
      return {
        conductorId: conductor.id,
        fromTap:
          conductor.from.kind === 'junction'
            ? nextTap(conductor.from.junctionId, tapCursor, junctionDegree)
            : undefined,
        toTap:
          conductor.to.kind === 'junction'
            ? nextTap(conductor.to.junctionId, tapCursor, junctionDegree)
            : undefined,
      };
    }),
  );

  return {
    formatVersion: CANONICAL_FORMAT_VERSION,
    electrical,
    layout: {
      boards: previous.layout.boards,
      components,
      junctions,
      conductors,
    },
  };
}

function junctionDegrees(electrical: CanonicalElectrical): Map<string, number> {
  const degree = new Map<string, number>();
  for (const net of electrical.nets) {
    for (const conductor of net.conductors) {
      if (conductor.from.kind === 'junction') {
        degree.set(conductor.from.junctionId, (degree.get(conductor.from.junctionId) ?? 0) + 1);
      }
      if (conductor.to.kind === 'junction') {
        degree.set(conductor.to.junctionId, (degree.get(conductor.to.junctionId) ?? 0) + 1);
      }
    }
  }
  return degree;
}

function nextTap(
  junctionId: string,
  cursor: Map<string, number>,
  degree: ReadonlyMap<string, number>,
): number {
  const current = cursor.get(junctionId) ?? 0;
  cursor.set(junctionId, current + 1);
  return current % Math.max(1, degree.get(junctionId) ?? 1);
}

function autoPosition(index: number, row: number): { x: number; y: number } {
  return { x: 80 + (index % 4) * 260, y: 80 + row * 220 + Math.floor(index / 4) * 160 };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}
