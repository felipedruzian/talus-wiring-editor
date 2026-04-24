import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgDiagramPortComponent, type NgDiagramNodeTemplate, type Node } from 'ng-diagram';
import { type DeviceNodeData } from '../model/interfaces';

@Component({
  selector: 'app-device-node',
  imports: [NgDiagramPortComponent],
  templateUrl: './device-node.component.html',
  styleUrl: './device-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.ng-diagram-port-hoverable-over-node]': 'true',
    '[class.selected]': 'node().selected',
  },
})
export class DeviceNodeComponent implements NgDiagramNodeTemplate<DeviceNodeData> {
  node = input.required<Node<DeviceNodeData>>();

  protected readonly label = computed(() => this.node().data.label ?? this.node().id);
}
