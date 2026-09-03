import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ArtworkAssetStore } from '../../../diagram/artwork/artwork-asset.store';
import {
  trustedArtworkForFootprint,
  trustedArtworkForFootprintDefinition,
} from '../../../diagram/artwork/trusted-component-artwork';
import { footprintDrawnExtent } from '../../../diagram/model/footprint-geometry';
import {
  isCoherentAxialFootprint,
  resizeAxialFootprintSpan,
  type Footprint,
  type FootprintCell,
  type FootprintPin,
} from '../../../diagram/model/footprint';
import {
  type DeviceNodeData,
  type DevicePort,
  type PortDirection,
} from '../../../diagram/model/interfaces';
import { FootprintIllustrationComponent } from '../../../diagram/node/footprint-illustration.component';
import { DeviceFormService } from '../../../device-form/device-form.service';
import { CONNECTOR_TYPES } from '../../../shared/ui/ports-editor/connector-types';
import {
  calibrateArtwork,
  pinDistance,
  type NormalizedArtworkPoint,
} from '../../artwork-calibration';
import { ArtworkImportError, importArtwork } from '../../artwork-import';
import { LibraryDraftService } from '../../library-draft.service';

interface EditablePin {
  pin: FootprintPin;
  port: DevicePort;
}

@Component({
  selector: 'app-physical-component-editor',
  imports: [FootprintIllustrationComponent],
  templateUrl: './physical-component-editor.component.html',
  styleUrl: './physical-component-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhysicalComponentEditorComponent {
  private readonly draftService = inject(LibraryDraftService);
  private readonly formService = inject(DeviceFormService);
  private readonly artworkAssets = inject(ArtworkAssetStore);
  private readonly previewSurface = viewChild<ElementRef<HTMLElement>>('previewSurface');

  readonly libraryId = input.required<string>();

  protected readonly draft = this.draftService.draft;
  protected readonly footprint = computed(() => this.draft().footprint ?? null);
  protected readonly isPhysical = computed(() => this.footprint() !== null);
  protected readonly bundledArtwork = computed(() =>
    trustedArtworkForFootprint(this.footprint()?.id),
  );
  protected readonly isAdjustableAxial = computed(
    () => this.bundledArtwork()?.terminalModel === 'adjustable-axial',
  );
  protected readonly connectorTypes = CONNECTOR_TYPES;
  protected readonly uploadBusy = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly dimensionError = signal<string | null>(null);
  protected readonly draggingPin = signal<number | null>(null);
  protected readonly calibrationFirstPinId = signal('');
  protected readonly calibrationSecondPinId = signal('');
  protected readonly calibrationDistance = signal(0);
  protected readonly calibrationFirstPoint = signal<NormalizedArtworkPoint | null>(null);
  protected readonly calibrationSecondPoint = signal<NormalizedArtworkPoint | null>(null);
  protected readonly calibrationCapture = signal<1 | 2 | null>(null);
  protected readonly calibrationError = signal<string | null>(null);
  protected readonly asset = computed(() => {
    const hash = this.footprint()?.artwork?.assetHash;
    return (
      this.draftService.pendingAssets().find((candidate) => candidate.hash === hash) ??
      this.artworkAssets.asset(hash) ??
      null
    );
  });
  protected readonly previewArtwork = computed(() => {
    const footprint = this.footprint();
    if (!footprint) return null;
    const raster = footprint.artwork;
    const rasterAsset = this.asset();
    if (raster && rasterAsset) {
      return { source: rasterAsset.dataUrl, geometry: raster, trusted: false };
    }
    return null;
  });
  protected readonly trustedPreviewFootprint = computed(() => {
    const footprint = this.footprint();
    if (!footprint || footprint.artwork) return null;
    return trustedArtworkForFootprintDefinition(footprint) ? footprint : null;
  });
  protected readonly extent = computed(() => {
    const footprint = this.footprint();
    return footprint
      ? footprintDrawnExtent(footprint, 0, null)
      : { top: -0.75, bottom: 1.75, left: -0.75, right: 1.75 };
  });
  protected readonly pins = computed<EditablePin[]>(() => {
    const draft = this.draft();
    const footprint = draft.footprint;
    if (!footprint) return [];
    const ports = new Map(draft.ports.map((port) => [port.id, port]));
    return footprint.pins.map((pin) => ({
      pin,
      port: ports.get(pin.id) ?? {
        id: pin.id,
        label: pin.label,
        direction: 'input',
        connectorType: '',
      },
    }));
  });
  protected readonly cells = computed(() => {
    const footprint = this.footprint();
    if (!footprint) return [];
    const body = footprint.bodyCells
      ? new Set(footprint.bodyCells.map((cell) => cellKey(cell)))
      : null;
    return Array.from({ length: footprint.rows }, (_, row) =>
      Array.from({ length: footprint.cols }, (_, col) => ({
        row,
        col,
        occupied: body ? body.has(cellKey({ row, col })) : true,
      })),
    ).flat();
  });
  protected readonly validationMessage = computed(
    () => this.dimensionError() ?? validatePhysicalDraft(this.draft()),
  );
  protected readonly calibrationMarkers = computed(() => {
    const artwork = this.footprint()?.artwork;
    if (!artwork) return [];
    return [this.calibrationFirstPoint(), this.calibrationSecondPoint()].flatMap((point, index) =>
      point
        ? [
            {
              label: index + 1,
              x: artwork.x + point.x * artwork.width,
              y: artwork.y + point.y * artwork.height,
            },
          ]
        : [],
    );
  });

  protected enablePhysical(): void {
    this.formService.commitPendingEdits();
    const current = this.draft();
    if (current.footprint) return;
    const footprintId = footprintIdForLibrary(this.libraryId());
    const cols = Math.max(2, Math.min(64, current.ports.length || 2));
    const pins = current.ports.map((port, index) => ({
      id: port.id,
      label: port.label,
      cell: { row: 0, col: Math.min(index, cols - 1) },
      primary: index === 0 || undefined,
    }));
    this.draftService.update((draft) => ({
      ...draft,
      footprintId,
      footprintRotation: 0,
      footprintPitch: 20,
      footprint: {
        id: footprintId,
        label: draft.model.trim() || 'Componente físico',
        rows: 2,
        cols,
        pins,
        shapes: [],
      },
      ports: draft.ports.map((port) => ({ ...port, hole: undefined })),
    }));
  }

  protected disablePhysical(): void {
    if (this.bundledArtwork()) return;
    this.formService.commitPendingEdits();
    this.draftService.update((draft) => ({
      ...draft,
      footprintId: undefined,
      footprint: undefined,
      footprintRotation: undefined,
      footprintPitch: undefined,
      boardId: undefined,
      placement: undefined,
      ports: draft.ports.map((port) => ({ ...port, hole: undefined })),
    }));
    this.uploadError.set(null);
  }

  protected updateFootprintLabel(event: Event): void {
    const label = inputValue(event);
    this.updateFootprint((footprint) => ({ ...footprint, label }));
  }

  protected updateDimension(field: 'rows' | 'cols', event: Event): void {
    if (this.isAdjustableAxial()) return;
    const raw = Number(inputValue(event));
    const footprint = this.footprint();
    if (!Number.isFinite(raw) || !footprint) return;
    const result = resizeFootprintGrid(footprint, field, raw);
    this.dimensionError.set(result.ok ? null : result.message);
    if (result.ok) this.updateFootprint(() => result.footprint);
  }

  protected updateAxialSpan(event: Event): void {
    const footprint = this.footprint();
    if (!footprint) return;
    const result = resizeAxialFootprintSpan(footprint, Number(inputValue(event)));
    this.dimensionError.set(result.ok ? null : result.message);
    if (result.ok) this.updateFootprint(() => result.footprint);
  }

  protected async onArtworkSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadBusy.set(true);
    this.uploadError.set(null);
    try {
      const asset = await importArtwork(file);
      this.draftService.addAsset(asset);
      if (!this.footprint()) this.enablePhysical();
      this.resetCalibration();
      this.updateFootprint((footprint) => {
        const width = Math.max(1, footprint.cols);
        const height = width * (asset.height / asset.width);
        return {
          ...footprint,
          pins: footprint.pins.map((pin) => ({
            ...pin,
            artworkPoint: pin.artworkPoint ?? { x: pin.cell.col, y: pin.cell.row },
          })),
          artwork: {
            assetHash: asset.hash,
            x: -0.5,
            y: (footprint.rows - 1 - height) / 2,
            width,
            height,
            preserveAspectRatio: true,
          },
        };
      });
    } catch (error) {
      this.uploadError.set(
        error instanceof ArtworkImportError
          ? error.message
          : 'Não foi possível preparar esta imagem. Escolha outro arquivo e tente novamente.',
      );
    } finally {
      this.uploadBusy.set(false);
    }
  }

  protected removeArtwork(): void {
    this.updateFootprint((footprint) => ({ ...footprint, artwork: undefined }));
    this.uploadError.set(null);
    this.resetCalibration();
  }

  protected updateArtworkNumber(field: 'x' | 'y' | 'width' | 'height', event: Event): void {
    const value = Number(inputValue(event));
    if (!Number.isFinite(value) || ((field === 'width' || field === 'height') && value <= 0)) {
      return;
    }
    this.updateFootprint((footprint) =>
      footprint.artwork
        ? { ...footprint, artwork: { ...footprint.artwork, [field]: value } }
        : footprint,
    );
  }

  protected updatePreserveAspectRatio(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.updateFootprint((footprint) =>
      footprint.artwork
        ? { ...footprint, artwork: { ...footprint.artwork, preserveAspectRatio: checked } }
        : footprint,
    );
  }

  protected updateCalibrationPin(which: 1 | 2, event: Event): void {
    const value = inputValue(event);
    if (which === 1) this.calibrationFirstPinId.set(value);
    else this.calibrationSecondPinId.set(value);
    this.calibrationError.set(null);
  }

  protected updateCalibrationDistance(event: Event): void {
    const value = Number(inputValue(event));
    this.calibrationDistance.set(Number.isFinite(value) ? value : 0);
    this.calibrationError.set(null);
  }

  protected usePinDistance(): void {
    const first = this.selectedCalibrationPin(1);
    const second = this.selectedCalibrationPin(2);
    if (!first || !second) {
      this.calibrationError.set('Escolha os dois terminais de referência.');
      return;
    }
    const distance = pinDistance(first.cell, second.cell);
    if (distance <= 0) {
      this.calibrationError.set('Escolha terminais em posições físicas diferentes.');
      return;
    }
    this.calibrationDistance.set(roundGeometry(distance));
    this.calibrationError.set(null);
  }

  protected beginCalibrationCapture(which: 1 | 2): void {
    this.calibrationCapture.set(which);
    this.calibrationError.set(null);
  }

  protected captureCalibrationPoint(event: MouseEvent): void {
    const which = this.calibrationCapture();
    const footprint = this.footprint();
    const artwork = footprint?.artwork;
    const element = this.previewSurface()?.nativeElement;
    if (!which || !artwork || !element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const extent = this.extent();
    const logicalX =
      extent.left + ((event.clientX - rect.left) / rect.width) * (extent.right - extent.left);
    const logicalY =
      extent.top + ((event.clientY - rect.top) / rect.height) * (extent.bottom - extent.top);
    this.recordCalibrationPoint({
      x: (logicalX - artwork.x) / artwork.width,
      y: (logicalY - artwork.y) / artwork.height,
    });
  }

  protected captureCalibrationAtSelectedPin(event: Event): void {
    const which = this.calibrationCapture();
    const artwork = this.footprint()?.artwork;
    const pin = which ? this.selectedCalibrationPin(which) : undefined;
    if (!which || !artwork || !pin) return;
    event.preventDefault();
    this.recordCalibrationPoint({
      x: (pin.cell.col - artwork.x) / artwork.width,
      y: (pin.cell.row - artwork.y) / artwork.height,
    });
  }

  private recordCalibrationPoint(point: NormalizedArtworkPoint): void {
    const which = this.calibrationCapture();
    if (!which) return;
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
      this.calibrationError.set('Clique dentro da imagem para marcar a referência.');
      return;
    }
    if (which === 1) {
      this.calibrationFirstPoint.set(point);
      this.calibrationCapture.set(2);
    } else {
      this.calibrationSecondPoint.set(point);
      this.calibrationCapture.set(null);
    }
  }

  protected applyCalibration(): void {
    const footprint = this.footprint();
    const artwork = footprint?.artwork;
    const asset = this.asset();
    const firstPoint = this.calibrationFirstPoint();
    const secondPoint = this.calibrationSecondPoint();
    const firstPin = this.selectedCalibrationPin(1);
    const secondPin = this.selectedCalibrationPin(2);
    if (
      !footprint ||
      !artwork ||
      !asset ||
      !firstPoint ||
      !secondPoint ||
      !firstPin ||
      !secondPin
    ) {
      this.calibrationError.set('Escolha dois terminais e marque os dois pontos sobre a imagem.');
      return;
    }
    try {
      const calibrated = calibrateArtwork({
        artwork,
        imageWidth: asset.width,
        imageHeight: asset.height,
        firstPoint,
        secondPoint,
        firstPin: firstPin.cell,
        secondPin: secondPin.cell,
        physicalDistance: this.calibrationDistance(),
      });
      this.updateFootprint((current) => ({ ...current, artwork: calibrated }));
      this.calibrationError.set(null);
    } catch (error) {
      this.calibrationError.set(
        error instanceof Error ? error.message : 'Não foi possível calibrar a imagem.',
      );
    }
  }

  protected addPin(): void {
    if (this.isAdjustableAxial()) return;
    const footprint = this.footprint();
    if (!footprint) return;
    const id = nextPinId(footprint.pins.map((pin) => pin.id));
    const cell = firstFreeCell(footprint);
    this.draftService.update((draft) => ({
      ...draft,
      footprint: draft.footprint
        ? {
            ...draft.footprint,
            pins: [
              ...draft.footprint.pins,
              { id, label: id.toUpperCase(), cell, primary: draft.footprint.pins.length === 0 },
            ],
          }
        : draft.footprint,
      ports: [
        ...draft.ports,
        { id, label: id.toUpperCase(), direction: 'input', connectorType: 'GPIO' },
      ],
    }));
  }

  protected removePin(index: number): void {
    if (this.isAdjustableAxial()) return;
    const oldId = this.footprint()?.pins[index]?.id;
    if (oldId === undefined) return;
    this.draftService.update((draft) => ({
      ...draft,
      footprint: draft.footprint
        ? {
            ...draft.footprint,
            pins: draft.footprint.pins.filter((_, pinIndex) => pinIndex !== index),
          }
        : draft.footprint,
      ports: draft.ports.filter((port) => port.id !== oldId),
    }));
  }

  protected updatePinText(index: number, field: 'id' | 'label', event: Event): void {
    if (field === 'id' && this.isAdjustableAxial()) return;
    const value = inputValue(event);
    this.draftService.update((draft) => {
      const footprint = draft.footprint;
      const oldPin = footprint?.pins[index];
      if (!footprint || !oldPin) return draft;
      const pins = footprint.pins.map((pin, pinIndex) =>
        pinIndex === index ? { ...pin, [field]: value } : pin,
      );
      const ports = draft.ports.map((port) =>
        port.id === oldPin.id
          ? {
              ...port,
              ...(field === 'id' ? { id: value } : { label: value }),
              hole: undefined,
            }
          : port,
      );
      return { ...draft, footprint: { ...footprint, pins }, ports };
    });
  }

  protected updatePinCell(index: number, field: 'row' | 'col', event: Event): void {
    const footprint = this.footprint();
    if (!footprint) return;
    const value = Number(inputValue(event));
    if (!Number.isFinite(value)) return;
    const max = field === 'row' ? footprint.rows - 1 : footprint.cols - 1;
    this.setPinCell(index, {
      ...(footprint.pins[index]?.cell ?? { row: 0, col: 0 }),
      [field]: Math.max(0, Math.min(max, Math.round(value))),
    });
  }

  protected updatePinDirection(index: number, event: Event): void {
    const direction = inputValue(event) as PortDirection;
    this.updatePort(index, (port) => ({ ...port, direction }));
  }

  protected updatePinConnector(index: number, event: Event): void {
    const connectorType = inputValue(event);
    this.updatePort(index, (port) => ({
      ...port,
      connectorType: connectorType || undefined,
    }));
  }

  protected updatePrimary(index: number, event: Event): void {
    if (this.isAdjustableAxial()) return;
    const checked = (event.target as HTMLInputElement).checked;
    this.updateFootprint((footprint) => ({
      ...footprint,
      pins: footprint.pins.map((pin, pinIndex) => ({
        ...pin,
        primary: checked ? pinIndex === index : pinIndex === index ? undefined : pin.primary,
      })),
    }));
  }

  protected startPinDrag(index: number, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.draggingPin.set(index);
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.movePinDrag(event);
  }

  protected movePinDrag(event: PointerEvent): void {
    const index = this.draggingPin();
    const footprint = this.footprint();
    const element = this.previewSurface()?.nativeElement;
    if (index === null || !footprint || !element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const extent = this.extent();
    const x =
      extent.left + ((event.clientX - rect.left) / rect.width) * (extent.right - extent.left);
    const y =
      extent.top + ((event.clientY - rect.top) / rect.height) * (extent.bottom - extent.top);
    this.setPinCell(index, {
      row: Math.max(0, Math.min(footprint.rows - 1, Math.round(y))),
      col: Math.max(0, Math.min(footprint.cols - 1, Math.round(x))),
    });
  }

  protected endPinDrag(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.draggingPin.set(null);
  }

  protected toggleBodyCell(cell: FootprintCell): void {
    if (this.isAdjustableAxial()) return;
    this.updateFootprint((footprint) => {
      const current = footprint.bodyCells ?? allCells(footprint.rows, footprint.cols);
      const key = cellKey(cell);
      const exists = current.some((candidate) => cellKey(candidate) === key);
      return {
        ...footprint,
        bodyCells: exists
          ? current.filter((candidate) => cellKey(candidate) !== key)
          : [...current, { ...cell }],
      };
    });
  }

  protected occupyAllCells(): void {
    if (this.isAdjustableAxial()) return;
    this.updateFootprint((footprint) => ({ ...footprint, bodyCells: undefined }));
  }

  protected occupyPinCells(): void {
    if (this.isAdjustableAxial()) return;
    this.updateFootprint((footprint) => ({
      ...footprint,
      bodyCells: uniqueCells(footprint.pins.map((pin) => pin.cell)),
    }));
  }

  protected previewLeft(value: number): number {
    const extent = this.extent();
    return ((value - extent.left) / (extent.right - extent.left)) * 100;
  }

  protected previewTop(value: number): number {
    const extent = this.extent();
    return ((value - extent.top) / (extent.bottom - extent.top)) * 100;
  }

  protected previewWidth(value: number): number {
    const extent = this.extent();
    return (value / (extent.right - extent.left)) * 100;
  }

  protected previewHeight(value: number): number {
    const extent = this.extent();
    return (value / (extent.bottom - extent.top)) * 100;
  }

  private setPinCell(index: number, cell: FootprintCell): void {
    if (this.isAdjustableAxial()) return;
    this.updateFootprint((footprint) => ({
      ...footprint,
      pins: footprint.pins.map((pin, pinIndex) =>
        pinIndex === index
          ? {
              ...pin,
              cell,
              ...(footprint.artwork || pin.artworkPoint
                ? { artworkPoint: { x: cell.col, y: cell.row } }
                : {}),
            }
          : pin,
      ),
    }));
  }

  private updatePort(index: number, update: (port: DevicePort) => DevicePort): void {
    const pinId = this.footprint()?.pins[index]?.id;
    if (pinId === undefined) return;
    this.draftService.update((draft) => ({
      ...draft,
      ports: draft.ports.map((port) => (port.id === pinId ? update(port) : port)),
    }));
  }

  private updateFootprint(update: (footprint: Footprint) => Footprint): void {
    this.draftService.update((draft) =>
      draft.footprint ? { ...draft, footprint: update(draft.footprint) } : draft,
    );
  }

  private selectedCalibrationPin(which: 1 | 2): FootprintPin | undefined {
    const pins = this.footprint()?.pins ?? [];
    const requested = which === 1 ? this.calibrationFirstPinId() : this.calibrationSecondPinId();
    return pins.find((pin) => pin.id === requested) ?? pins[which - 1];
  }

  private resetCalibration(): void {
    this.calibrationFirstPoint.set(null);
    this.calibrationSecondPoint.set(null);
    this.calibrationCapture.set(null);
    this.calibrationError.set(null);
  }
}

export function validatePhysicalDraft(data: DeviceNodeData): string | null {
  const footprint = data.footprint;
  if (!footprint) return null;
  if (data.footprintId !== footprint.id) return 'O ID do footprint está inconsistente.';
  if (!footprint.label.trim()) return 'Informe um nome para o footprint.';
  if (footprint.axialSpan !== undefined && !isCoherentAxialFootprint(footprint)) {
    return 'O vão axial deve ser inteiro entre 4 e 10 passos, com terminais nas extremidades.';
  }
  const ids = footprint.pins.map((pin) => pin.id.trim());
  if (ids.some((id) => id === '')) return 'Todo terminal precisa de um ID.';
  if (new Set(ids).size !== ids.length) return 'Os IDs dos terminais precisam ser únicos.';
  const pinCells = footprint.pins.map((pin) => cellKey(pin.cell));
  if (new Set(pinCells).size !== pinCells.length) {
    return 'Dois terminais não podem ocupar a mesma célula.';
  }
  const rawPortIds = data.ports.map((port) => port.id.trim());
  if (rawPortIds.some((id) => id === '')) return 'Toda porta elétrica precisa de um ID.';
  const portIds = new Set(rawPortIds);
  if (portIds.size !== rawPortIds.length) return 'Os IDs das portas elétricas precisam ser únicos.';
  if (ids.some((id) => !portIds.has(id)))
    return 'Todo terminal físico precisa de uma porta elétrica.';
  const pinIds = new Set(ids);
  if (rawPortIds.some((id) => !pinIds.has(id)))
    return 'Toda porta elétrica precisa de uma posição física.';
  return null;
}

export type FootprintGridResizeResult =
  | { ok: true; footprint: Footprint }
  | { ok: false; message: string };

export function resizeFootprintGrid(
  footprint: Footprint,
  field: 'rows' | 'cols',
  requestedValue: number,
): FootprintGridResizeResult {
  if (footprint.axialSpan !== undefined) {
    return {
      ok: false,
      message: 'Use o controle de vão axial para redimensionar este resistor.',
    };
  }
  const value = Math.max(1, Math.min(64, Math.round(requestedValue)));
  const rows = field === 'rows' ? value : footprint.rows;
  const cols = field === 'cols' ? value : footprint.cols;
  const pins = footprint.pins.map((pin) => ({
    ...pin,
    cell: {
      row: Math.min(pin.cell.row, rows - 1),
      col: Math.min(pin.cell.col, cols - 1),
    },
    ...(pin.artworkPoint
      ? {
          artworkPoint: {
            x: Math.min(pin.artworkPoint.x, cols - 1),
            y: Math.min(pin.artworkPoint.y, rows - 1),
          },
        }
      : {}),
  }));
  const pinCells = pins.map((pin) => cellKey(pin.cell));
  if (new Set(pinCells).size !== pinCells.length) {
    return { ok: false, message: 'A redução colocaria dois terminais na mesma célula.' };
  }
  return {
    ok: true,
    footprint: {
      ...footprint,
      rows,
      cols,
      pins,
      bodyCells: footprint.bodyCells?.filter((cell) => cell.row < rows && cell.col < cols),
    },
  };
}

function footprintIdForLibrary(libraryId: string): string {
  const normalized = libraryId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `custom-${normalized || 'component'}`;
}

function nextPinId(existing: readonly string[]): string {
  const ids = new Set(existing);
  let index = 1;
  while (ids.has(`p${index}`)) index += 1;
  return `p${index}`;
}

function firstFreeCell(footprint: Footprint): FootprintCell {
  const occupied = new Set(footprint.pins.map((pin) => cellKey(pin.cell)));
  for (let row = 0; row < footprint.rows; row += 1) {
    for (let col = 0; col < footprint.cols; col += 1) {
      if (!occupied.has(cellKey({ row, col }))) return { row, col };
    }
  }
  return { row: 0, col: 0 };
}

function allCells(rows: number, cols: number): FootprintCell[] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({ row, col })),
  ).flat();
}

function uniqueCells(cells: readonly FootprintCell[]): FootprintCell[] {
  return [...new Map(cells.map((cell) => [cellKey(cell), { ...cell }])).values()];
}

function cellKey(cell: FootprintCell): string {
  return `${cell.row}:${cell.col}`;
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

function roundGeometry(value: number): number {
  return Math.round(value * 1000) / 1000;
}
