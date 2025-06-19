/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { MixedObject } from 'firefox-profiler/types';

/**
 * The "perf script" format is the plain text format that is output by an
 * invocation of `perf script`, where `perf` is the Linux perf command line tool.
 */
export function isFlameGraphFormat(profile: string): boolean {
  if (profile.startsWith('{')) {
    // Make sure we don't accidentally match JSON
    return false;
  }

  const firstLine = profile.substring(0, profile.indexOf('\n'));
  return !!firstLine.match(/[^;]*(;[^;]*)* [0-9]+/);
}

// Don't try and type this more specifically.
type GeckoProfileVersion24 = MixedObject;

const CATEGORIES = [
  { name: 'Other', color: 'grey', subcategories: ['Other'] },
  { name: 'Java', color: 'yellow', subcategories: ['Other'] },
  { name: 'Native', color: 'blue', subcategories: ['Other'] },
];
const OTHER_CATEGORY_INDEX = 0;
const JAVA_CATEGORY_INDEX = 1;
const NATIVE_CATEGORY_INDEX = 2;

/**
 * Convert the flamegraph.pl input text format into the gecko profile format (version 24).
 */
export function convertFlameGraphProfile(
  profile: string
): GeckoProfileVersion24 {
  function _createThread(name, pid, tid) {
    const markers = {
      schema: {
        name: 0,
        startTime: 1,
        endTime: 2,
        phase: 3,
        category: 4,
        data: 5,
      },
      data: [],
    };
    const samples = {
      schema: {
        stack: 0,
        time: 1,
        responsiveness: 2,
      },
      data: [],
    };
    const frameTable = {
      schema: {
        location: 0,
        relevantForJS: 1,
        innerWindowID: 2,
        implementation: 3,
        optimizations: 4,
        line: 5,
        column: 6,
        category: 7,
        subcategory: 8,
      },
      data: [],
    };
    const stackTable = {
      schema: {
        prefix: 0,
        frame: 1,
      },
      data: [],
    };
    const stringTable = [];

    const stackMap = new Map();
    function getOrCreateStack(frame, prefix) {
      const key = prefix === null ? `${frame}` : `${frame},${prefix}`;
      let stack = stackMap.get(key);
      if (stack === undefined) {
        stack = stackTable.data.length;
        stackTable.data.push([prefix, frame]);
        stackMap.set(key, stack);
      }
      return stack;
    }

    const frameMap = new Map();
    function getOrCreateFrame(frameString: string) {
      let frame = frameMap.get(frameString);
      if (frame === undefined) {
        frame = frameTable.data.length;
        const location = stringTable.length;
        stringTable.push(frameString.replace(/_\[j\]$/, ''));

        let category = OTHER_CATEGORY_INDEX;
        if (frameString.endsWith('_[j]')) {
          category = JAVA_CATEGORY_INDEX;
        } else if (!frameString.includes('::')) {
          category = NATIVE_CATEGORY_INDEX;
        }
        const implementation = null;
        const optimizations = null;
        const line = null;
        const relevantForJS = false;
        const subcategory = null;
        const innerWindowID = 0;
        const column = null;
        frameTable.data.push([
          location,
          relevantForJS,
          innerWindowID,
          implementation,
          optimizations,
          line,
          column,
          category,
          subcategory,
        ]);
        frameMap.set(frameString, frame);
      }
      return frame;
    }

    function addSample(time, stackArray) {
      const stack = stackArray.reduce((prefix, stackFrame) => {
        const frame = getOrCreateFrame(stackFrame);
        return getOrCreateStack(frame, prefix);
      }, null);
      // We don't have this information, so simulate that there's no latency at
      // all in processing events.
      const responsiveness = 0;
      samples.data.push([stack, time, responsiveness]);
    }

    return {
      addSample,
      finish: () => {
        return {
          tid,
          pid,
          name,
          markers,
          samples,
          frameTable,
          stackTable,
          stringTable,
          registerTime: 0,
          unregisterTime: null,
          processType: 'default',
        };
      },
    };
  }

  const thread = _createThread('MainThread', 0, 0);
  const lines = profile.split('\n');

  let timeStamp = 0;
  for (const line of lines) {
    if (line === '') {
      continue;
    }

    const matched = line.match(/([^;]*(;[^;]*)*) ([0-9]+)/);
    if (!matched) {
      console.log('unexpected line format', line);
      continue;
    }

    const [, frames, , duration] = matched;
    let count = parseInt(duration);
    while (count-- > 0) {
      const stack = frames.split(';');
      if (stack.length !== 0) {
        thread.addSample(timeStamp++, stack);
      }
    }
  }

  return {
    meta: {
      interval: 1,
      processType: 0,
      product: 'Firefox',
      stackwalk: 1,
      debug: 0,
      gcpoison: 0,
      asyncstack: 1,
      startTime: 0,
      shutdownTime: null,
      version: 24,
      presymbolicated: true,
      categories: CATEGORIES,
      markerSchema: [],
    },
    libs: [],
    threads: [thread.finish()],
    processes: [],
    pausedRanges: [],
  };
}
