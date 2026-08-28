import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { NetHighlightService } from '../../../diagram/net-highlight/net-highlight.service';
import { type WireEdgeData } from '../../../diagram/model/interfaces';
import { EMPTY_WIRE_FORM } from './wire-form.mappers';
import { WireFormComponent } from './wire-form.component';
import { WireFormService } from './wire-form.service';

describe('WireFormComponent input synchronization', () => {
  it('does not reload pending form fields after its selected edge data is updated', () => {
    const loadFormData = vi.fn();
    TestBed.configureTestingModule({
      imports: [WireFormComponent],
      providers: [
        {
          provide: WireFormService,
          useValue: {
            fieldTree: {},
            formModel: signal({ ...EMPTY_WIRE_FORM }),
            loadFormData,
            commitPendingEdits: vi.fn(),
          },
        },
        {
          provide: NetHighlightService,
          useValue: {
            netId: signal<string | null>(null),
            dimOthers: signal(true),
            toggleEdge: vi.fn(),
            setDimOthers: vi.fn(),
          },
        },
      ],
    });
    TestBed.overrideComponent(WireFormComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(WireFormComponent);
    const initial: WireEdgeData = { type: 'wire', wireId: 'W1', gauge: '22 AWG' };
    fixture.componentRef.setInput('edgeId', 'edge-1');
    fixture.componentRef.setInput('edgeData', initial);
    fixture.componentRef.setInput('source', null);
    fixture.componentRef.setInput('target', null);
    fixture.detectChanges();

    expect(loadFormData).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('edgeData', { ...initial, length: '120 mm' });
    fixture.detectChanges();

    expect(loadFormData).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('edgeId', 'edge-2');
    fixture.componentRef.setInput('edgeData', { ...initial, wireId: 'W2' });
    fixture.detectChanges();

    expect(loadFormData).toHaveBeenCalledTimes(2);
  });
});
