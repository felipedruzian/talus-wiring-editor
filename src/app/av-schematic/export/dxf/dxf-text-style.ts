export class DxfTextStyle {
  constructor(
    public readonly name: string,
    public readonly fontFamily = 'Arial',
    public readonly bold = false,
  ) {}

  serialize(handle: number): string[] {
    const fontFile = this.bold ? 'arialbd.ttf' : 'arial.ttf';
    return [
      `  0\nSTYLE`,
      `  5\n${handle.toString(16).toUpperCase()}`,
      `  100\nAcDbSymbolTableRecord`,
      `  100\nAcDbTextStyleTableRecord`,
      `  2\n${this.name}`,
      `  70\n0`,
      `  40\n0`,
      `  41\n1`,
      `  3\n${fontFile}`,
      `  1001\nACAS`,
      `  1000\n${this.fontFamily}`,
    ];
  }
}
