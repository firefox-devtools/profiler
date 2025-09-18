/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { GlobalDataCollector } from '../../profile-logic/global-data-collector';
import { StringTable } from '../../utils/string-table';

describe('GlobalDataCollector', function () {
  describe('source table management', function () {
    it('should create an empty source table', function () {
      const collector = new GlobalDataCollector();
      const { shared } = collector.finish();

      expect(shared.sources.filename).toEqual([]);
      expect(shared.sources.uuid).toEqual([]);
      expect(shared.sources.length).toBe(0);
    });

    it('should add unique sources and return correct indexes', function () {
      const collector = new GlobalDataCollector();

      // Add different sources
      const sourceIndex1 = collector.indexForSource(null, 'file1.js');
      const sourceIndex2 = collector.indexForSource('uuid2', 'file2.js');
      // Duplicate filename but different UUID
      const sourceIndex3 = collector.indexForSource('uuid3', 'file1.js');

      expect(sourceIndex1).toBe(0);
      expect(sourceIndex2).toBe(1);
      expect(sourceIndex3).toBe(2);

      const { shared } = collector.finish();
      const stringTable = StringTable.withBackingArray(shared.stringArray);

      const file1Index = stringTable.indexForString('file1.js');
      const file2Index = stringTable.indexForString('file2.js');

      expect(shared.sources.filename).toEqual([
        file1Index,
        file2Index,
        file1Index,
      ]);
      expect(shared.sources.uuid).toEqual([null, 'uuid2', 'uuid3']);
      expect(shared.sources.length).toBe(3);
    });

    it('should return existing index for duplicate filename/uuid combinations', function () {
      const collector = new GlobalDataCollector();

      // Add the same source twice
      const sourceIndex1 = collector.indexForSource('same-uuid', 'file1.js');
      const sourceIndex2 = collector.indexForSource('same-uuid', 'file1.js');

      expect(sourceIndex1).toBe(sourceIndex2);
      expect(sourceIndex1).toBe(0);

      const { shared } = collector.finish();

      expect(shared.sources.uuid).toEqual(['same-uuid']);
      expect(shared.sources.length).toBe(1);
    });

    it('should handle null UUIDs correctly', function () {
      const collector = new GlobalDataCollector();

      // Add the same filename with null UUID twice
      const sourceIndex1 = collector.indexForSource(null, 'file1.js');
      const sourceIndex2 = collector.indexForSource(null, 'file1.js');

      expect(sourceIndex1).toBe(sourceIndex2);
      expect(sourceIndex1).toBe(0);

      const { shared } = collector.finish();

      expect(shared.sources.uuid).toEqual([null]);
      expect(shared.sources.length).toBe(1);
    });

    it('should handle different UUIDs for the same filename', function () {
      const collector = new GlobalDataCollector();

      // Add same filename with different UUIDs
      const sourceIndex1 = collector.indexForSource('uuid1', 'file1.js');
      const sourceIndex2 = collector.indexForSource('uuid2', 'file1.js');
      const sourceIndex3 = collector.indexForSource(null, 'file1.js');

      expect(sourceIndex1).toBe(0);
      expect(sourceIndex2).toBe(1);
      expect(sourceIndex3).toBe(2);

      const { shared } = collector.finish();

      expect(shared.sources.uuid).toEqual(['uuid1', 'uuid2', null]);
      expect(shared.sources.length).toBe(3);
    });
  });

  describe('string table integration', function () {
    it('should maintain correct string table state', function () {
      const collector = new GlobalDataCollector();

      // Add sources
      collector.indexForSource(null, 'first.js');
      collector.indexForSource('uuid', 'second.js');

      const { shared } = collector.finish();

      expect(shared.stringArray).toEqual(['first.js', 'second.js']);
      const stringTable = StringTable.withBackingArray(shared.stringArray);
      const firstIndex = stringTable.indexForString('first.js');
      const secondIndex = stringTable.indexForString('second.js');
      expect(shared.sources.filename).toEqual([firstIndex, secondIndex]);
    });

    it('should handle string deduplication correctly', function () {
      const collector = new GlobalDataCollector();

      // Add a source, then add another source with the same filename
      const sourceIndex1 = collector.indexForSource('uuid1', 'same.js');
      const sourceIndex2 = collector.indexForSource('uuid2', 'same.js');

      // Should be different source indexes since UUIDs are different
      expect(sourceIndex1).not.toBe(sourceIndex2);

      const { shared } = collector.finish();

      // Should have both files with the same filename string but different source entries
      const stringTable = StringTable.withBackingArray(shared.stringArray);
      const filenameIndex = stringTable.indexForString('same.js');

      expect(shared.sources.filename).toEqual([filenameIndex, filenameIndex]);
      expect(shared.sources.uuid).toEqual(['uuid1', 'uuid2']);
      expect(shared.sources.length).toBe(2);
    });
  });
});
