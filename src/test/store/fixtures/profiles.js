/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getEmptyProfile } from '../../../content/profile-data';
import { UniqueStringArray } from '../../../content/unique-string-array';
import type { Profile, Thread, MarkersTable } from '../../../common/types/profile';
import type { Milliseconds } from '../../../common/types/units';

// Array<[MarkerName, Milliseconds, Data]>
type MarkerName = string;
type MarkerTime = Milliseconds;
type DataPayload = Object;
type TestDefinedMarkers = Array<[MarkerName, MarkerTime, DataPayload]>;

export function getProfileWithMarkers(markers: TestDefinedMarkers): Profile {
  const profile = getEmptyProfile();
  const thread = getEmptyThread();
  const stringTable = thread.stringTable;
  const markersTable: MarkersTable = {
    name: [],
    time: [],
    data: [],
    length: 0,
  };
  markers.map(([name, time, data]) => {
    markersTable.name.push(stringTable.indexForString(name));
    markersTable.time.push(time);
    markersTable.data.push(data);
    markersTable.length++;
  });
  profile.threads.push(Object.assign({}, thread, { markers: markersTable }));
  return profile;
}

export function getProfileWithNamedThreads(threadNames: string[]): Profile {
  const profile = getEmptyProfile();
  profile.threads = threadNames.map(name => getEmptyThread({ name }));
  return profile;
}

export function getEmptyThread(overrides: ?Object): Thread {
  return Object.assign({
    processType: 'default',
    name: 'Empty',
    pid: 0,
    tid: 0,
    samples: {
      frameNumber: [],
      responsiveness: [],
      stack: [],
      time: [],
      rss: [],
      uss: [],
      length: 0,
    },
    markers: {
      data: [],
      name: [],
      time: [],
      length: 0,
    },
    stackTable: {
      frame: [],
      prefix: [],
      length: 0,
    },
    frameTable: {
      address: [],
      category: [],
      func: [],
      implementation: [],
      line: [],
      optimizations: [],
      length: 0,
    },
    stringTable: new UniqueStringArray(),
    libs: [],
    funcTable: {
      address: [],
      isJS: false,
      name: [],
      resource: [],
      fileName: [],
      lineNumber: [],
      length: 0,
    },
    resourceTable: {
      addonId: [],
      icon: [],
      length: 0,
      lib: [],
      name: [],
      type: 0,
    },
  }, overrides);
}
