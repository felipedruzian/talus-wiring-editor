import { DOCUMENT } from '@angular/common';
import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  Renderer2,
} from '@angular/core';

export type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left';

const SHOW_DELAY_MS = 400;
const TRIGGER_GAP_PX = 8;

@Directive({
  selector: '[appTooltip]',
})
export class TooltipDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly document = inject(DOCUMENT);

  readonly appTooltip = input.required<string>();
  readonly tooltipPlacement = input<TooltipPlacement>('bottom');

  private tooltipEl: HTMLElement | null = null;
  private showTimer: number | null = null;

  @HostListener('mouseenter')
  @HostListener('focus')
  protected onShow(): void {
    if (this.showTimer != null || this.tooltipEl) return;
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      this.show();
    }, SHOW_DELAY_MS);
  }

  @HostListener('mouseleave')
  @HostListener('blur')
  @HostListener('click')
  protected onHide(): void {
    this.cancelShowTimer();
    this.hide();
  }

  ngOnDestroy(): void {
    this.cancelShowTimer();
    this.hide();
  }

  private cancelShowTimer(): void {
    if (this.showTimer != null) {
      window.clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private show(): void {
    const text = this.appTooltip();
    if (!text) return;

    const placement = this.tooltipPlacement();

    const tooltip = this.renderer.createElement('div') as HTMLElement;
    this.renderer.addClass(tooltip, 'app-tooltip');
    this.renderer.addClass(tooltip, `app-tooltip--${placement}`);
    this.renderer.setAttribute(tooltip, 'role', 'tooltip');
    this.renderer.appendChild(tooltip, this.renderer.createText(text));

    const arrow = this.renderer.createElement('span') as HTMLElement;
    this.renderer.addClass(arrow, 'app-tooltip__arrow');
    this.renderer.appendChild(tooltip, arrow);

    this.renderer.appendChild(this.document.body, tooltip);
    this.tooltipEl = tooltip;

    this.position();
  }

  private hide(): void {
    if (!this.tooltipEl) return;
    this.renderer.removeChild(this.document.body, this.tooltipEl);
    this.tooltipEl = null;
  }

  private position(): void {
    if (!this.tooltipEl) return;
    const hostRect = this.host.nativeElement.getBoundingClientRect();
    const tipRect = this.tooltipEl.getBoundingClientRect();
    const placement = this.tooltipPlacement();

    let top = 0;
    let left = 0;
    switch (placement) {
      case 'top':
        left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
        top = hostRect.top - tipRect.height - TRIGGER_GAP_PX;
        break;
      case 'bottom':
        left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
        top = hostRect.bottom + TRIGGER_GAP_PX;
        break;
      case 'left':
        left = hostRect.left - tipRect.width - TRIGGER_GAP_PX;
        top = hostRect.top + hostRect.height / 2 - tipRect.height / 2;
        break;
      case 'right':
        left = hostRect.right + TRIGGER_GAP_PX;
        top = hostRect.top + hostRect.height / 2 - tipRect.height / 2;
        break;
    }

    this.renderer.setStyle(this.tooltipEl, 'top', `${top}px`);
    this.renderer.setStyle(this.tooltipEl, 'left', `${left}px`);
  }
}
