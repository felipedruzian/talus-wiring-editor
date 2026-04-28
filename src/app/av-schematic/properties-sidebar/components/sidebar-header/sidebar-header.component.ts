import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-sidebar-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar-header.component.html',
  styleUrl: './sidebar-header.component.scss',
})
export class SidebarHeaderComponent {
  readonly title = input.required<string>();
  readonly titleId = input.required<string>();
  readonly iconClass = input<string>('icon-sidebar');
  readonly ariaLabel = input<string>('Toggle panel');
  readonly isExpanded = input.required<boolean>();
  readonly toggle = output<void>();
}
