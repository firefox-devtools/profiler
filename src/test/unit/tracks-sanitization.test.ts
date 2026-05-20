/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  computeOldTrackIndexToNewTrackIndexMap,
  computeHiddenTracksAfterSanitization,
  computeTrackOrderAfterSanitization,
} from '../../profile-logic/tracks';

import type { Track } from 'firefox-profiler/types';

describe('computeOldTrackIndexToNewTrackIndexMap', function () {
  it('matches process tracks by pid', function () {
    const oldTracks: Track[] = [
      { type: 'process', pid: '1', mainThreadIndex: 0 },
      { type: 'process', pid: '2', mainThreadIndex: 1 },
      { type: 'process', pid: '3', mainThreadIndex: 2 },
    ];
    const newTracks: Track[] = [
      { type: 'process', pid: '1', mainThreadIndex: 0 },
      { type: 'process', pid: '3', mainThreadIndex: 1 },
    ];
    const map = computeOldTrackIndexToNewTrackIndexMap({
      oldTracks,
      newTracks,
      oldThreadIndexToNew: null,
      oldCounterIndexToNew: null,
      oldStringToNewStringPlusOne: null,
    });
    expect(map.get(0)).toBe(0);
    expect(map.has(1)).toBe(false);
    expect(map.get(2)).toBe(1);
  });

  it('matches screenshot tracks by id', function () {
    const oldTracks: Track[] = [
      { type: 'screenshots', id: 'win-A', threadIndex: 0 },
      { type: 'screenshots', id: 'win-B', threadIndex: 0 },
    ];
    const newTracks: Track[] = [
      { type: 'screenshots', id: 'win-B', threadIndex: 0 },
    ];
    const map = computeOldTrackIndexToNewTrackIndexMap({
      oldTracks,
      newTracks,
      oldThreadIndexToNew: null,
      oldCounterIndexToNew: null,
      oldStringToNewStringPlusOne: null,
    });
    expect(map.has(0)).toBe(false);
    expect(map.get(1)).toBe(0);
  });

  it('matches visual-progress singletons by type', function () {
    const oldTracks: Track[] = [
      { type: 'visual-progress' },
      { type: 'perceptual-visual-progress' },
      { type: 'contentful-visual-progress' },
    ];
    const newTracks: Track[] = [
      { type: 'contentful-visual-progress' },
      { type: 'visual-progress' },
    ];
    const map = computeOldTrackIndexToNewTrackIndexMap({
      oldTracks,
      newTracks,
      oldThreadIndexToNew: null,
      oldCounterIndexToNew: null,
      oldStringToNewStringPlusOne: null,
    });
    expect(map.get(0)).toBe(1); // visual-progress
    expect(map.has(1)).toBe(false); // perceptual was removed
    expect(map.get(2)).toBe(0); // contentful
  });

  it('translates threadIndex via oldThreadIndexToNew for thread-keyed tracks', function () {
    const oldTracks: Track[] = [
      { type: 'thread', threadIndex: 0 },
      { type: 'network', threadIndex: 1 },
      { type: 'ipc', threadIndex: 2 },
      { type: 'event-delay', threadIndex: 3 },
    ];
    // After sanitization thread #1 was removed; the others were renumbered.
    const oldThreadIndexToNew = new Map<number, number>([
      [0, 0],
      [2, 1],
      [3, 2],
    ]);
    const newTracks: Track[] = [
      { type: 'thread', threadIndex: 0 },
      { type: 'ipc', threadIndex: 1 },
      { type: 'event-delay', threadIndex: 2 },
    ];
    const map = computeOldTrackIndexToNewTrackIndexMap({
      oldTracks,
      newTracks,
      oldThreadIndexToNew,
      oldCounterIndexToNew: null,
      oldStringToNewStringPlusOne: null,
    });
    expect(map.get(0)).toBe(0); // thread:0 → new threadIndex 0
    expect(map.has(1)).toBe(false); // network:1 has no surviving thread
    expect(map.get(2)).toBe(1); // ipc:2 → new threadIndex 1
    expect(map.get(3)).toBe(2); // event-delay:3 → new threadIndex 2
  });

  it('translates counterIndex via oldCounterIndexToNew for counter tracks', function () {
    const oldTracks: Track[] = [
      { type: 'counter', counterIndex: 0 },
      { type: 'counter', counterIndex: 1 },
      { type: 'counter', counterIndex: 2 },
    ];
    // Counter #1 was sanitized away; #2 is now at index 1.
    const oldCounterIndexToNew = new Map<number, number>([
      [0, 0],
      [2, 1],
    ]);
    const newTracks: Track[] = [
      { type: 'counter', counterIndex: 0 },
      { type: 'counter', counterIndex: 1 },
    ];
    const map = computeOldTrackIndexToNewTrackIndexMap({
      oldTracks,
      newTracks,
      oldThreadIndexToNew: null,
      oldCounterIndexToNew,
      oldStringToNewStringPlusOne: null,
    });
    expect(map.get(0)).toBe(0);
    expect(map.has(1)).toBe(false);
    expect(map.get(2)).toBe(1);
  });

  it('matches marker tracks by (translated threadIndex, schema name, translated markerName)', function () {
    const schemaA = { name: 'CustomA' } as any;
    const schemaB = { name: 'CustomB' } as any;
    const oldTracks: Track[] = [
      // Survives: thread translated 0→0, markerName 10→3.
      {
        type: 'marker',
        threadIndex: 0,
        markerSchema: schemaA,
        markerName: 10,
      } as any,
      // Sanitized away because its thread is gone.
      {
        type: 'marker',
        threadIndex: 1,
        markerSchema: schemaA,
        markerName: 11,
      } as any,
      // Sanitized away because its marker name string was removed.
      {
        type: 'marker',
        threadIndex: 0,
        markerSchema: schemaB,
        markerName: 12,
      } as any,
      // Survives: thread 2→1, markerName 13→4.
      {
        type: 'marker',
        threadIndex: 2,
        markerSchema: schemaB,
        markerName: 13,
      } as any,
    ];
    const newTracks: Track[] = [
      {
        type: 'marker',
        threadIndex: 0,
        markerSchema: schemaA,
        markerName: 3,
      } as any,
      {
        type: 'marker',
        threadIndex: 1,
        markerSchema: schemaB,
        markerName: 4,
      } as any,
    ];
    const oldThreadIndexToNew = new Map<number, number>([
      [0, 0],
      [2, 1],
    ]);
    // Old string indexes 10, 11, 13 survive (mapping to 3, 5, 4); index 12 was
    // removed (encoded as 0 in the plusOne array).
    const oldStringToNewStringPlusOne = new Int32Array(14);
    oldStringToNewStringPlusOne[10] = 4;
    oldStringToNewStringPlusOne[11] = 6;
    oldStringToNewStringPlusOne[12] = 0;
    oldStringToNewStringPlusOne[13] = 5;

    const map = computeOldTrackIndexToNewTrackIndexMap({
      oldTracks,
      newTracks,
      oldThreadIndexToNew,
      oldCounterIndexToNew: null,
      oldStringToNewStringPlusOne,
    });
    expect(map.get(0)).toBe(0);
    expect(map.has(1)).toBe(false);
    expect(map.has(2)).toBe(false);
    expect(map.get(3)).toBe(1);
  });

  it('does not match marker tracks whose schema name differs', function () {
    const oldTracks: Track[] = [
      {
        type: 'marker',
        threadIndex: 0,
        markerSchema: { name: 'CustomA' } as any,
        markerName: 5,
      } as any,
    ];
    const newTracks: Track[] = [
      {
        type: 'marker',
        threadIndex: 0,
        markerSchema: { name: 'CustomB' } as any,
        markerName: 5,
      } as any,
    ];
    const map = computeOldTrackIndexToNewTrackIndexMap({
      oldTracks,
      newTracks,
      oldThreadIndexToNew: null,
      oldCounterIndexToNew: null,
      oldStringToNewStringPlusOne: null,
    });
    expect(map.has(0)).toBe(false);
  });

  it('handles a mixed track list (process + screenshots + visual-progress)', function () {
    const oldTracks: Track[] = [
      { type: 'process', pid: '1', mainThreadIndex: 0 },
      { type: 'screenshots', id: 'win-A', threadIndex: 0 },
      { type: 'process', pid: '2', mainThreadIndex: 1 },
      { type: 'visual-progress' },
    ];
    const newTracks: Track[] = [
      { type: 'process', pid: '1', mainThreadIndex: 0 },
      { type: 'visual-progress' },
    ];
    const map = computeOldTrackIndexToNewTrackIndexMap({
      oldTracks,
      newTracks,
      oldThreadIndexToNew: null,
      oldCounterIndexToNew: null,
      oldStringToNewStringPlusOne: null,
    });
    expect(map.get(0)).toBe(0); // process pid 1
    expect(map.has(1)).toBe(false); // screenshot win-A removed
    expect(map.has(2)).toBe(false); // process pid 2 removed
    expect(map.get(3)).toBe(1); // visual-progress preserved
  });
});

