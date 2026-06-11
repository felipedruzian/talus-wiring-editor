import { type NgDiagramPaletteItem } from 'ng-diagram';
import { NodeTemplateType, type DeviceNodeData } from '../../../diagram/model/interfaces';

/**
 * Wrap a `DeviceNodeData` template into the shape `<ng-diagram-palette-item>`
 * expects. ng-diagram's `NgDiagramPaletteItem` defaults to `BasePaletteItemData`,
 * which requires a `label: string`; our nodes have no label and we render our
 * own preview, so the field is moot. Keeping the cast in one helper localizes
 * the `as unknown` and keeps node data clean.
 */
export const asDevicePaletteItem = (template: DeviceNodeData): NgDiagramPaletteItem =>
  ({
    type: NodeTemplateType.DeviceNode,
    data: structuredClone(template),
  }) as unknown as NgDiagramPaletteItem;
