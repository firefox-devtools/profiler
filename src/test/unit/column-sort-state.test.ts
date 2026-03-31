/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ColumnSortState } from '../../components/shared/TreeView';

describe('ColumnSortState', function () {
  describe('withToggledSortForColumn', function () {
    it('flips direction when the same column is toggled again', function () {
      const initial = new ColumnSortState([]).withToggledSortForColumn(
        'name',
        false
      );
      expect(initial.current()).toEqual({ column: 'name', ascending: true });

      const toggled = initial.withToggledSortForColumn('name', false);
      expect(toggled.current()).toEqual({ column: 'name', ascending: false });

      const toggledAgain = toggled.withToggledSortForColumn('name', false);
      expect(toggledAgain.current()).toEqual({
        column: 'name',
        ascending: true,
      });
    });

    it('promotes a different column to primary, demoting the previous primary to a tiebreaker', function () {
      const state = new ColumnSortState([])
        .withToggledSortForColumn('name', false)
        .withToggledSortForColumn('duration', true);

      expect(state.sortedColumns).toEqual([
        { column: 'name', ascending: true },
        { column: 'duration', ascending: false },
      ]);
      expect(state.current()).toEqual({
        column: 'duration',
        ascending: false,
      });

      const promoted = state.withToggledSortForColumn('start', false);
      expect(promoted.sortedColumns).toEqual([
        { column: 'name', ascending: true },
        { column: 'duration', ascending: false },
        { column: 'start', ascending: true },
      ]);
      expect(promoted.current()).toEqual({
        column: 'start',
        ascending: true,
      });
    });

    it('promotes an existing tiebreaker to primary and resets its direction from prefersDescending', function () {
      const state = new ColumnSortState([])
        .withToggledSortForColumn('name', false)
        .withToggledSortForColumn('duration', true)
        .withToggledSortForColumn('start', false);

      // 'name' is a tiebreaker (not primary). Toggle it to make it primary.
      // Its direction resets to !prefersDescending — not a flip of its
      // previous direction.
      const promoted = state.withToggledSortForColumn('name', true);
      expect(promoted.sortedColumns).toEqual([
        { column: 'duration', ascending: false },
        { column: 'start', ascending: true },
        { column: 'name', ascending: false },
      ]);

      const promotedAsc = state.withToggledSortForColumn('name', false);
      expect(promotedAsc.current()).toEqual({
        column: 'name',
        ascending: true,
      });
    });

    it('uses prefersDescending to seed the initial direction', function () {
      const ascending = new ColumnSortState([]).withToggledSortForColumn(
        'name',
        false
      );
      expect(ascending.current()).toEqual({ column: 'name', ascending: true });

      const descending = new ColumnSortState([]).withToggledSortForColumn(
        'duration',
        true
      );
      expect(descending.current()).toEqual({
        column: 'duration',
        ascending: false,
      });
    });
  });

  describe('current', function () {
    it('returns null for empty state', function () {
      expect(new ColumnSortState([]).current()).toBeNull();
    });

    it('returns the last entry as the primary sort', function () {
      const state = new ColumnSortState([
        { column: 'name', ascending: true },
        { column: 'duration', ascending: false },
      ]);
      expect(state.current()).toEqual({
        column: 'duration',
        ascending: false,
      });
    });
  });

  describe('sortItemsHelper', function () {
    type Item = { a: number; b: number };
    const compareColumn = (x: Item, y: Item, column: string): number => {
      if (column === 'a') {
        return x.a - y.a;
      }
      if (column === 'b') {
        return x.b - y.b;
      }
      throw new Error(`unknown column ${column}`);
    };

    it('sorts stably across multiple criteria with the last column as primary', function () {
      const items: Item[] = [
        { a: 1, b: 2 },
        { a: 1, b: 1 },
        { a: 0, b: 9 },
      ];
      // Primary: a ascending; tiebreaker: b ascending. Tiebreakers are listed
      // first; the primary is last.
      const state = new ColumnSortState([
        { column: 'b', ascending: true },
        { column: 'a', ascending: true },
      ]);
      expect(state.sortItemsHelper(items, compareColumn)).toEqual([
        { a: 0, b: 9 },
        { a: 1, b: 1 },
        { a: 1, b: 2 },
      ]);
    });

    it('returns a copy of the input when sortedColumns is empty and does not mutate the input', function () {
      const items: Item[] = [
        { a: 1, b: 2 },
        { a: 1, b: 1 },
        { a: 0, b: 9 },
      ];
      const inputSnapshot = items.slice();
      const state = new ColumnSortState([]);
      const result = state.sortItemsHelper(items, compareColumn);

      expect(result).toEqual(inputSnapshot);
      expect(result).not.toBe(items);
      expect(items).toEqual(inputSnapshot);
    });

    it('sorts descending when ascending is false', function () {
      const items: Item[] = [
        { a: 1, b: 0 },
        { a: 3, b: 0 },
        { a: 2, b: 0 },
      ];
      const state = new ColumnSortState([{ column: 'a', ascending: false }]);
      expect(state.sortItemsHelper(items, compareColumn)).toEqual([
        { a: 3, b: 0 },
        { a: 2, b: 0 },
        { a: 1, b: 0 },
      ]);
    });
  });
});
