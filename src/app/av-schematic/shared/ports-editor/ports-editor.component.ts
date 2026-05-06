import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { type FormValueControl } from '@angular/forms/signals';
import { type DevicePort, type PortDirection } from '../../diagram/model/interfaces';
import { AutofocusDirective } from '../autofocus/autofocus.directive';
import { CONNECTOR_TYPES } from './connector-types';
import { generatePortId } from './generate-port-id';

@Component({
  selector: 'app-ports-editor',
  imports: [AutofocusDirective],
  templateUrl: './ports-editor.component.html',
  styleUrl: './ports-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortsEditorComponent implements FormValueControl<DevicePort[]> {
  readonly value = model<DevicePort[]>([]);
  readonly triggerId = input<string>();

  protected readonly connectorTypes = CONNECTOR_TYPES;
  protected readonly autofocusPortId = signal<string | null>(null);
  protected readonly activeDirection = signal<PortDirection>('input');

  protected readonly inputs = computed<DevicePort[]>(() =>
    this.value().filter((p) => p.direction === 'input'),
  );
  protected readonly outputs = computed<DevicePort[]>(() =>
    this.value().filter((p) => p.direction === 'output'),
  );
  protected readonly visiblePorts = computed<DevicePort[]>(() =>
    this.activeDirection() === 'input' ? this.inputs() : this.outputs(),
  );

  protected setActiveDirection(direction: PortDirection): void {
    this.activeDirection.set(direction);
  }

  protected addPort(): void {
    const newPort: DevicePort = {
      id: generatePortId(),
      label: '',
      direction: this.activeDirection(),
    };
    this.autofocusPortId.set(newPort.id);
    this.value.update((ports) => [...ports, newPort]);
  }

  protected removePort(id: string): void {
    this.value.update((ports) => ports.filter((p) => p.id !== id));
  }

  protected updateLabel(id: string, label: string): void {
    this.value.update((ports) => ports.map((p) => (p.id === id ? { ...p, label } : p)));
  }

  protected updateConnectorType(id: string, connectorType: string): void {
    this.value.update((ports) =>
      ports.map((p) => (p.id === id ? { ...p, connectorType: connectorType || undefined } : p)),
    );
  }

  protected toggleDirection(id: string): void {
    this.value.update((ports) => {
      const target = ports.find((p) => p.id === id);
      if (!target) return ports;
      const flipped: PortDirection = target.direction === 'input' ? 'output' : 'input';
      const others = ports.filter((p) => p.id !== id);
      return [...others, { ...target, direction: flipped }];
    });
  }

  protected moveUp(id: string): void {
    this.movePortInDirection(id, -1);
  }

  protected moveDown(id: string): void {
    this.movePortInDirection(id, 1);
  }

  protected isFirstInDirection(port: DevicePort): boolean {
    const list = port.direction === 'input' ? this.inputs() : this.outputs();
    return list[0]?.id === port.id;
  }

  protected isLastInDirection(port: DevicePort): boolean {
    const list = port.direction === 'input' ? this.inputs() : this.outputs();
    return list[list.length - 1]?.id === port.id;
  }

  /**
   * Moves a port up or down within its direction list while preserving the
   * positions of ports in the other direction.
   */
  private movePortInDirection(id: string, delta: -1 | 1): void {
    this.value.update((ports) => {
      const target = ports.find((p) => p.id === id);
      if (!target) return ports;
      const sameDirection = ports.filter((p) => p.direction === target.direction);
      const indexInList = sameDirection.findIndex((p) => p.id === id);
      const swapIndexInList = indexInList + delta;
      if (swapIndexInList < 0 || swapIndexInList >= sameDirection.length) return ports;

      const swapId = sameDirection[swapIndexInList].id;
      const indexInAll = ports.findIndex((p) => p.id === id);
      const swapIndexInAll = ports.findIndex((p) => p.id === swapId);

      const next = [...ports];
      next[indexInAll] = ports[swapIndexInAll];
      next[swapIndexInAll] = ports[indexInAll];
      return next;
    });
  }
}
