import { DestroyRef, inject, Injectable } from '@angular/core';
import { type Point, NgDiagramViewportService } from 'ng-diagram';

const DURATION_MS = 300;

const easeOutCubic = (progress: number): number => 1 - Math.pow(1 - progress, 3);

const lerp = (from: number, to: number, progress: number): number => from + (to - from) * progress;

/**
 * Pans the viewport from its current position to a target {x, y} over a fixed
 * duration with cubic ease-out. A new call cancels any in-flight animation.
 * Any pending frame is also cancelled when the providing scope is destroyed.
 */
@Injectable()
export class ViewportAnimationService {
  private readonly viewportService = inject(NgDiagramViewportService);
  private rafId: number | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.cancelPendingFrame();
    });
  }

  animateTo(target: Point): void {
    const viewport = this.viewportService.viewport();
    const fromX = viewport.x;
    const fromY = viewport.y;

    if (fromX === target.x && fromY === target.y) return;

    this.cancelPendingFrame();

    const startTime = performance.now();

    const tick = (currentTime: number): void => {
      const elapsedMs = currentTime - startTime;
      const linearProgress = Math.min(elapsedMs / DURATION_MS, 1);
      const easedProgress = easeOutCubic(linearProgress);

      const nextX = lerp(fromX, target.x, easedProgress);
      const nextY = lerp(fromY, target.y, easedProgress);

      this.viewportService.moveViewport(nextX, nextY);

      if (linearProgress < 1) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = null;
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private cancelPendingFrame(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
