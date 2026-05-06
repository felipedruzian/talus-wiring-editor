import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TooltipDirective, type TooltipPlacement } from '../../../shared/tooltip/tooltip.directive';

@Component({
  selector: 'app-sidebar-header',
  imports: [TooltipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar-header.component.html',
  styleUrl: './sidebar-header.component.scss',
  host: { '[attr.title]': 'null' },
})
export class SidebarHeaderComponent {
  readonly title = input.required<string>();
  readonly titleId = input.required<string>();
  readonly subtitle = input<string>('');
  readonly iconClass = input<string>('icon-sidebar');
  readonly ariaLabel = input<string>('Toggle panel');
  readonly tooltipPlacement = input<TooltipPlacement>('bottom');
  readonly isExpanded = input.required<boolean>();
  readonly toggle = output<void>();
}
