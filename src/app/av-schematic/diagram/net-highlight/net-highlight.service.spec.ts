import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgDiagramModelService, type Edge } from 'ng-diagram';
import { describe, expect, it } from 'vitest';
import { EdgeTemplateType, type WireEdgeData } from '../model/interfaces';
import { NetHighlightService } from './net-highlight.service';

const wire = (id: string, netId?: string): Edge<WireEdgeData> => ({
  id,
  type: EdgeTemplateType.WireEdge,
  source: 'source',
  sourcePort: 'out',
  target: 'target',
  targetPort: 'in',
  data: { type: 'wire', wireId: id.toUpperCase(), netId },
});

describe('NetHighlightService', () => {
  it('highlights every wire in one net and controls attenuation independently', () => {
    const edges = signal<Edge<WireEdgeData>[]>([
      wire('w1', 'motor'),
      wire('w2', 'motor'),
      wire('w3', 'logic'),
    ]);
    TestBed.configureTestingModule({
      providers: [NetHighlightService, { provide: NgDiagramModelService, useValue: { edges } }],
    });
    const service = TestBed.inject(NetHighlightService);

    service.highlight('motor');
    expect(service.netId()).toBe('motor');
    expect(service.emphasisFor(edges()[0].data.netId)).toBe('highlighted');
    expect(service.emphasisFor(edges()[1].data.netId)).toBe('highlighted');
    expect(service.emphasisFor(edges()[2].data.netId)).toBe('dimmed');

    service.setDimOthers(false);
    expect(service.emphasisFor('logic')).toBe('normal');
    service.toggle('motor');
    expect(service.isActive()).toBe(false);
  });
});
