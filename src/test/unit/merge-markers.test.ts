/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { mergeMarkersFromProfile } from '../../profile-logic/merge-markers';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import { StringTable } from '../../utils/string-table';

import type { Profile, RawThread } from 'firefox-profiler/types';

function setThreadIds(
  profile: Profile,
  ids: Array<{ pid: string; tid: number; name: string }>
) {
  profile.threads.forEach((thread, i) => {
    Object.assign(thread, ids[i]);
  });
}

function getMarkerNamesAndTimes(profile: Profile, thread: RawThread) {
  const { markers } = thread;
  const result = [];
  for (let i = 0; i < markers.length; i++) {
    result.push([
      profile.shared.stringArray[markers.name[i]],
      markers.startTime[i],
    ]);
  }
  return result;
}

describe('mergeMarkersFromProfile', function () {
  function setup() {
    const target = getProfileWithMarkers([['TargetMarker', 1]], [], []);
    setThreadIds(target, [
      { pid: '100', tid: 100, name: 'org.mozilla.fenix' },
      { pid: '100', tid: 101, name: 'Gecko' },
      { pid: '200', tid: 200, name: 'org.mozilla.fenix:tab' },
    ]);
    target.meta.startTime = 1000;
    target.meta.startTimeAsClockMonotonicNanosecondsSinceBoot = 5e9;

    const source = getProfileWithMarkers(
      [['GeckoMarker', 2]],
      [['UIMarker', 3]],
      [['JavaMarker', 4]],
      [['OrphanMarker', 5]]
    );
    setThreadIds(source, [
      { pid: '100', tid: 101, name: 'GeckoMain' },
      { pid: '100', tid: 100, name: 'AndroidUI' },
      { pid: '100', tid: 1, name: 'AndroidUI (JVM)' },
      { pid: '300', tid: 300, name: 'Orphan' },
    ]);
    // The source profile starts 10ms after the target profile.
    source.meta.startTime = 1500;
    source.meta.startTimeAsClockMonotonicNanosecondsSinceBoot = 5.01e9;
    return { target, source };
  }

  it('copies the markers into the threads with the same pid and tid', function () {
    const { target, source } = setup();
    const { profile, usedClock, unmatchedThreadNames } =
      mergeMarkersFromProfile(target, source);

    expect(usedClock).toBe('startTimeAsClockMonotonicNanosecondsSinceBoot');
    expect(getMarkerNamesAndTimes(profile, profile.threads[0])).toEqual([
      ['TargetMarker', 1],
      ['UIMarker', 13],
      ['JavaMarker', 14],
    ]);
    expect(getMarkerNamesAndTimes(profile, profile.threads[1])).toEqual([
      ['GeckoMarker', 12],
    ]);
    expect(profile.threads[2].markers.length).toBe(0);
    expect(unmatchedThreadNames).toEqual(['Orphan']);
  });

  it('falls back to the wall-clock start time', function () {
    const { target, source } = setup();
    delete target.meta.startTimeAsClockMonotonicNanosecondsSinceBoot;
    const { profile, usedClock } = mergeMarkersFromProfile(target, source);

    expect(usedClock).toBe('startTime');
    expect(getMarkerNamesAndTimes(profile, profile.threads[1])).toEqual([
      ['GeckoMarker', 502],
    ]);
  });

  it('translates the string indexes in marker payloads', function () {
    const { target, source } = setup();
    const sourceStrings = StringTable.withBackingArray(
      source.shared.stringArray
    );
    source.threads[0].markers.data[0] = {
      type: 'Log',
      module: 'nsHttp',
      name: 'log',
      level: sourceStrings.indexForString('Debug'),
      message: sourceStrings.indexForString('Hello'),
      cause: { tid: 101, time: 2, stack: 0 },
    } as any;

    const { profile } = mergeMarkersFromProfile(target, source);
    const { markers } = profile.threads[1];
    const data = markers.data[0] as any;
    const { stringArray } = profile.shared;
    expect(stringArray[data.level]).toBe('Debug');
    expect(stringArray[data.message]).toBe('Hello');
    // Stack indexes from the source profile would be meaningless.
    expect(data.cause).toBeUndefined();
  });

  it('does not modify the target profile', function () {
    const { target, source } = setup();
    const stringCount = target.shared.stringArray.length;
    mergeMarkersFromProfile(target, source);
    expect(target.shared.stringArray.length).toBe(stringCount);
    expect(target.threads[1].markers.length).toBe(0);
  });
});
