/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  SetCollectionBuilder,
  type SetCollectionTable,
  type IndexIntoSetCollectionTable,
} from '../../utils/set-collection';

function buildMulti<T>(
  builder: SetCollectionBuilder<T>,
  values: T[]
): IndexIntoSetCollectionTable | null {
  let parent = null;
  for (const value of values) {
    parent = builder.extend(parent, value);
  }
  return parent;
}

/**
 * Helper function to convert a SetCollectionTable entry to a Set,
 * while also validating that there are no duplicate values in the chain.
 */
function checkedMakeSet<T>(
  table: SetCollectionTable<T>,
  index: IndexIntoSetCollectionTable | null
): Set<T> {
  const result = new Set<T>();
  for (
    let ancestor = index;
    ancestor !== null;
    ancestor = table.parent[ancestor]
  ) {
    const value = table.value[ancestor];
    if (result.has(value)) {
      throw new Error(
        `Duplicate value ${value} found in chain at index ${index}`
      );
    }
    result.add(value);
  }
  return result;
}

describe('SetCollectionBuilder', function () {
  describe('set construction with parent', function () {
    it('creates a three-element set', function () {
      const builder = new SetCollectionBuilder<number>();
      const index1 = builder.extend(null, 1);
      const index2 = builder.extend(index1, 2);
      const index3 = builder.extend(index2, 3);
      const table = builder.finish();

      expect(checkedMakeSet(table, index3)).toEqual(new Set([1, 2, 3]));
    });

    it('creates multiple children under same parent', function () {
      const builder = new SetCollectionBuilder<number>();
      const parent = builder.extend(null, 1);
      const child1 = builder.extend(parent, 2);
      const child2 = builder.extend(parent, 3);
      const child3 = builder.extend(parent, 4);
      const table = builder.finish();

      // All children should have the same parent
      expect(table.parent[child1]).toBe(parent);
      expect(table.parent[child2]).toBe(parent);
      expect(table.parent[child3]).toBe(parent);

      // But different values
      expect(table.value[child1]).toBe(2);
      expect(table.value[child2]).toBe(3);
      expect(table.value[child3]).toBe(4);
    });
  });

  describe('deduplication - exact match', function () {
    it('returns same index for identical single-value set', function () {
      const builder = new SetCollectionBuilder<number>();
      const index1 = builder.extend(null, 5);
      const index2 = builder.extend(null, 5);
      const table = builder.finish();

      expect(index1).toBe(index2);
      expect(table.length).toBe(1);
    });

    it('returns same index for identical two-element set', function () {
      const builder = new SetCollectionBuilder<number>();
      const parent1 = builder.extend(null, 2);
      const set1 = builder.extend(parent1, 3);

      const parent2 = builder.extend(null, 2);
      const set2 = builder.extend(parent2, 3);

      expect(parent1).toBe(parent2);
      expect(set1).toBe(set2);
    });

    it('returns same index when requesting subset', function () {
      const builder = new SetCollectionBuilder<number>();
      const parent = builder.extend(null, 2);
      builder.extend(parent, 3);

      // Now request just (2) again
      const parentAgain = builder.extend(null, 2);

      expect(parentAgain).toBe(parent);
    });
  });

  describe('deduplication - value already in parent chain', function () {
    it('detects value in immediate parent', function () {
      const builder = new SetCollectionBuilder<number>();
      const set1 = builder.extend(null, 5);
      const set2 = builder.extend(set1, 5);

      // Adding 5 to a set that already contains 5 should return the parent
      expect(set2).toBe(set1);
    });

    it('detects value deep in ancestor chain', function () {
      const builder = new SetCollectionBuilder<number>();
      const set1 = builder.extend(null, 1);
      const set2 = builder.extend(set1, 2);
      const set3 = builder.extend(set2, 3);
      const set4 = builder.extend(set3, 4);
      const set5 = builder.extend(set4, 2); // 2 is in the chain
      const table = builder.finish();

      // When adding 2 to (1,2,3,4), since 2 is already in the chain,
      // it creates a non-canonical node with value=4 (from parent), self=2, parent=set3
      expect(set5).not.toBe(set4);
      expect(checkedMakeSet(table, set5)).toEqual(new Set([1, 2, 3, 4]));
      expect(table.value[set5]).toBe(4);
      expect(table.self[set5]).toBe(2);
      expect(table.parent[set5]).toBe(set3);
    });

    it('example: (2, 4, 3) + 3/4 -> (2, 4, 3)', function () {
      const builder = new SetCollectionBuilder<number>();
      const set243 = buildMulti(builder, [2, 4, 3]);
      const set2433 = buildMulti(builder, [2, 4, 3, 3]);
      const set2434 = buildMulti(builder, [2, 4, 3, 4]);
      const set2435 = buildMulti(builder, [2, 4, 3, 5]);
      const set24345 = buildMulti(builder, [2, 4, 3, 4, 5]);
      const table = builder.finish();

      expect(set2433).toBe(set243);
      expect(set2434).not.toBe(set243); // different self
      expect(set2435).toBe(set24345);
      expect(checkedMakeSet(table, set243)).toEqual(new Set([2, 4, 3]));
      expect(checkedMakeSet(table, set2434)).toEqual(new Set([2, 4, 3]));
      expect(checkedMakeSet(table, set24345)).toEqual(new Set([2, 4, 3, 5]));
    });

    it('multiple roots with reordering', function () {
      const builder = new SetCollectionBuilder<number>();
      const set1 = buildMulti(builder, [1]);
      const set2 = buildMulti(builder, [2]);
      const set3 = buildMulti(builder, [3]);
      expect(buildMulti(builder, [1])).toBe(set1);
      expect(buildMulti(builder, [3])).toBe(set3);
      expect(buildMulti(builder, [3])).toBe(set3);
      expect(buildMulti(builder, [2])).toBe(set2);
      const set4 = buildMulti(builder, [4]);
      expect(buildMulti(builder, [2])).toBe(set2);
      const table = builder.finish();

      expect(checkedMakeSet(table, set1)).toEqual(new Set([1]));
      expect(checkedMakeSet(table, set2)).toEqual(new Set([2]));
      expect(checkedMakeSet(table, set3)).toEqual(new Set([3]));
      expect(checkedMakeSet(table, set4)).toEqual(new Set([4]));
    });

    it('multiple canonical children with reordering', function () {
      const builder = new SetCollectionBuilder<number>();
      const set24345 = buildMulti(builder, [2, 4, 3, 4, 5]);
      const set2435 = buildMulti(builder, [2, 4, 3, 5]);
      expect(set24345).toBe(set2435);
      const set2436 = buildMulti(builder, [2, 4, 3, 6]);
      expect(buildMulti(builder, [2, 4, 3, 5])).toBe(set2435);
      const set2437 = buildMulti(builder, [2, 4, 3, 7]);
      expect(buildMulti(builder, [2, 4, 3, 4, 6])).toBe(set2436);
      expect(buildMulti(builder, [2, 4, 3, 4, 7])).toBe(set2437);
      const table = builder.finish();

      expect(checkedMakeSet(table, set2437)).toEqual(new Set([2, 4, 3, 7]));
    });
  });

  describe('edge cases', function () {
    it('handles string equality correctly', function () {
      const builder = new SetCollectionBuilder<string>();
      const index1 = builder.extend(null, 'test');
      const index2 = builder.extend(null, 'test');
      const index3 = builder.extend(null, 'test '); // different!

      expect(index1).toBe(index2);
      expect(index1).not.toBe(index3);
    });
  });
});
