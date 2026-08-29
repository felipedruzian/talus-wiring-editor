import { describe, expect, it } from 'vitest';
import { type Footprint } from '../model/footprint';
import { footprintPinViews } from './footprint-node.component';

const footprint: Footprint = {
  id: 'link',
  label: 'Link',
  rows: 1,
  cols: 2,
  pins: [
    { id: 'a', label: 'A', cell: { row: 0, col: 0 }, primary: true },
    { id: 'b', label: 'B', cell: { row: 0, col: 1 } },
  ],
  shapes: [],
};

describe('footprintPinViews', () => {
  it('keeps unseated footprint pins visible and connectable at the retained geometry', () => {
    const pins = footprintPinViews(footprint, 90, 17, [
      { id: 'a', label: 'A', direction: 'input' },
      { id: 'b', label: 'B', direction: 'output' },
    ]);

    expect(pins).toEqual([
      { id: 'a', label: 'A', x: 12.75, y: 12.75, port: true, primary: true },
      { id: 'b', label: 'B', x: 12.75, y: 29.75, port: true, primary: false },
    ]);
  });
});
