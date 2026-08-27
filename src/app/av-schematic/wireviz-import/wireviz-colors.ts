/**
 * WireViz color helpers.
 *
 * The table itself lives in `diagram/model/wire-colors.ts` because the
 * canonical project format needs it too, and the diagram model must not
 * depend on the WireViz importer (the dependency runs the other way). This
 * module stays as the importer-side entry point introduced by the issue #1
 * tracer.
 */
export {
  WIREVIZ_COLOR_CODES,
  canonicalColorValue,
  isCssHexColor,
  isWireVizRgbColor,
  isWireVizColorCode,
  resolveWireColor,
  type ResolvedWireColor,
} from '../diagram/model/wire-colors';