describe('computeHiddenTracksAfterSanitization', function () {
  it('drops hidden indexes whose track was sanitized away', function () {
    const oldTrackIndexToNewTrackIndex = new Map<number, number>([
      [0, 0],
      [2, 1],
      [3, 2],
    ]);
    const result = computeHiddenTracksAfterSanitization({
      oldHiddenTracks: new Set([0, 1, 3]),
      oldTrackIndexToNewTrackIndex,
    });
    // Old 0 → new 0 (kept); old 1 has no mapping (sanitized away); old 3 → new 2.
    expect([...result].sort()).toEqual([0, 2]);
  });

  it('returns an empty set when no hidden tracks survive', function () {
    const result = computeHiddenTracksAfterSanitization({
      oldHiddenTracks: new Set([5, 6, 7]),
      oldTrackIndexToNewTrackIndex: new Map([[0, 0]]),
    });
    expect(result.size).toBe(0);
  });

  it('returns an empty set when no tracks are hidden', function () {
    const result = computeHiddenTracksAfterSanitization({
      oldHiddenTracks: new Set(),
      oldTrackIndexToNewTrackIndex: new Map([[0, 0]]),
    });
    expect(result.size).toBe(0);
  });
});

describe('computeTrackOrderAfterSanitization', function () {
  it('preserves relative order, dropping unmapped indexes', function () {
    const oldTrackIndexToNewTrackIndex = new Map<number, number>([
      [0, 2],
      [1, 0],
      [3, 1],
    ]);
    const result = computeTrackOrderAfterSanitization({
      oldTrackOrder: [3, 0, 1, 2], // index 2 has no mapping → dropped
      oldTrackIndexToNewTrackIndex,
    });
    expect(result).toEqual([1, 2, 0]);
  });

  it('returns an empty array when no order entries survive', function () {
    const result = computeTrackOrderAfterSanitization({
      oldTrackOrder: [5, 6, 7],
      oldTrackIndexToNewTrackIndex: new Map([[0, 0]]),
    });
    expect(result).toEqual([]);
  });
});
