import { type FootprintArtwork, type FootprintCell } from '../diagram/model/footprint';

export interface NormalizedArtworkPoint {
  x: number;
  y: number;
}

export interface ArtworkCalibrationInput {
  artwork: FootprintArtwork;
  imageWidth: number;
  imageHeight: number;
  firstPoint: NormalizedArtworkPoint;
  secondPoint: NormalizedArtworkPoint;
  firstPin: FootprintCell;
  secondPin: FootprintCell;
  physicalDistance: number;
}

/** Scale uniformly from two image points, then align the first point to its pin. */
export function calibrateArtwork(input: ArtworkCalibrationInput): FootprintArtwork {
  if (sameCell(input.firstPin, input.secondPin)) {
    throw new Error('Escolha dois terminais em posições físicas diferentes.');
  }
  if (
    !Number.isFinite(input.physicalDistance) ||
    input.physicalDistance <= 0 ||
    !Number.isFinite(input.imageWidth) ||
    input.imageWidth <= 0 ||
    !Number.isFinite(input.imageHeight) ||
    input.imageHeight <= 0
  ) {
    throw new Error('Informe uma distância física positiva para calibrar.');
  }
  assertNormalizedPoint(input.firstPoint);
  assertNormalizedPoint(input.secondPoint);
  const pixelDistance = Math.hypot(
    (input.secondPoint.x - input.firstPoint.x) * input.imageWidth,
    (input.secondPoint.y - input.firstPoint.y) * input.imageHeight,
  );
  if (pixelDistance <= Number.EPSILON) {
    throw new Error('Marque dois pontos diferentes sobre a imagem.');
  }
  const pitchPerPixel = input.physicalDistance / pixelDistance;
  const width = input.imageWidth * pitchPerPixel;
  const height = input.imageHeight * pitchPerPixel;
  return {
    ...input.artwork,
    x: input.firstPin.col - input.firstPoint.x * width,
    y: input.firstPin.row - input.firstPoint.y * height,
    width,
    height,
    preserveAspectRatio: true,
  };
}

export function pinDistance(first: FootprintCell, second: FootprintCell): number {
  return Math.hypot(second.col - first.col, second.row - first.row);
}

function assertNormalizedPoint(point: NormalizedArtworkPoint): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.x > 1 ||
    point.y < 0 ||
    point.y > 1
  ) {
    throw new Error('Os pontos de referência precisam estar dentro da imagem.');
  }
}

function sameCell(first: FootprintCell, second: FootprintCell): boolean {
  return first.row === second.row && first.col === second.col;
}
