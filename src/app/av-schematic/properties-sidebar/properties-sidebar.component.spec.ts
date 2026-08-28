import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ElementMutationService } from './element-mutation.service';
import { PropertiesSidebarComponent } from './properties-sidebar.component';
import { PropertiesSidebarService } from './properties-sidebar.service';

describe('PropertiesSidebarComponent selected-wire actions', () => {
  it('resets the currently selected wire id and no other wire', () => {
    const resetEdgeRouting = vi.fn();
    const selectedEdge = signal({ id: 'wire-selected' });
    TestBed.configureTestingModule({
      imports: [PropertiesSidebarComponent],
      providers: [
        {
          provide: PropertiesSidebarService,
          useValue: {
            isExpanded: signal(true),
            sidebarState: signal('single-edge'),
            selectedNode: signal(undefined),
            selectedJunction: signal(undefined),
            selectedEdge,
            selectedWireDetails: signal(null),
            toggleSidebarVisibility: vi.fn(),
          },
        },
        { provide: ElementMutationService, useValue: { resetEdgeRouting } },
      ],
    });
    TestBed.overrideComponent(PropertiesSidebarComponent, { set: { template: '' } });
    const component = TestBed.createComponent(PropertiesSidebarComponent).componentInstance;

    (
      component as unknown as {
        onResetWireRouting(): void;
      }
    ).onResetWireRouting();

    expect(resetEdgeRouting).toHaveBeenCalledOnce();
    expect(resetEdgeRouting).toHaveBeenCalledWith('wire-selected');
  });
});
