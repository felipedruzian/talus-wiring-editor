import { type DxfEntity } from './dxf-entity';
import { type DxfLayer } from './dxf-layer';
import { type DxfTextStyle } from './dxf-text-style';

/**
 * Holds the in-memory DXF document — layers, text styles, entities, header
 * variables. Renderers append to this through DxfRenderContext; DxfWriter
 * reads from it to produce the final ASCII output.
 */
export class DxfDocument {
  private readonly layers: DxfLayer[] = [];
  private readonly textStyles: DxfTextStyle[] = [];
  private readonly entities: DxfEntity[] = [];
  private readonly headerVars = new Map<string, string[]>();

  addLayer(layer: DxfLayer): void {
    this.layers.push(layer);
  }

  addTextStyle(style: DxfTextStyle): void {
    this.textStyles.push(style);
  }

  addEntity(entity: DxfEntity): void {
    this.entities.push(entity);
  }

  setHeaderVar(name: string, pairs: string[]): void {
    this.headerVars.set(name, pairs);
  }

  getLayers(): readonly DxfLayer[] {
    return this.layers;
  }

  getTextStyles(): readonly DxfTextStyle[] {
    return this.textStyles;
  }

  getEntities(): readonly DxfEntity[] {
    return this.entities;
  }

  getHeaderVars(): ReadonlyMap<string, string[]> {
    return this.headerVars;
  }
}
