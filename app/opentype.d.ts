declare module 'opentype.js' {
  export type Glyph = { index: number; getPath(x: number, y: number, size: number): { toPathData(decimalPlaces: number): string } };
  export type Font = { unitsPerEm: number; charToGlyph(char: string): Glyph; getEnglishName(name: string): string };
  const opentype: { parse(buffer: ArrayBuffer): Font };
  export default opentype;
}
