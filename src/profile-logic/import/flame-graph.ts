/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Milliseconds } from 'firefox-profiler/types/units';
import type {
  CategoryList,
  IndexIntoCategoryList,
  IndexIntoFrameTable,
  IndexIntoStackTable,
  Profile,
} from 'firefox-profiler/types/profile';
import {
  getEmptyProfile,
  getEmptyThread,
} from 'firefox-profiler/profile-logic/data-structures';
import { GlobalDataCollector } from 'firefox-profiler/profile-logic/global-data-collector';
import { ensureExists } from 'firefox-profiler/utils/types';

/**
 * The flamegraph.pl format is a plain text format where each line represents
 * a collapsed stack trace followed by a count. This format is commonly used
 * as input for flamegraph.pl and similar flame graph visualization tools.
 *
 * Format: "frame1;frame2;frame3 count"
 * Example: "java.lang.Thread.run;MyClass.method_[j];helper 42"
 */
export function isFlameGraphFormat(profile: string): boolean {
  if (profile.startsWith('{')) {
    // Make sure we don't accidentally match JSON.
    return false;
  }

  const firstLine = profile.substring(0, profile.indexOf('\n'));
  return !!firstLine.match(/[^;]*(?:;[^;]*)* [0-9]+/);
}

const CATEGORIES: CategoryList = [
  { name: 'Java', color: 'yellow', subcategories: ['Other'] },
  { name: 'Native', color: 'blue', subcategories: ['Other'] },
];
const JAVA_CATEGORY_INDEX: IndexIntoCategoryList = 0;
const NATIVE_CATEGORY_INDEX: IndexIntoCategoryList = 1;

/**
 * Convert the flamegraph.pl input text format into the processed profile format.
 */
export function convertFlameGraphProfile(profileText: string): Profile {
  const profile = getEmptyProfile();
  profile.meta.product = 'Flamegraph';
  profile.meta.categories = CATEGORIES;

  const globalDataCollector = new GlobalDataCollector();
  const stringTable = globalDataCollector.getStringTable();

  const thread = getEmptyThread({
    name: 'Program',
    pid: '0',
    tid: 0,
  });

  const frameTable = globalDataCollector.getFrameTable();
  const stackTable = globalDataCollector.getStackTable();
  const { samples } = thread;

  // Maps to deduplicate stacks, frames, and functions.
  const stackMap = new Map<string, IndexIntoStackTable>();
  const frameMap = new Map<string, IndexIntoFrameTable>();

  function getOrCreateStack(
    frameIndex: IndexIntoFrameTable,
    prefix: IndexIntoStackTable | null
  ): IndexIntoStackTable {
    const key = prefix === null ? `${frameIndex}` : `${frameIndex},${prefix}`;
    let stack = stackMap.get(key);
    if (stack === undefined) {
      stack = stackTable.length;
      stackTable.frame.push(frameIndex);
      stackTable.prefix.push(prefix);
      stackTable.length++;
      stackMap.set(key, stack);
    }
    return stack;
  }

  function getOrCreateFrame(frameString: string): IndexIntoFrameTable {
    let frameIndex = frameMap.get(frameString);
    if (frameIndex !== undefined) {
      return frameIndex;
    }

    // Clean the frame name by removing the _[j] suffix.
    const cleanedName = frameString.replace(/_\[j\]$/, '');

    // Categorize frames based on common conventions in Java profilers.
    // _[j] suffix: Java frames (used by async-profiler and similar tools).
    let category: IndexIntoCategoryList = NATIVE_CATEGORY_INDEX;
    if (frameString.endsWith('_[j]')) {
      category = JAVA_CATEGORY_INDEX;
    }

    // Create or get function.
    const nameIndex = stringTable.indexForString(cleanedName);
    const funcIndex = globalDataCollector.indexForFunc(
      nameIndex,
      false,
      false,
      -1,
      null,
      null,
      null
    );

    // Create frame.
    frameIndex = frameTable.length;
    frameTable.address.push(-1);
    frameTable.inlineDepth.push(0);
    frameTable.category.push(category);
    frameTable.subcategory.push(0);
    frameTable.func.push(funcIndex);
    frameTable.nativeSymbol.push(null);
    frameTable.innerWindowID.push(null);
    frameTable.line.push(null);
    frameTable.column.push(null);
    frameTable.length++;
    frameMap.set(frameString, frameIndex);

    return frameIndex;
  }

  function addSample(time: Milliseconds, stackArray: string[]): void {
    const stack = stackArray.reduce<IndexIntoStackTable | null>(
      (prefix, stackFrame) => {
        const frameIndex = getOrCreateFrame(stackFrame);
        return getOrCreateStack(frameIndex, prefix);
      },
      null
    );
    samples.stack.push(stack);
    ensureExists(samples.time).push(time);
    samples.length++;
  }

  // Parse the flamegraph text format.
  const lines = profileText.split('\n');

  // The flamegraph.pl format doesn't include timestamp information.
  // Each line only contains a collapsed stack and a count of how many times
  // that stack was observed. To convert this to the profiler's sample-based
  // format, we generate fake sequential timestamps for each sample.
  let timeStamp: Milliseconds = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      continue;
    }

    const matched = line.match(/([^;]*(?:;[^;]*)*) ([0-9]+)/);
    if (!matched) {
      console.warn('unexpected line format', line);
      continue;
    }

    const [, frames, duration] = matched;
    const stack = frames.split(';');
    let count = parseInt(duration, 10);
    while (count-- > 0) {
      addSample(timeStamp++, stack);
    }
  }

  // Finalize the profile.
  profile.threads.push(thread);
  const { shared } = globalDataCollector.finish();
  profile.shared = shared;

  return profile;
}
