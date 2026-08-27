import { parseYamlSubset } from './wireviz-yaml';
import { parseWireVizDocument, type WireVizDocument } from './wireviz-model';

/** Parses raw WireViz YAML text (this slice's subset) into a validated document. */
export function importWireViz(yamlText: string): WireVizDocument {
  return parseWireVizDocument(parseYamlSubset(yamlText));
}
