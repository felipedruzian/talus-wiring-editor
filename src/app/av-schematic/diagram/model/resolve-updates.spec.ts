import { describe, expect, it } from 'vitest';
import { resolveUpdates } from './resolve-updates';

interface FakeData {
  name?: string;
  count?: number;
  tags?: string[];
}

interface FakePatch {
  id: string;
  position?: { x: number; y: number };
  data?: Partial<FakeData>;
}

const noLookup = () => null;

describe('resolveUpdates', () => {
  it('returns input order with one entry per id', () => {
    const result = resolveUpdates<FakeData, FakePatch>(
      [{ id: 'a', data: { name: 'A' } }, { id: 'b', data: { name: 'B' } }],
      noLookup,
    );
    expect(result).toEqual([{ id: 'a', data: { name: 'A' } }, { id: 'b', data: { name: 'B' } }]);
  });

  it('merges duplicate ids — later non-undefined keys win at the top level', () => {
    const result = resolveUpdates<FakeData, FakePatch>(
      [
        { id: 'a', position: { x: 0, y: 0 } },
        { id: 'a', position: { x: 5, y: 5 } },
      ],
      noLookup,
    );
    expect(result).toEqual([{ id: 'a', position: { x: 5, y: 5 } }]);
  });

  it('drops top-level undefined values from later patches', () => {
    const result = resolveUpdates<FakeData, FakePatch>(
      [
        { id: 'a', position: { x: 1, y: 2 } },
        { id: 'a', position: undefined },
      ],
      noLookup,
    );
    expect(result).toEqual([{ id: 'a', position: { x: 1, y: 2 } }]);
  });

  it('merges duplicate ids inside data — later keys win, undefined preserved', () => {
    const result = resolveUpdates<FakeData, FakePatch>(
      [
        { id: 'a', data: { name: 'first', count: 1 } },
        { id: 'a', data: { count: 2, tags: undefined } },
      ],
      noLookup,
    );
    expect(result).toEqual([
      { id: 'a', data: { name: 'first', count: 2, tags: undefined } },
    ]);
  });

  it('overlays merged data on top of the entity data returned by getById', () => {
    const result = resolveUpdates<FakeData, FakePatch>(
      [{ id: 'a', data: { count: 9 } }],
      (id) => (id === 'a' ? { data: { name: 'existing', count: 1, tags: ['x'] } } : null),
    );
    expect(result).toEqual([
      { id: 'a', data: { name: 'existing', count: 9, tags: ['x'] } },
    ]);
  });

  it('skips the lookup-and-overlay step when a patch has no data', () => {
    const result = resolveUpdates<FakeData, FakePatch>(
      [{ id: 'a', position: { x: 1, y: 2 } }],
      () => {
        throw new Error('getById should not be called when no data patch is present');
      },
    );
    expect(result).toEqual([{ id: 'a', position: { x: 1, y: 2 } }]);
  });

  it('leaves data untouched when getById returns null for that id', () => {
    const result = resolveUpdates<FakeData, FakePatch>(
      [{ id: 'a', data: { count: 5 } }],
      () => null,
    );
    expect(result).toEqual([{ id: 'a', data: { count: 5 } }]);
  });
});
