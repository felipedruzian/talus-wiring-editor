export interface CanonicalValidationCorpusCase {
  readonly name: string;
  readonly accepted: boolean;
  readonly raw: unknown;
}

export const canonicalValidationCorpus: readonly CanonicalValidationCorpusCase[];
export function basePhysicalProject(): unknown;
