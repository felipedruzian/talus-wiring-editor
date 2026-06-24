import { Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

export interface RelinkPointerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
}

/**
 * Pointer-capture plumbing for a relink endpoint grip: emits start/continue/end
 * with flow-independent client coords, capturing the pointer on the host so the
 * gesture survives the cursor leaving the small handle.
 */
@Directive({
  selector: '[appRelinkHandle]',
})
export class RelinkHandleDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  relinkStart = output<RelinkPointerEvent>();
  relinkContinue = output<RelinkPointerEvent>();
  relinkEnd = output<RelinkPointerEvent>();

  private activePointerId: number | null = null;

  constructor() {
    this.host.nativeElement.addEventListener('pointerdown', this.onPointerDown);
  }

  ngOnDestroy(): void {
    this.host.nativeElement.removeEventListener('pointerdown', this.onPointerDown);
    this.detachDocumentListeners();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.activePointerId = event.pointerId;
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.relinkStart.emit(this.toEvent(event));
    document.addEventListener('pointermove', this.onDocumentPointerMove);
    document.addEventListener('pointerup', this.onDocumentPointerUp);
    document.addEventListener('pointercancel', this.onDocumentPointerUp);
  };

  private readonly onDocumentPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.relinkContinue.emit(this.toEvent(event));
  };

  private readonly onDocumentPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.relinkEnd.emit(this.toEvent(event));
    if (this.host.nativeElement.hasPointerCapture(event.pointerId)) {
      this.host.nativeElement.releasePointerCapture(event.pointerId);
    }
    this.activePointerId = null;
    this.detachDocumentListeners();
  };

  private detachDocumentListeners(): void {
    document.removeEventListener('pointermove', this.onDocumentPointerMove);
    document.removeEventListener('pointerup', this.onDocumentPointerUp);
    document.removeEventListener('pointercancel', this.onDocumentPointerUp);
  }

  private toEvent(event: PointerEvent): RelinkPointerEvent {
    return { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
  }
}
