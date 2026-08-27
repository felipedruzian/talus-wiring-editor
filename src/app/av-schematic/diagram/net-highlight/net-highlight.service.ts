import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import { isWireEdge } from '../model/guards';
import { resolveNetEmphasis, type NetEmphasis } from './net-emphasis';

/**
 * Which electrical net is currently under inspection, and whether the rest of
 * the diagram is attenuated while it is.
 *
 * Highlighting is view state only -- it never touches `WireEdgeData`, so it is
 * not persisted and cannot drift from the saved project. The wire edge template
 * reads {@link emphasisFor} to pick its stroke treatment; the properties
 * sidebar drives the toggles.
 */
@Injectable()
export class NetHighlightService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly _netId = signal<string | null>(null);
  private readonly _dimOthers = signal(true);

  readonly netId = this._netId.asReadonly();
  readonly dimOthers = this._dimOthers.asReadonly();
  readonly isActive = computed(() => this._netId() !== null);

  constructor() {
    // Deleting or renaming the last wire in a highlighted net must not leave
    // every remaining wire dimmed with no matching wire available to clear it.
    effect(() => {
      const activeNetId = this._netId();
      if (!activeNetId) return;
      const stillExists = this.modelService
        .edges()
        .some((edge) => isWireEdge(edge) && edge.data.netId === activeNetId);
      if (!stillExists) {
        untracked(() => {
          this._netId.set(null);
        });
      }
    });
  }

  /** Start (or switch) the highlight. An empty/absent net id clears it instead. */
  highlight(netId: string | null | undefined): void {
    this._netId.set(netId === undefined || netId === '' ? null : netId);
  }

  toggle(netId: string | null | undefined): void {
    const next = netId === undefined || netId === '' ? null : netId;
    this._netId.update((current) => (current === next ? null : next));
  }

  clear(): void {
    this._netId.set(null);
  }

  setDimOthers(dim: boolean): void {
    this._dimOthers.set(dim);
  }

  emphasisFor(edgeNetId: string | undefined): NetEmphasis {
    return resolveNetEmphasis(edgeNetId, this._netId(), this._dimOthers());
  }
}
