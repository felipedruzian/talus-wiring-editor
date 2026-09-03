import { type NgDiagramPaletteItem } from 'ng-diagram';
import { NodeTemplateType, type DeviceNodeData } from '../../../diagram/model/interfaces';
import { cloneFootprint, resolveFootprint } from '../../../diagram/model/footprint';
import { DETACHED_FOOTPRINT_FALLBACK_PITCH } from '../../../diagram/model/footprint-geometry';

/**
 * Wrap a `DeviceNodeData` template into the shape `<ng-diagram-palette-item>`
 * expects. ng-diagram's `NgDiagramPaletteItem` defaults to `BasePaletteItemData`,
 * which requires a `label: string`; our nodes have no label and we render our
 * own preview, so the field is moot. Keeping the cast in one helper localizes
 * the `as unknown` and keeps node data clean.
 */
export const asDevicePaletteItem = (template: DeviceNodeData): NgDiagramPaletteItem => {
  const footprint = resolveFootprint(template);
  const physical = template.footprintId !== undefined && footprint !== undefined;
  const data: DeviceNodeData = {
    ...structuredClone(template),
    boardId: undefined,
    placement: undefined,
    ports: template.ports.map((port) => ({ ...structuredClone(port), hole: undefined })),
    ...(physical
      ? {
          footprintId: footprint.id,
          footprint: cloneFootprint(footprint),
          footprintRotation: template.footprintRotation ?? 0,
          footprintPitch: template.footprintPitch ?? DETACHED_FOOTPRINT_FALLBACK_PITCH,
        }
      : {}),
  };
  return {
    type: physical ? NodeTemplateType.FootprintNode : NodeTemplateType.DeviceNode,
    data,
  } as unknown as NgDiagramPaletteItem;
};
