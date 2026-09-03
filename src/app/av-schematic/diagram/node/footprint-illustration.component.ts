import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { trustedArtworkForFootprintDefinition } from '../artwork/trusted-component-artwork';
import { footprintDrawnExtent } from '../model/footprint-geometry';
import { type Footprint } from '../model/footprint';
import {
  footprintArtworkView,
  footprintPadViews,
  footprintShapeViews,
} from './footprint-node.component';

/** Static preview driven by the same pitch geometry used by the interactive canvas node. */
@Component({
  selector: 'app-footprint-illustration',
  templateUrl: './footprint-illustration.component.html',
  styleUrl: './footprint-illustration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FootprintIllustrationComponent {
  readonly footprint = input.required<Footprint>();
  readonly label = input('');

  protected readonly artwork = computed(() => {
    const footprint = this.footprint();
    const trusted = trustedArtworkForFootprintDefinition(footprint);
    if (!trusted) return null;
    return {
      ...trusted,
      ...footprintArtworkView(footprint, trusted.bounds, 0, null),
    };
  });

  protected readonly viewBox = computed(() => {
    const extent = footprintDrawnExtent(this.footprint(), 0, null);
    return `${extent.left} ${extent.top} ${extent.right - extent.left} ${extent.bottom - extent.top}`;
  });

  protected readonly shapes = computed(() =>
    this.artwork()?.terminalModel === 'adjustable-axial'
      ? footprintShapeViews(this.footprint(), 0, null)
      : [],
  );

  protected readonly pads = computed(() =>
    this.artwork()?.terminalModel === 'adjustable-axial'
      ? footprintPadViews(this.footprint(), 0, null)
      : [],
  );
}
