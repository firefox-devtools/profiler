/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { adjustMarkerTimestamps } from './process-profile';
import { computeStringIndexMarkerFieldsByDataType } from './marker-schema';
import {
  getRawMarkerTableBuilderFromExisting,
  finishRawMarkerTableBuilder,
} from './data-structures';
import { StringTable } from 'firefox-profiler/utils/string-table';

import type {
  IndexIntoCategoryList,
  MarkerPayload,
  Milliseconds,
  Pid,
  Profile,
  ProfileMeta,
  RawThread,
  Tid,
} from 'firefox-profiler/types';

const PLATFORM_SPECIFIC_START_TIME_KEYS = [
  'startTimeAsClockMonotonicNanosecondsSinceBoot',
  'startTimeAsMachAbsoluteTimeNanoseconds',
] as const;

/**
 * Compute the value that needs to be added to a timestamp of the source
 * profile to get the timestamp of the same moment in the target profile.
 *
 * The platform-specific start times use the same clock in both profiles, so
 * they give an exact result. The wall-clock start times are only a fallback.
 */
export function computeTimeDeltaBetweenProfiles(
  sourceMeta: ProfileMeta,
  targetMeta: ProfileMeta
): { delta: Milliseconds; usedClock: string } {
  for (const key of PLATFORM_SPECIFIC_START_TIME_KEYS) {
    const sourceStart = sourceMeta[key];
    const targetStart = targetMeta[key];
    if (sourceStart !== undefined && targetStart !== undefined) {
      return { delta: (sourceStart - targetStart) / 1e6, usedClock: key };
    }
  }
  return {
    delta: sourceMeta.startTime - targetMeta.startTime,
    usedClock: 'startTime',
  };
}

function threadKey(pid: Pid, tid: Tid): string {
  return `${pid}:${tid}`;
}

const JVM_THREAD_SUFFIX = ' (JVM)';

/**
 * Group the source threads with markers by the key of the target thread they
 * belong to.
 *
 * The Gecko profiler puts the Java markers of an Android thread "X" into a
 * separate thread "X (JVM)", whose tid is the Java thread ID. These markers
 * belong to the native thread named "X" in the same process.
 */
function groupSourceThreadsByKey(
  threads: RawThread[]
): Map<string, RawThread[]> {
  const tidByProcessAndName = new Map<string, Tid>();
  for (const thread of threads) {
    if (!thread.name.endsWith(JVM_THREAD_SUFFIX)) {
      tidByProcessAndName.set(`${thread.pid}:${thread.name}`, thread.tid);
    }
  }

  const threadsByKey = new Map<string, RawThread[]>();
  for (const thread of threads) {
    if (thread.markers.length === 0) {
      continue;
    }
    let tid: Tid | undefined = thread.tid;
    if (thread.name.endsWith(JVM_THREAD_SUFFIX)) {
      const nativeName = thread.name.slice(0, -JVM_THREAD_SUFFIX.length);
      tid = tidByProcessAndName.get(`${thread.pid}:${nativeName}`) ?? tid;
    }
    const key = threadKey(thread.pid, tid);
    const group = threadsByKey.get(key);
    if (group === undefined) {
      threadsByKey.set(key, [thread]);
    } else {
      group.push(thread);
    }
  }
  return threadsByKey;
}

export type MergeMarkersResult = {
  profile: Profile;
  usedClock: string;
  // Names of the source threads whose markers were copied.
  mergedThreadNames: string[];
  // Names of the source threads with markers which had no matching thread in
  // the target profile.
  unmatchedThreadNames: string[];
};

/**
 * Copy the markers of the source profile into the target profile, into the
 * threads which have the same pid and tid. Source threads without such a
 * thread in the target profile are dropped. The markers of Gecko's "X (JVM)"
 * threads go into the thread of "X".
 *
 * This is used for Android startup profiles, which combine the samples of a
 * system-wide simpleperf profile with the markers of a Gecko profile from the
 * same run.
 */
export function mergeMarkersFromProfile(
  target: Profile,
  source: Profile
): MergeMarkersResult {
  const { delta, usedClock } = computeTimeDeltaBetweenProfiles(
    source.meta,
    target.meta
  );

  const markerSchema = target.meta.markerSchema.slice();
  const schemaNames = new Set(markerSchema.map((schema) => schema.name));
  for (const schema of source.meta.markerSchema) {
    if (!schemaNames.has(schema.name)) {
      schemaNames.add(schema.name);
      markerSchema.push(schema);
    }
  }

  const categories = (target.meta.categories ?? []).slice();
  const sourceCategories = source.meta.categories ?? [];
  const sourceCategoryToTarget: IndexIntoCategoryList[] = sourceCategories.map(
    (category) => {
      const index = categories.findIndex((c) => c.name === category.name);
      if (index !== -1) {
        return index;
      }
      categories.push(category);
      return categories.length - 1;
    }
  );

  const stringArray = target.shared.stringArray.slice();
  const stringTable = StringTable.withBackingArray(stringArray);
  const sourceStringArray = source.shared.stringArray;
  const stringIndexFieldsByDataType = computeStringIndexMarkerFieldsByDataType(
    source.meta.markerSchema
  );

  function translateData(data: MarkerPayload | null): MarkerPayload | null {
    if (data === null) {
      return null;
    }
    const newData: any = { ...data };
    // The stack indexes point into the source profile's stack table.
    delete newData.cause;
    const stringIndexFields = data.type
      ? stringIndexFieldsByDataType.get(data.type)
      : undefined;
    if (stringIndexFields !== undefined) {
      for (const key of stringIndexFields) {
        if (typeof newData[key] === 'number') {
          newData[key] = stringTable.indexForString(
            sourceStringArray[newData[key]]
          );
        }
      }
    }
    return newData;
  }

  const sourceThreadsByKey = groupSourceThreadsByKey(source.threads);

  const mergedThreadNames: string[] = [];
  const threads = target.threads.map((thread) => {
    const key = threadKey(thread.pid, thread.tid);
    const sourceThreads = sourceThreadsByKey.get(key);
    if (sourceThreads === undefined) {
      return thread;
    }
    sourceThreadsByKey.delete(key);

    const builder = getRawMarkerTableBuilderFromExisting(thread.markers);
    for (const sourceThread of sourceThreads) {
      mergedThreadNames.push(sourceThread.name);
      const sourceMarkers = adjustMarkerTimestamps(sourceThread.markers, delta);
      for (let i = 0; i < sourceMarkers.length; i++) {
        builder.data.push(translateData(sourceMarkers.data[i]));
        builder.name.push(
          stringTable.indexForString(sourceStringArray[sourceMarkers.name[i]])
        );
        builder.startTime.push(sourceMarkers.startTime[i]);
        builder.endTime.push(sourceMarkers.endTime[i]);
        builder.phase.push(sourceMarkers.phase[i]);
        builder.category.push(
          sourceCategoryToTarget[sourceMarkers.category[i]] ?? 0
        );
        if (builder.threadId !== undefined) {
          builder.threadId.push(thread.tid);
        }
        builder.length++;
      }
    }
    return { ...thread, markers: finishRawMarkerTableBuilder(builder) };
  });

  const profile: Profile = {
    ...target,
    meta: { ...target.meta, markerSchema, categories },
    shared: { ...target.shared, stringArray },
    threads,
  };
  if (source.pages !== undefined) {
    profile.pages = [...(target.pages ?? []), ...source.pages];
  }

  return {
    profile,
    usedClock,
    mergedThreadNames,
    unmatchedThreadNames: [...sourceThreadsByKey.values()]
      .flat()
      .map((thread) => thread.name),
  };
}
