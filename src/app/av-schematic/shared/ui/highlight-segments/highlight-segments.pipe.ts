import { Pipe, PipeTransform } from '@angular/core';

export interface HighlightSegment {
  text: string;
  match: boolean;
}

@Pipe({ name: 'highlightSegments' })
export class HighlightSegmentsPipe implements PipeTransform {
  transform(text: string | null | undefined, query: string): HighlightSegment[] {
    const source = text ?? '';
    const needle = query?.trim() ?? '';
    if (!needle || !source) return [{ text: source, match: false }];

    const haystack = source.toLowerCase();
    const lowerNeedle = needle.toLowerCase();
    const segments: HighlightSegment[] = [];

    let cursor = 0;
    while (cursor < source.length) {
      const idx = haystack.indexOf(lowerNeedle, cursor);
      if (idx === -1) {
        segments.push({ text: source.slice(cursor), match: false });
        break;
      }
      if (idx > cursor) {
        segments.push({ text: source.slice(cursor, idx), match: false });
      }
      segments.push({ text: source.slice(idx, idx + lowerNeedle.length), match: true });
      cursor = idx + lowerNeedle.length;
    }

    return segments;
  }
}
