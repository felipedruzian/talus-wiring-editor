import { DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { NodeVisibilityConfigService } from './node-visibility-config.service';

/**
 * Registers the host element as a UI overlay that obscures part of the viewport.
 *
 * Pass an explicit key (`appViewportOverlay="navbar"`) to identify this overlay
 * in the registration map. Two overlays sharing a key would overwrite each
 * other, so prefer one descriptive key per overlay. When omitted, falls back to
 * the host element's tag name.
 */
@Directive({
  selector: '[appViewportOverlay]',
})
export class ViewportOverlayDirective {
  readonly appViewportOverlay = input<string>('');

  constructor() {
    const configService = inject(NodeVisibilityConfigService);
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const key = this.appViewportOverlay() || el.tagName.toLowerCase();
    configService.registerOverlay(key, () => el.getBoundingClientRect());
    inject(DestroyRef).onDestroy(() => {
      configService.unregisterOverlay(key);
    });
  }
}
