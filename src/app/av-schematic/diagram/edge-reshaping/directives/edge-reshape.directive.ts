import { Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

export interface EdgeReshapePointerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
}

@Directive({
  selector: '[edgeReshape]',
})
export class EdgeReshapeDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  reshapeStart = output<EdgeReshapePointerEvent>();
  reshapeContinue = output<EdgeReshapePointerEvent>();
  reshapeEnd = output<EdgeReshapePointerEvent>();

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
    this.reshapeStart.emit(this.toEvent(event));
    document.addEventListener('pointermove', this.onDocumentPointerMove);
    document.addEventListener('pointerup', this.onDocumentPointerUp);
    document.addEventListener('pointercancel', this.onDocumentPointerUp);
  };

  private readonly onDocumentPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.reshapeContinue.emit(this.toEvent(event));
  };

  private readonly onDocumentPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;
    this.reshapeEnd.emit(this.toEvent(event));
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

  private toEvent(event: PointerEvent): EdgeReshapePointerEvent {
    return { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
  }
}
