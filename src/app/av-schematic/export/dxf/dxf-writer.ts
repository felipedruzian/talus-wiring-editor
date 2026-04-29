import { type DxfDocument } from './dxf-document';

/**
 * Serializes a DxfDocument into a valid DXF ASCII string.
 * Produces AutoCAD 2013 (AC1027) compatible output.
 */
export class DxfWriter {
  serialize(doc: DxfDocument): string {
    let handle = 0x100;
    const nextHandle = () => handle++;

    const parts: string[] = [];
    this.writeHeader(parts, doc);
    this.writeTables(parts, doc, nextHandle);
    this.writeBlocks(parts);
    this.writeEntities(parts, doc, nextHandle);
    this.writeObjects(parts);
    this.writeEof(parts);
    return parts.join('\n');
  }

  private writeHeader(parts: string[], doc: DxfDocument): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nHEADER');

    for (const [name, pairs] of doc.getHeaderVars()) {
      parts.push(`  9\n${name}`);
      for (const pair of pairs) {
        parts.push(`  ${pair.code}\n${pair.value}`);
      }
    }

    parts.push('  0\nENDSEC');
  }

  private writeTables(parts: string[], doc: DxfDocument, nextHandle: () => number): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nTABLES');

    this.writeLineTypeTable(parts, nextHandle);
    this.writeLayerTable(parts, doc, nextHandle);
    this.writeStyleTable(parts, doc, nextHandle);

    parts.push('  0\nENDSEC');
  }

  private writeLineTypeTable(parts: string[], nextHandle: () => number): void {
    parts.push('  0\nTABLE');
    parts.push('  2\nLTYPE');
    parts.push(`  5\n${nextHandle().toString(16).toUpperCase()}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push('  70\n1');

    parts.push('  0\nLTYPE');
    parts.push(`  5\n${nextHandle().toString(16).toUpperCase()}`);
    parts.push('  100\nAcDbSymbolTableRecord');
    parts.push('  100\nAcDbLinetypeTableRecord');
    parts.push('  2\nContinuous');
    parts.push('  70\n0');
    parts.push('  3\nSolid line');
    parts.push('  72\n65');
    parts.push('  73\n0');
    parts.push('  40\n0.0');

    parts.push('  0\nENDTAB');
  }

  private writeLayerTable(parts: string[], doc: DxfDocument, nextHandle: () => number): void {
    const layers = doc.getLayers();

    parts.push('  0\nTABLE');
    parts.push('  2\nLAYER');
    parts.push(`  5\n${nextHandle().toString(16).toUpperCase()}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push(`  70\n${layers.length}`);

    for (const layer of layers) {
      parts.push(...layer.serialize(nextHandle()));
    }

    parts.push('  0\nENDTAB');
  }

  private writeStyleTable(parts: string[], doc: DxfDocument, nextHandle: () => number): void {
    const styles = doc.getTextStyles();

    parts.push('  0\nTABLE');
    parts.push('  2\nSTYLE');
    parts.push(`  5\n${nextHandle().toString(16).toUpperCase()}`);
    parts.push('  100\nAcDbSymbolTable');
    parts.push(`  70\n${styles.length}`);

    for (const style of styles) {
      parts.push(...style.serialize(nextHandle()));
    }

    parts.push('  0\nENDTAB');
  }

  private writeBlocks(parts: string[]): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nBLOCKS');
    parts.push('  0\nENDSEC');
  }

  private writeEntities(parts: string[], doc: DxfDocument, nextHandle: () => number): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nENTITIES');

    for (const entity of doc.getEntities()) {
      parts.push(...entity.serialize(nextHandle()));
    }

    parts.push('  0\nENDSEC');
  }

  private writeObjects(parts: string[]): void {
    parts.push('  0\nSECTION');
    parts.push('  2\nOBJECTS');
    parts.push('  0\nENDSEC');
  }

  private writeEof(parts: string[]): void {
    parts.push('  0\nEOF');
  }
}
