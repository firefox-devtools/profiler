/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * This file deals with old versions of the "processed" profile format,
 * i.e. the format that profiler.firefox.com uses internally. Profiles in this format
 * can be saved out to files or uploaded to the profile store server, and we
 * want to be able to display profiles that were saved at any point in the
 * past, regardless of their version. So this file upgrades old profiles to
 * the current format.
 *
 * Please don't forget to update the processed profile format changelog in
 * `docs-developer/CHANGELOG-formats.md`.
 */

import { sortDataTable } from '../utils/data-table-utils';
import { resourceTypes } from './data-structures';
import { StringTable } from '../utils/string-table';
import { timeCode } from '../utils/time-code';
import { PROCESSED_PROFILE_VERSION } from '../app-logic/constants';
import type { Profile } from 'firefox-profiler/types';

// Processed profiles before version 1 did not have a profile.meta.preprocessedProfileVersion
// field. Treat those as version zero.
const UNANNOTATED_VERSION = 0;

/**
 * Upgrades the supplied profile to the current version, by mutating |profile|.
 * Throws an exception if the profile is too new. If the profile does not appear
 * to be a processed profile, then return null.
 */
export function attemptToUpgradeProcessedProfileThroughMutation(
  profile: any
): Profile | null {
  if (!profile || typeof profile !== 'object') {
    return null;
  }
  const { meta } = profile;
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  if (typeof meta.preprocessedProfileVersion !== 'number') {
    // This is most likely not a processed profile, but it could be
    // a pre-version 1 profile.
    const { threads } = profile;
    if (!threads || !Array.isArray(threads)) {
      // There are no threads.
      return null;
    }
    const [firstThread] = threads;
    if (
      !firstThread ||
      typeof firstThread !== 'object' ||
      !firstThread.stringArray
    ) {
      // Could not find a thread that contains a stringArray, which means this is
      // most likely a Gecko Profile.
      return null;
    }
  }

  const profileVersion =
    typeof meta.preprocessedProfileVersion === 'number'
      ? meta.preprocessedProfileVersion
      : UNANNOTATED_VERSION;

  if (profileVersion === PROCESSED_PROFILE_VERSION) {
    return profile;
  }

  if (profileVersion > PROCESSED_PROFILE_VERSION) {
    throw new Error(
      `Unable to parse a processed profile of version ${profileVersion}, most likely profiler.firefox.com needs to be refreshed. ` +
        `The most recent version understood by this version of profiler.firefox.com is version ${PROCESSED_PROFILE_VERSION}.\n` +
        'You can try refreshing this page in case profiler.firefox.com has updated in the meantime.'
    );
  }

  // Convert to PROCESSED_PROFILE_VERSION, one step at a time.
  for (
    let destVersion = profileVersion + 1;
    destVersion <= PROCESSED_PROFILE_VERSION;
    destVersion++
  ) {
    if (destVersion in _upgraders) {
      _upgraders[destVersion](profile);
    }
  }

  const upgradedProfile = profile as Profile;
  upgradedProfile.meta.preprocessedProfileVersion = PROCESSED_PROFILE_VERSION;

  return upgradedProfile;
}

function _archFromAbi(abi: string): string {
  if (abi === 'x86_64-gcc3') {
    return 'x86_64';
  }
  return abi;
}

function _getRealScriptURI(url: string): string {
  if (url) {
    const urls = url.split(' -> ');
    return urls[urls.length - 1];
  }
  return url;
}

function _mutateProfileToEnsureCauseBacktraces(profile: any) {
  for (const thread of profile.threads) {
    for (let i = 0; i < thread.markers.length; i++) {
      const marker = thread.markers.data[i];
      const adjustTimestampBy =
        thread.processType === 'default' ? 0 : thread.processStartupTime;
      if (marker) {
        if (
          'stack' in marker &&
          marker.stack &&
          marker.stack.samples.data.length > 0
        ) {
          const syncProfile = marker.stack;
          const stackIndex =
            syncProfile.samples.data[0][syncProfile.samples.schema.stack];
          const timeRelativeToProcess =
            syncProfile.samples.data[0][syncProfile.samples.schema.time];
          if (stackIndex !== null) {
            marker.cause = {
              time: timeRelativeToProcess + adjustTimestampBy,
              stack: stackIndex,
            };
          }
        }
        delete marker.stack;
      }
    }
  }
}

/**
 * Guess the marker categories for a profile.
 */
function _guessMarkerCategories(profile: any) {
  // [key, categoryName]
  const keyToCategoryName = [
    ['DOMEvent', 'DOM'],
    ['Navigation::DOMComplete', 'DOM'],
    ['Navigation::DOMInteractive', 'DOM'],
    ['Navigation::Start', 'DOM'],
    ['UserTiming', 'DOM'],

    ['CC', 'GC / CC'],
    ['GCMajor', 'GC / CC'],
    ['GCMinor', 'GC / CC'],
    ['GCSlice', 'GC / CC'],

    ['Paint', 'Graphics'],
    ['VsyncTimestamp', 'Graphics'],
    ['CompositorScreenshot', 'Graphics'],

    ['JS allocation', 'JavaScript'],

    ['Styles', 'Layout'],
    ['nsRefreshDriver::Tick waiting for paint', 'Layout'],

    ['Navigation', 'Network'],
    ['Network', 'Network'],

    // Explicitly 'Other'
    ['firstLoadURI', 'Other'],
    ['IPC', 'Other'],
    ['Text', 'Other'],
    ['MainThreadLongTask', 'Other'],
    ['FileIO', 'Other'],
    ['Log', 'Other'],
    ['PreferenceRead', 'Other'],
    ['BHR-detected hang', 'Other'],
    ['MainThreadLongTask', 'Other'],
  ];

  // Make sure the default categories are present since we may want to refer them.
  for (const defaultCategory of [
    { name: 'Idle', color: 'transparent', subcategories: ['Other'] },
    { name: 'Other', color: 'grey', subcategories: ['Other'] },
    { name: 'Layout', color: 'purple', subcategories: ['Other'] },
    { name: 'JavaScript', color: 'yellow', subcategories: ['Other'] },
    { name: 'GC / CC', color: 'orange', subcategories: ['Other'] },
    { name: 'Network', color: 'lightblue', subcategories: ['Other'] },
    { name: 'Graphics', color: 'green', subcategories: ['Other'] },
    { name: 'DOM', color: 'blue', subcategories: ['Other'] },
  ]) {
    const index = profile.meta.categories.findIndex(
      (category: any) => category.name === defaultCategory.name
    );
    if (index === -1) {
      // Add on any unknown categories.
      profile.meta.categories.push(defaultCategory);
    }
  }

  const otherCategory = profile.meta.categories.findIndex(
    (category: any) => category.name === 'Other'
  );

  const keyToCategoryIndex: Map<string, number> = new Map(
    keyToCategoryName.map(([key, categoryName]) => {
      const index = profile.meta.categories.findIndex(
        (category: any) => category.name === categoryName
      );
      if (index === -1) {
        throw new Error('Could not find a category index to map to.');
      }
      return [key, index];
    })
  );

  for (const thread of profile.threads) {
    const { markers, stringArray } = thread;
    if (!markers.category) {
      // Only create the category if it's needed.
      markers.category = [];
    }
    for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      if (typeof markers.category[markerIndex] === 'number') {
        // This marker already has a category, skip it.
        break;
      }
      const nameIndex = markers.name[markerIndex];
      const data = markers.data[markerIndex];

      let key: string = stringArray[nameIndex];
      if (data && data.type) {
        key = data.type === 'tracing' ? data.category : data.type;
      }
      let categoryIndex = keyToCategoryIndex.get(key);
      if (categoryIndex === undefined) {
        categoryIndex = otherCategory;
      }

      markers.category[markerIndex] = categoryIndex;
    }
  }
}

type ProcessedProfileUpgrader = (profile: any) => void;

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the profile as its single argument and mutates it.
/* eslint-disable no-useless-computed-key */
const _upgraders: {
  [key: number]: ProcessedProfileUpgrader;
} = {
  [1]: (profile: any) => {
    // Starting with version 1, markers are sorted.
    timeCode('sorting thread markers', () => {
      for (const thread of profile.threads) {
        sortDataTable<number>(
          thread.markers,
          thread.markers.time,
          (a, b) => a - b
        );
      }
    });

    // And threads have proper names and processType fields.
    for (const thread of profile.threads) {
      if (!('processType' in thread)) {
        if (thread.name === 'Content') {
          thread.processType = 'tab';
          thread.name = 'GeckoMain';
        } else if (thread.name === 'Plugin') {
          thread.processType = 'plugin';
        } else {
          thread.processType = 'default';
        }
      }
    }
  },
  [2]: (profile: any) => {
    // pdbName -> debugName, add arch
    for (const thread of profile.threads) {
      for (const lib of thread.libs) {
        if (!('debugName' in lib)) {
          lib.debugName = lib.pdbName;
          lib.path = lib.name;
          lib.name = lib.debugName.endsWith('.pdb')
            ? lib.debugName.substr(0, lib.debugName.length - 4)
            : lib.debugName;
          lib.arch = _archFromAbi(profile.meta.abi);
          delete lib.pdbName;
          delete lib.pdbAge;
          delete lib.pdbSignature;
        }
      }
    }
  },
  [3]: (profile: any) => {
    // Make sure every lib has a debugPath property. We can't infer this
    // value from the other properties on the lib so we just set it to the
    // empty string.
    for (const thread of profile.threads) {
      for (const lib of thread.libs) {
        lib.debugPath = lib.debugPath || '';
      }
    }
  },
  [4]: (profile: any) => {
    profile.threads.forEach((thread: any) => {
      const { funcTable, stringArray, resourceTable } = thread;
      const stringTable = StringTable.withBackingArray(stringArray);

      // resourceTable gains a new field ("host") and a new resourceType:
      // "webhost". Resources from http and https URLs are now grouped by
      // origin (protocol + host) into one webhost resource, instead of being
      // separate per-URL resources.
      // That means that multiple old resources can collapse into one new
      // resource. We need to keep track of such collapsing (using the
      // oldResourceToNewResourceMap) and then execute apply the changes to
      // the resource pointers in the funcTable.
      const newResourceTable: {
        length: number;
        type: number[];
        name: number[];
        lib: number[];
        icon: number[];
        addonId: number[];
        host: number[];
      } = {
        length: 0,
        type: [],
        name: [],
        lib: [],
        icon: [],
        addonId: [],
        host: [],
      };
      function addLibResource(name: number, lib: number) {
        const index = newResourceTable.length++;
        newResourceTable.type[index] = resourceTypes.library;
        newResourceTable.name[index] = name;
        newResourceTable.lib[index] = lib;
      }
      function addWebhostResource(origin: number, host: number) {
        const index = newResourceTable.length++;
        newResourceTable.type[index] = resourceTypes.webhost;
        newResourceTable.name[index] = origin;
        newResourceTable.host[index] = host;
      }
      function addUrlResource(url: number) {
        const index = newResourceTable.length++;
        newResourceTable.type[index] = resourceTypes.url;
        newResourceTable.name[index] = url;
      }
      const oldResourceToNewResourceMap = new Map();
      const originToResourceIndex = new Map();
      for (
        let resourceIndex = 0;
        resourceIndex < resourceTable.length;
        resourceIndex++
      ) {
        if (resourceTable.type[resourceIndex] === resourceTypes.library) {
          oldResourceToNewResourceMap.set(
            resourceIndex,
            newResourceTable.length
          );
          addLibResource(
            resourceTable.name[resourceIndex],
            resourceTable.lib[resourceIndex]
          );
        } else if (resourceTable.type[resourceIndex] === resourceTypes.url) {
          const scriptURI = stringTable.getString(
            resourceTable.name[resourceIndex]
          );
          let newResourceIndex = null;
          let origin, host;
          try {
            const url = new URL(scriptURI);
            if (!(url.protocol === 'http:' || url.protocol === 'https:')) {
              throw new Error('not a webhost protocol');
            }
            origin = url.origin;
            host = url.host;
          } catch (e) {
            origin = scriptURI;
            host = null;
          }
          if (originToResourceIndex.has(origin)) {
            newResourceIndex = originToResourceIndex.get(origin);
          } else {
            newResourceIndex = newResourceTable.length;
            originToResourceIndex.set(origin, newResourceIndex);
            const originStringIndex = stringTable.indexForString(origin);
            if (host) {
              const hostIndex = stringTable.indexForString(host);
              addWebhostResource(originStringIndex, hostIndex);
            } else {
              const urlStringIndex = stringTable.indexForString(scriptURI);
              addUrlResource(urlStringIndex);
            }
          }
          oldResourceToNewResourceMap.set(resourceIndex, newResourceIndex);
        }
      }

      // funcTable gains two new fields: fileName and lineNumber. For C++ and
      // pseudo stack funcs, these fields are null. For JS funcs, they contain
      // the URL and the line number of the JS function.
      funcTable.fileName = [];
      funcTable.lineNumber = [];
      for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
        const oldResourceIndex = funcTable.resource[funcIndex];
        if (oldResourceToNewResourceMap.has(oldResourceIndex)) {
          funcTable.resource[funcIndex] =
            oldResourceToNewResourceMap.get(oldResourceIndex);
        }
        let fileName = null;
        let lineNumber = null;
        if (funcTable.isJS[funcIndex]) {
          const funcName = stringTable.getString(funcTable.name[funcIndex]);
          const match =
            /^(.*) \((.*):([0-9]+)\)$/.exec(funcName) ||
            /^()(.*):([0-9]+)$/.exec(funcName);
          if (match) {
            const scriptURI = _getRealScriptURI(match[2]);
            if (match[1]) {
              funcTable.name[funcIndex] = stringTable.indexForString(match[1]);
            } else {
              funcTable.name[funcIndex] = stringTable.indexForString(scriptURI);
            }
            fileName = stringTable.indexForString(scriptURI);
            lineNumber = Number(match[3]) | 0;
          }
        }
        funcTable.fileName[funcIndex] = fileName;
        funcTable.lineNumber[funcIndex] = lineNumber;
      }

      thread.resourceTable = newResourceTable;
    });
  },
  [5]: (profile: any) => {
    // The "frameNumber" column was removed from the samples table.
    for (const thread of profile.threads) {
      delete thread.samples.frameNumber;
    }
  },
  [6]: (profile: any) => {
    // The type field for DOMEventMarkerPayload was renamed to eventType.
    for (const thread of profile.threads) {
      const { stringArray, markers } = thread;
      const newDataArray = [];
      for (let i = 0; i < markers.length; i++) {
        const name = stringArray[markers.name[i]];
        const data = markers.data[i];
        if (name === 'DOMEvent') {
          newDataArray[i] = {
            type: 'DOMEvent',
            startTime: data.startTime,
            endTime: data.endTime,
            eventType: data.type,
            phase: data.phase,
          };
        } else {
          newDataArray[i] = data;
        }
      }
      thread.markers.data = newDataArray;
    }
  },
  [7]: (profile: any) => {
    // Each thread has the following new attributes:
    //  - processShutdownTime: null if the process is still running, otherwise
    //    the shutdown time of the process in milliseconds relative to
    //    meta.startTime
    //  - pausedRanges: an array of
    //    { startTime: number | null, endTime: number | null, reason: string }
    //  - registerTime: The time this thread was registered with the profiler,
    //    in milliseconds since meta.startTime
    //  - unregisterTime: The time this thread was unregistered from the
    //    profiler, in milliseconds since meta.startTime, or null
    // We can't invent missing data, so just initialize everything with some
    // kind of empty value.
    for (const thread of profile.threads) {
      // "The profiler was never paused during the recorded range, and we never
      // collected a profile."
      thread.pausedRanges = [];
      // "All processes started at the same time."
      thread.processStartupTime = 0;
      // "All processes were still alive by the time the profile was captured."
      thread.processShutdownTime = null;
      // "All threads were registered instantly at process startup."
      thread.registerTime = 0;
      // "All threads were still alive by the time the profile was captured."
      thread.unregisterTime = null;
    }
  },
  [8]: (profile: any) => {
    // DOMEventMarkerPayload.timeStamp in content process should be in
    // milliseconds relative to meta.startTime.  Adjust it by adding
    // the thread.processStartupTime which is the delta to
    // meta.startTime.
    // Only the timeStamp property is updated because it's new and
    // profiler.firefox.com wasn't updated to handle it when it appeared in
    // Firefox.
    for (const thread of profile.threads) {
      if (thread.processType === 'default') {
        continue;
      }
      const { stringArray, markers } = thread;
      const newDataArray = [];
      for (let i = 0; i < markers.length; i++) {
        const name = stringArray[markers.name[i]];
        const data = markers.data[i];
        if (name === 'DOMEvent' && data.timeStamp) {
          newDataArray[i] = {
            type: 'DOMEvent',
            startTime: data.startTime,
            endTime: data.endTime,
            timeStamp: data.timeStamp + thread.processStartupTime,
            eventType: data.eventType,
            phase: data.phase,
          };
        } else {
          newDataArray[i] = data;
        }
      }
      thread.markers.data = newDataArray;
    }
  },
  [9]: (profile: any) => {
    // Upgrade the GC markers

    /*
     * Upgrade a GCMajor marker in the Gecko profile format.
     */
    function upgradeGCMajorMarker_Gecko8To9(marker: any) {
      if ('timings' in marker) {
        if (!('status' in marker.timings)) {
          /*
           * This is the old version of the GCMajor marker.
           */

          const timings = marker.timings;

          timings.status = 'completed';

          /*
           * The old version had a bug where the slices field could be included
           * twice with different meanings.  So we attempt to read it as either
           * the number of slices or a list of slices.
           */
          if (Array.isArray(timings.sices)) {
            timings.slices_list = timings.slices;
            timings.slices = timings.slices.length;
          }

          timings.allocated_bytes = timings.allocated * 1024 * 1024;
        }
      }

      return marker;
    }

    function upgradeGCMajorMarker_Processed8to9(marker8: any) {
      // The Processed 8-to-9 upgrade is a superset of the gecko 8-to-9 upgrade.
      const marker9 = upgradeGCMajorMarker_Gecko8To9(marker8);
      const mt = marker9.timings;
      switch (mt.status) {
        case 'completed': {
          const { totals, ...partialMt } = mt;
          const timings = {
            ...partialMt,
            phase_times: convertPhaseTimes(totals),
            mmu_20ms: mt.mmu_20ms / 100,
            mmu_50ms: mt.mmu_50ms / 100,
          };
          return {
            type: 'GCMajor',
            startTime: marker9.startTime,
            endTime: marker9.endTime,
            timings: timings,
          };
        }
        case 'aborted': {
          return {
            type: 'GCMajor',
            startTime: marker9.startTime,
            endTime: marker9.endTime,
            timings: { status: 'aborted' },
          };
        }
        default:
          console.log('Unknown GCMajor status');
          throw new Error('Unknown GCMajor status');
      }
    }

    function upgradeGCMinorMarker(marker8: any) {
      if ('nursery' in marker8) {
        if ('status' in marker8.nursery) {
          if (marker8.nursery.status === 'no collection') {
            marker8.nursery.status = 'nursery empty';
          }
          return Object.assign(marker8);
        }
        /*
         * This is the old format for GCMinor, rename some
         * properties to the more sensible names in the newer
         * format and set the status.
         *
         * Note that we don't delete certain properties such as
         * promotion_rate, leave them so that anyone opening the
         * raw json data can still see them in converted profiles.
         */
        const marker = Object.assign(marker8, {
          nursery: Object.assign(marker8.nursery, {
            status: 'complete',
            bytes_used: marker8.nursery.nursery_bytes,
            // cur_capacity cannot be filled in.
            new_capacity: marker8.nursery.new_nursery_bytes,
            phase_times: marker8.nursery.timings,
          }),
        });
        delete marker.nursery.nursery_bytes;
        delete marker.nursery.new_nursery_bytes;
        delete marker.nursery.timings;
        return marker;
      }
      return marker8;
    }

    function convertPhaseTimes(old_phases: Record<string, number>) {
      const phases: Record<string, number> = {};
      for (const phase in old_phases) {
        phases[phase] = old_phases[phase] * 1000;
      }
      return phases;
    }

    for (const thread of profile.threads) {
      for (let i = 0; i < thread.markers.length; i++) {
        let marker = thread.markers.data[i];
        if (marker) {
          switch (marker.type) {
            case 'GCMinor':
              marker = upgradeGCMinorMarker(marker);
              break;
            case 'GCSlice':
              if (marker.timings && marker.timings.times) {
                marker.timings.phase_times = convertPhaseTimes(
                  marker.timings.times
                );
                delete marker.timings.times;
              }
              break;
            case 'GCMajor':
              marker = upgradeGCMajorMarker_Processed8to9(marker);
              break;
            default:
              break;
          }
          thread.markers.data[i] = marker;
        }
      }
    }
  },
  [10]: (profile: any) => {
    // Cause backtraces
    // Styles and reflow tracing markers supply call stacks that were captured
    // at the time that style or layout was invalidated. In version 9, this
    // call stack was embedded as a "syncProfile", which is essentially its own
    // small thread with an empty markers list and a samples list that only
    // contains one sample.
    // Starting with version 10, this is replaced with the CauseBacktrace type
    // which just has a "time" and a "stack" field, where the stack field is
    // a simple number, the stack index.
    _mutateProfileToEnsureCauseBacktraces(profile);
  },
  [11]: (profile: any) => {
    // Removed the startTime and endTime from DOMEventMarkerPayload and
    // made it a tracing marker instead. DOMEventMarkerPayload is no longer a
    // single marker, it requires a start and an end marker. Therefore, we have
    // to change the old DOMEvent marker and also create an end marker for each
    // DOMEvent.
    for (const thread of profile.threads) {
      const { stringArray, markers } = thread;
      if (markers.length === 0) {
        continue;
      }

      const extraMarkers = [];
      for (let i = 0; i < markers.length; i++) {
        const name = stringArray[markers.name[i]];
        const data = markers.data[i];
        if (name === 'DOMEvent') {
          markers.data[i] = {
            type: 'tracing',
            category: 'DOMEvent',
            timeStamp: data.timeStamp,
            interval: 'start',
            eventType: data.eventType,
            phase: data.phase,
          };

          extraMarkers.push({
            data: {
              type: 'tracing',
              category: 'DOMEvent',
              timeStamp: data.timeStamp,
              interval: 'end',
              eventType: data.eventType,
              phase: data.phase,
            },
            time: data.endTime,
            name: markers.name[i],
          });
        }
      }

      if (extraMarkers.length > 0) {
        extraMarkers.sort((a, b) => a.time - b.time);

        // Create a new markers table that includes both the old markers and
        // the markers from extraMarkers, sorted by time.
        const newMarkers: {
          length: number;
          name: number[];
          time: number[];
          data: Array<unknown | null>;
        } = {
          length: 0,
          name: [],
          time: [],
          data: [],
        };

        // We compute the new markers list by doing one forward pass. Both the
        // old markers (stored in |markers|) and the extra markers are already
        // sorted by time.

        let nextOldMarkerIndex = 0;
        let nextOldMarkerTime = markers.time[0];
        let nextExtraMarkerIndex = 0;
        let nextExtraMarkerTime = extraMarkers[0].time;
        while (
          nextOldMarkerIndex < markers.length ||
          nextExtraMarkerIndex < extraMarkers.length
        ) {
          // Pick the next marker based on its timestamp.
          if (nextOldMarkerTime <= nextExtraMarkerTime) {
            newMarkers.name.push(markers.name[nextOldMarkerIndex]);
            newMarkers.time.push(markers.time[nextOldMarkerIndex]);
            newMarkers.data.push(markers.data[nextOldMarkerIndex]);
            newMarkers.length++;
            nextOldMarkerIndex++;
            nextOldMarkerTime =
              nextOldMarkerIndex < markers.length
                ? markers.time[nextOldMarkerIndex]
                : Infinity;
          } else {
            newMarkers.name.push(extraMarkers[nextExtraMarkerIndex].name);
            newMarkers.time.push(extraMarkers[nextExtraMarkerIndex].time);
            newMarkers.data.push(extraMarkers[nextExtraMarkerIndex].data);
            newMarkers.length++;
            nextExtraMarkerIndex++;
            nextExtraMarkerTime =
              nextExtraMarkerIndex < extraMarkers.length
                ? extraMarkers[nextExtraMarkerIndex].time
                : Infinity;
          }
        }

        thread.markers = newMarkers;
      }
    }
  },
  [12]: (profile: any) => {
    // profile.meta has a new property called "categories", which contains a
    // list of categories, which are objects with "name" and "color" properties.
    // The "category" column in the frameTable now refers to elements in this
    // list.
    //
    // Old category list:
    // https://searchfox.org/mozilla-central/rev/5a744713370ec47969595e369fd5125f123e6d24/js/public/ProfilingStack.h#193-201
    // New category list:
    // https://searchfox.org/mozilla-central/rev/04b9cbbc2be2137a37e158a5ebaf9c7bef2364f9/js/public/ProfilingStack.h#193-200
    //
    // In addition to adding the meta category values, this upgrader attempts to deduce
    // a frame's category from a set of known function names. This helps the UI visualize
    // category-only views when that information is completely lacking. This is a
    // "best guess" approach, that may not get the information completely correct.
    // This list can safely be updated in the future, if needed, to help better refine
    // the categories.
    profile.meta.categories = [
      {
        name: 'Idle',
        color: 'transparent',
      },
      {
        name: 'Other',
        color: 'grey',
      },
      {
        name: 'JavaScript',
        color: 'yellow',
      },
      {
        name: 'Layout',
        color: 'purple',
      },
      {
        name: 'Graphics',
        color: 'green',
      },
      {
        name: 'DOM',
        color: 'blue',
      },
      {
        name: 'GC / CC',
        color: 'orange',
      },
      {
        name: 'Network',
        color: 'lightblue',
      },
    ];
    const IDLE = 0;
    const OTHER = 1;
    const JS = 2;
    const LAYOUT = 3;
    const GRAPHICS = 4;
    const DOM = 5;
    const GCCC = 6;
    const NETWORK = 7;
    const oldCategoryToNewCategory = {
      [1 << 4 /* OTHER */]: OTHER,
      [1 << 5 /* CSS */]: LAYOUT,
      [1 << 6 /* JS */]: JS,
      [1 << 7 /* GC */]: GCCC,
      [1 << 8 /* CC */]: GCCC,
      [1 << 9 /* NETWORK */]: NETWORK,
      [1 << 10 /* GRAPHICS */]: GRAPHICS,
      [1 << 11 /* STORAGE */]: OTHER,
      [1 << 12 /* EVENTS */]: OTHER,
    };
    // This is the list of function names that are used to map to categories.
    const exactMatches = new Map([
      [
        '-[GeckoNSApplication nextEventMatchingMask:untilDate:inMode:dequeue:]',
        IDLE,
      ],
      ['base::MessagePumpDefault::Run(base::MessagePump::Delegate*)', IDLE],
      ['mozilla::widget::WinUtils::WaitForMessage(unsigned long)', IDLE],
      [
        'mozilla::ThreadEventQueue<mozilla::PrioritizedEventQueue<mozilla::LabeledEventQueue> >::GetEvent(bool,mozilla::EventPriority *)',
        IDLE,
      ],
      [
        'mozilla::ThreadEventQueue<mozilla::PrioritizedEventQueue<mozilla::EventQueue> >::GetEvent(bool,mozilla::EventPriority *)',
        IDLE,
      ],
      [
        'mozilla::ThreadEventQueue<mozilla::EventQueue>::GetEvent(bool,mozilla::EventPriority *)',
        IDLE,
      ],
      [
        'mozilla::layers::PaintThread::AsyncPaintContents(mozilla::layers::CompositorBridgeChild *,mozilla::layers::CapturedPaintState *,bool (*)(mozilla::layers::CapturedPaintState *))',
        GRAPHICS,
      ],
      ['PresShell::DoFlushPendingNotifications InterruptibleLayout', LAYOUT],
      ['nsRefreshDriver::Tick', LAYOUT],
      ['nsLayoutUtils::GetFrameForPoint', LAYOUT],
      ['nsAppShell::ProcessGeckoEvents', OTHER],
      ['PollWrapper(_GPollFD*, unsigned int, int)', IDLE],
      ['mozilla::image::DecodePoolImpl::PopWorkLocked(bool)', IDLE],
      [
        'nsCCUncollectableMarker::Observe(nsISupports*, char const*, char16_t const*)',
        GCCC,
      ],
      ['g_main_context_dispatch', OTHER],
      ['Events::ProcessGeckoEvents', OTHER],
      ['widget::ChildView::drawUsingOpenGL', OTHER],
      ['nsContentSink::StartLayout(bool)', LAYOUT],
      ['Paint::PresShell::Paint', GRAPHICS],
      ['JS::EvaluateString', JS],
      ['js::RunScript', JS],
    ]);

    const upToFirstSpaceMatches = new Map([
      ['PresShell::DoFlushPendingNotifications', LAYOUT],
      ['PresShell::DoReflow', LAYOUT],
      ['layout::DoReflow', LAYOUT],
      ['JS::Compile', JS],
    ]);

    function truncateAtFirstSpace(s: string): string {
      const spacePos = s.indexOf(' ');
      return spacePos === -1 ? s : s.substr(0, spacePos);
    }

    function getCategoryForFuncName(funcName: string): number | void {
      const exactMatch = exactMatches.get(funcName);
      if (exactMatch !== undefined) {
        return exactMatch;
      }

      const truncatedMatch = upToFirstSpaceMatches.get(
        truncateAtFirstSpace(funcName)
      );
      return truncatedMatch;
    }

    const domCallRegex = /^(get |set )?\w+(\.\w+| constructor)$/;

    // Go through all of the threads and their frames and attempt to deduce
    // the categories by looking at the function names.
    for (const thread of profile.threads) {
      const { frameTable, funcTable, stringArray } = thread;
      for (let i = 0; i < frameTable.length; i++) {
        const funcIndex = frameTable.func[i];
        const funcName = stringArray[funcTable.name[funcIndex]];
        const categoryBasedOnFuncName = getCategoryForFuncName(funcName);
        if (categoryBasedOnFuncName !== undefined) {
          frameTable.category[i] = categoryBasedOnFuncName;
        } else {
          const oldCategory = frameTable.category[i];
          if (oldCategory !== null) {
            if (!funcTable.isJS[funcIndex] && domCallRegex.test(funcName)) {
              frameTable.category[i] = DOM;
            } else {
              const newCategory =
                oldCategory in oldCategoryToNewCategory
                  ? oldCategoryToNewCategory[oldCategory]
                  : 1; /* Other */
              frameTable.category[i] = newCategory;
            }
          }
        }
      }
    }
  },
  [13]: (profile: any) => {
    // The stackTable has a new column called "category", which is computed
    // from the stack's frame's category, or if that is null, from the stack's
    // prefix's category. For root stacks whose frame doesn't have a category,
    // the category is set to the grey category (usually something like "Other").
    // The same algorithm is used in profile processing, when the processed
    // profile's category column is derived from the gecko profile (which does
    // not have a category column in its stack table).
    const { meta, threads } = profile;
    const defaultCategory = meta.categories.findIndex(
      (c: any) => c.color === 'grey'
    );

    for (const thread of threads) {
      const { stackTable, frameTable } = thread;
      stackTable.category = new Array(stackTable.length);
      for (let i = 0; i < stackTable.length; i++) {
        const frameIndex = stackTable.frame[i];
        const frameCategory = frameTable.category[frameIndex];
        if (frameCategory !== null) {
          stackTable.category[i] = frameCategory;
        } else {
          const prefix = stackTable.prefix[i];
          if (prefix !== null) {
            stackTable.category[i] = stackTable.category[prefix];
          } else {
            stackTable.category[i] = defaultCategory;
          }
        }
      }
    }
  },
  [14]: (profile: any) => {
    // Profiles are now required to have either a string or number pid. If the pid
    // is a string, then it is a generated name, if it is a number, it's the pid
    // generated by the system.
    const { threads } = profile;
    for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
      const thread = threads[threadIndex];
      if (thread.pid === null || thread.pid === undefined) {
        thread.pid = `Unknown Process ${threadIndex + 1}`;
      }
    }
  },
  [15]: (profile: any) => {
    // Profiles now have a column property in the frameTable
    for (const thread of profile.threads) {
      thread.frameTable.column = new Array(thread.frameTable.length);
      for (let i = 0; i < thread.frameTable.length; i++) {
        thread.frameTable.column[i] = null;
      }
    }
  },
  [16]: (profile: any) => {
    // The type field on some markers were missing. Renamed category field of
    // VsyncTimestamp and LayerTranslation marker payloads to type and added
    // a type field to Screenshot marker payload.
    // In addition to that, we removed the `vsync` field from VsyncTimestamp
    // since we don't use that field and have a timestamp for them already.
    // Old profiles might still have this property.
    for (const thread of profile.threads) {
      const { stringArray, markers } = thread;
      const newDataArray = [];
      for (let i = 0; i < markers.length; i++) {
        const name = stringArray[markers.name[i]];
        const data = markers.data[i];
        switch (name) {
          case 'VsyncTimestamp':
            newDataArray[i] = {
              type: 'VsyncTimestamp',
              vsync: data.vsync,
            };
            break;
          case 'LayerTranslation':
            newDataArray[i] = {
              type: 'LayerTranslation',
              layer: data.layer,
              x: data.x,
              y: data.y,
            };
            break;
          case 'CompositorScreenshot':
            newDataArray[i] = {
              type: 'CompositorScreenshot',
              url: data.url,
              windowID: data.windowID,
              windowWidth: data.windowWidth,
              windowHeight: data.windowHeight,
            };
            break;
          default:
            newDataArray[i] = data;
            break;
        }
      }
      thread.markers.data = newDataArray;
    }
  },
  [17]: (profile: any) => {
    // Profiles now have a relevantForJS property in the funcTable.
    // This column is false on C++ and JS frames, and true on label frames that
    // are entry and exit points to JS.
    // The upgrader below tries to detect existing JS entry and exit points
    // based on the string name of the label frame.
    // Existing entry points in old profiles are label frames with the string
    // "AutoEntryScript <some entry reason>"
    // and existing exit points in old profiles are label frames for WebIDL
    // APIs, which have one of four forms: constructor, method, getter or setter.
    // Examples:
    // StructuredCloneHolder constructor
    // Node.appendChild
    // get Element.scrollTop
    // set CSS2Properties.height
    const domCallRegex = /^(get |set )?\w+(\.\w+| constructor)$/;
    for (const thread of profile.threads) {
      const { funcTable, stringArray } = thread;
      const stringTable = StringTable.withBackingArray(stringArray);
      funcTable.relevantForJS = new Array(funcTable.length);
      for (let i = 0; i < funcTable.length; i++) {
        const location = stringTable.getString(funcTable.name[i]);
        if (location.startsWith('AutoEntryScript ')) {
          funcTable.name[i] = stringTable.indexForString(
            location.substring('AutoEntryScript '.length)
          );
          funcTable.relevantForJS[i] = true;
        } else {
          funcTable.relevantForJS[i] = domCallRegex.test(location);
        }
      }
    }
  },
  [18]: (profile: any) => {
    // When we added column numbers we forgot to update the func table.
    // As a result, when we had a column number for an entry, the line number
    // ended up in the `fileName` property, and the column number in the
    // `lineNumber` property.
    // We update the func table with right values of 'fileName', 'lineNumber' and 'columnNumber'.
    for (const thread of profile.threads) {
      const { funcTable, stringArray } = thread;
      const stringTable = StringTable.withBackingArray(stringArray);
      funcTable.columnNumber = [];
      for (
        let funcIndex = 0;
        funcIndex < thread.funcTable.length;
        funcIndex++
      ) {
        funcTable.columnNumber[funcIndex] = null;
        if (funcTable.isJS[funcIndex]) {
          const fileNameIndex = funcTable.fileName[funcIndex];
          if (fileNameIndex !== null) {
            const fileName = stringTable.getString(fileNameIndex);
            const match = /^(.*):([0-9]+)$/.exec(fileName);
            if (match) {
              // If this regexp matches, this means that this is a lineNumber, and that the
              // value in `lineNumber` is actually the column number.
              funcTable.columnNumber[funcIndex] =
                funcTable.lineNumber[funcIndex];
              funcTable.fileName[funcIndex] = stringTable.indexForString(
                match[1]
              );
              funcTable.lineNumber[funcIndex] = parseInt(match[2], 10);
            }
          }
        }
      }
    }
  },
  [19]: (profile: any) => {
    // When we added timing information to network markers, we forgot to shift
    // timestamps from subprocesses during profile processing. This upgrade
    // fixes that.
    for (const thread of profile.threads) {
      const markers = thread.markers;
      const delta = thread.processStartupTime;
      for (
        let markerIndex = 0;
        markerIndex < thread.markers.length;
        markerIndex++
      ) {
        const data = markers.data[markerIndex];
        if (data && 'type' in data && data.type === 'Network') {
          if (data.domainLookupStart) {
            data.domainLookupStart += delta;
          }
          if (data.domainLookupEnd) {
            data.domainLookupEnd += delta;
          }
          if (data.connectStart) {
            data.connectStart += delta;
          }
          if (data.tcpConnectEnd) {
            data.tcpConnectEnd += delta;
          }
          if (data.secureConnectionStart) {
            data.secureConnectionStart += delta;
          }
          if (data.connectEnd) {
            data.connectEnd += delta;
          }
          if (data.requestStart) {
            data.requestStart += delta;
          }
          if (data.responseStart) {
            data.responseStart += delta;
          }
          if (data.responseEnd) {
            data.responseEnd += delta;
          }
        }
      }
    }
  },
  [20]: (_profile: any) => {
    // rss and uss was removed from the SamplesTable. The version number was bumped
    // to help catch errors of using an outdated version of profiler.firefox.com with a newer
    // profile. There's no good reason to remove the values for upgrading profiles though.
  },
  [21]: (profile: any) => {
    // Before version 21, during the profile processing step, only certain markers had
    // their stacks converted to causes. However, in version 10, an upgrader was written
    // that would convert every single marker's stack to a cause. This created two types
    // of profiles:
    //
    //   1. Before version 10 - Profiles with causes added for every marker.
    //   2. After version 10 - Profiles that would only have causes for certain markers.
    //
    // The profile processing was changed in version 21 to include the cause for all
    // markers. This upgrader upgrades profiles from case 2 above.
    _mutateProfileToEnsureCauseBacktraces(profile);
  },
  [22]: (profile: any) => {
    // FileIO was originally called DiskIO. This profile upgrade performs the rename.
    for (const thread of profile.threads) {
      const { stringArray } = thread;
      const stringTable = StringTable.withBackingArray(stringArray);
      if (!stringTable.hasString('DiskIO')) {
        // There are no DiskIO markers.
        continue;
      }
      const fileIoStringIndex = stringTable.indexForString('FileIO');
      for (let i = 0; i < thread.markers.length; i++) {
        const data = thread.markers.data[i];
        if (data && data.type === 'DiskIO') {
          data.type = 'FileIO';
          thread.markers.name[i] = fileIoStringIndex;
        }
      }
    }
  },
  [23]: (profile: any) => {
    // profile.meta.categories now has a subcategories property on each element,
    // with an array of subcategories for that category, with at least one
    // subcategory per category.
    // And the frameTable and stackTable have another column, subcategory, which
    // is non-null whenever the category column is non-null.
    for (const category of profile.meta.categories) {
      category.subcategories = ['Other'];
    }
    for (const thread of profile.threads) {
      const { frameTable, stackTable } = thread;
      frameTable.subcategory = frameTable.category.map((c: any) =>
        c === null ? null : 0
      );
      stackTable.subcategory = stackTable.category.map((c: any) =>
        c === null ? null : 0
      );
    }
  },
  [24]: (profile: any) => {
    // Markers now have a category field. For older profiles, guess the marker category.
    _guessMarkerCategories(profile);
  },
  [25]: (profile: any) => {
    // Previously, we had DocShell ID and DocShell History ID in the page object
    // to identify a specific page. We changed these IDs in the gecko side to
    // Browsing Context ID and Inner Window ID. Inner Window ID is enough to
    // identify a specific frame now. We were keeping two field in marker
    // payloads, but now we are only keeping innerWindowID. Browsing Context IDs
    // are necessary to identify which frame belongs to which tab. Browsing
    // Contexts doesn't change after a navigation.
    if (profile.pages && profile.pages.length > 0) {
      const oldKeysToNewKey: Map<string, number> = new Map();
      const docShellIDtoBrowsingContextID: Map<string, number> = new Map();
      let browsingContextID = 1;
      let innerWindowID = 1;

      for (const page of profile.pages) {
        // Constructing our old keys to new key map so we can use it for markers.
        oldKeysToNewKey.set(
          `d${page.docshellId}h${page.historyId}`,
          innerWindowID
        );

        // There are multiple pages with same DocShell IDs. We are checking to
        // see if we assigned a Browsing Context ID to that DocShell ID
        // before. Otherwise assigning one.
        let currentBrowsingContextID = docShellIDtoBrowsingContextID.get(
          page.docshellId
        );
        if (!currentBrowsingContextID) {
          currentBrowsingContextID = browsingContextID++;
          docShellIDtoBrowsingContextID.set(
            page.docshellId,
            currentBrowsingContextID
          );
        }

        // Putting DocShell ID to this field. It fully doesn't correspond to a
        // Browsing Context ID but that's the closest we have right now.
        page.browsingContextID = currentBrowsingContextID;
        // Putting a unique Inner Window ID to each page.
        page.innerWindowID = innerWindowID;
        // This information is new. We had isSubFrame field but that's not
        // useful for us to determine the embedders. Therefore setting older
        // pages to 0 which means null.
        page.embedderInnerWindowID = 0;

        innerWindowID++;
        delete page.docshellId;
        delete page.historyId;
        delete page.isSubFrame;
      }

      for (const thread of profile.threads) {
        const { markers } = thread;
        markers.data = markers.data.map((data: any) => {
          if (
            data &&
            data.docShellId !== undefined &&
            data.docshellHistoryId !== undefined
          ) {
            const newKey = oldKeysToNewKey.get(
              `d${data.docShellId}h${data.docshellHistoryId}`
            );
            if (newKey === undefined) {
              console.error(
                'No page found with given docShellId and historyId'
              );
            } else {
              // We don't need to add the browsingContextID here because we only
              // need innerWindowID since it's unique for each page.
              data.innerWindowID = newKey;
            }

            delete data.docShellId;
            delete data.docshellHistoryId;
          }
          return data;
        });
      }
    }
  },
  [26]: (profile: any) => {
    // Due to a bug in gecko side, we were keeping the sample_group inside an
    // object instead of an array. Usually there is only one sample group, that's
    // why it wasn't a problem before. To future proof it, we are fixing it by
    // moving it inside an array. See: https://bugzilla.mozilla.org/show_bug.cgi?id=1584190
    if (profile.counters && profile.counters.length > 0) {
      for (const counter of profile.counters) {
        counter.sampleGroups = [counter.sampleGroups];
      }
    }
  },
  [27]: (profile: any) => {
    // Profiles now have an innerWindowID property in the frameTable.
    // We are filling this array with 0 values because we have no idea what that value might be.
    for (const thread of profile.threads) {
      const { frameTable } = thread;
      frameTable.innerWindowID = new Array(frameTable.length).fill(0);
    }
  },
  [28]: (profile: any) => {
    // There was a bug where some markers got a null category during sanitization.
    for (const thread of profile.threads) {
      const { markers } = thread;
      if (markers.category[0] === null) {
        // This profile contains null markers, guess them here to fix it.
        _guessMarkerCategories(profile);
        return;
      }
    }
  },
  [29]: (profile: any) => {
    // The sample and allocation properties "duration" were changed to "weight"
    // The weight and weightType fields were made non-optional. The sample
    // "duration" field was used for diffing profiles.
    for (const thread of profile.threads) {
      if (thread.samples.duration) {
        thread.samples.weightType = 'samples';
        thread.samples.weight = thread.samples.duration;
        delete thread.samples.duration;
      }

      if (thread.nativeAllocations) {
        thread.nativeAllocations.weightType = 'bytes';
        thread.nativeAllocations.weight = thread.nativeAllocations.duration;
        delete thread.nativeAllocations.duration;
      }

      if (thread.jsAllocations) {
        thread.jsAllocations.weightType = 'bytes';
        thread.jsAllocations.weight = thread.jsAllocations.duration;
        delete thread.jsAllocations.duration;
      }

      if (!thread.samples.weight) {
        thread.samples.weight = null;
      }

      if (!thread.samples.weightType) {
        thread.samples.weightType = 'samples';
      }
    }
  },
  [30]: (profile: any) => {
    // The idea of phased markers was added to profiles, where the startTime and
    // endTime is always in the RawMarkerTable directly, not in the payload.
    //
    // It also removes the startTime and endTime from payloads, except for IPC and
    // Network markers.
    const INSTANT = 0;
    const INTERVAL = 1;
    const INTERVAL_START = 2;
    const INTERVAL_END = 3;

    type Payload = $Shape<{
      startTime: number;
      endTime: number;
      type: string;
      interval: string;
    }>;

    for (const { markers } of profile.threads) {
      // Set up the data, but with type information.
      const times: number[] = markers.time;
      const newStartTimes: Array<number | null> = [];
      const newEndTimes: Array<number | null> = [];
      const newPhases: Array<0 | 1 | 2 | 3> = [];

      // Mutate the markers with the new format.
      delete markers.time;
      markers.startTime = newStartTimes;
      markers.endTime = newEndTimes;
      markers.phase = newPhases;

      // Update the time information.
      for (let i = 0; i < markers.length; i++) {
        const data: Payload | null = markers.data[i];
        const time: number = times[i];

        // Start out by assuming it's an instant marker.
        let newStartTime: number | null = time;
        let newEndTime: number | null = null;
        let phase: 0 | 1 | 2 | 3 = INSTANT;

        // If there is a payload, it MAY change to an interval marker.
        if (data) {
          const { startTime, endTime, type, interval } = data;
          if (type === 'tracing') {
            if (interval === 'start') {
              newStartTime = time;
              newEndTime = null;
              phase = INTERVAL_START;
            } else {
              // OOOPS this `else` should have been `else if (interval == 'end')`,
              // because interval could be inexistant, and in that case this
              // should be an instant marker.
              // We're fixing this in the upgrader for v31.
              newStartTime = null;
              newEndTime = time;
              phase = INTERVAL_END;
            }
          } else if (
            // This could be considered an instant marker, if the startTime and
            // endTime are the same.
            startTime !== endTime &&
            typeof startTime === 'number' &&
            typeof endTime === 'number'
          ) {
            // This is some marker with both start and endTime markers.
            newStartTime = startTime;
            newEndTime = endTime;
            phase = INTERVAL;
          }

          if (data.type !== 'IPC' && data.type !== 'Network') {
            // These two properties were removed, except for in these two markers
            // as they are needed for special processing.
            delete data.startTime;
            delete data.endTime;
          }
        }

        newStartTimes.push(newStartTime);
        newEndTimes.push(newEndTime);
        newPhases.push(phase);
      }
    }
  },
  [31]: (profile: any) => {
    // The upgrader for 30 messed up markers with type "tracing" but that don't
    // have an interval. This upgrader fixes them.

    const INSTANT = 0;

    for (const { markers } of profile.threads) {
      for (let i = 0; i < markers.length; i++) {
        const data = markers.data[i];
        if (data) {
          const { type, interval } = data;
          if (type === 'tracing') {
            if (interval !== 'start' && interval !== 'end') {
              markers.phase[i] = INSTANT;
              markers.startTime[i] = markers.endTime[i];
              markers.endTime[i] = null;
            }
          }
        }
      }
    }
  },
  [32]: (profile: any) => {
    // Migrate DOMEvent markers to Markers 2.0

    // This is a fairly permissive type, but helps ensure the logic below is type checked.
    type DOMEventPayload31_to_32 = {
      // Tracing -> DOMEvent
      type: 'tracing' | 'DOMEvent';
      category: 'DOMEvent';
      eventType: string;
      // These are removed:
      timeStamp?: number;
      // This gets added:
      latency?: number;
    };

    // This is just the useful parts of the processed profile version 31.
    type ProfileV31 = {
      threads: Array<{
        markers: {
          data: any[];
          startTime: Array<number | null>;
          length: number;
        };
      }>;
      processes: ProfileV31[];
    };

    for (const { markers } of (profile as ProfileV31).threads) {
      for (let i = 0; i < markers.length; i++) {
        // This isn't particularly type-safe, we need to refine to this type.
        const data: DOMEventPayload31_to_32 = markers.data[i];
        if (data && data.type === 'tracing' && data.category === 'DOMEvent') {
          const startTime = markers.startTime[i];
          // Mutate the payload to limit GC.
          data.type = 'DOMEvent';
          if (data.timeStamp !== undefined && startTime !== null) {
            data.latency = startTime - data.timeStamp;
          }
          delete data.timeStamp;
        }
      }
    }
  },
  [33]: (profile: any) => {
    // The marker schema, which details how to display markers was added. Back-fill
    // any old profiles with a default schema.

    profile.meta.markerSchema = [
      {
        name: 'GCMajor',
        display: ['marker-chart', 'marker-table', 'timeline-memory'],
        data: [
          // Use custom handling
        ],
      },
      {
        name: 'GCMinor',
        display: ['marker-chart', 'marker-table', 'timeline-memory'],
        data: [
          // Use custom handling
        ],
      },
      {
        name: 'GCSlice',
        display: ['marker-chart', 'marker-table', 'timeline-memory'],
        data: [
          // Use custom handling
        ],
      },
      {
        name: 'CC',
        tooltipLabel: 'Cycle Collect',
        display: ['marker-chart', 'marker-table', 'timeline-memory'],
        data: [],
      },
      {
        name: 'FileIO',
        display: ['marker-chart', 'marker-table'],
        data: [
          {
            key: 'operation',
            label: 'Operation',
            format: 'string',
            searchable: true,
          },
          {
            key: 'source',
            label: 'Source',
            format: 'string',
            searchable: true,
          },
          {
            key: 'filename',
            label: 'Filename',
            format: 'file-path',
            searchable: true,
          },
        ],
      },
      {
        name: 'MediaSample',
        display: ['marker-chart', 'marker-table'],
        data: [
          {
            key: 'sampleStartTimeUs',
            label: 'Sample start time',
            format: 'microseconds',
          },
          {
            key: 'sampleEndTimeUs',
            label: 'Sample end time',
            format: 'microseconds',
          },
        ],
      },
      {
        name: 'Styles',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [
          {
            key: 'elementsTraversed',
            label: 'Elements traversed',
            format: 'integer',
          },
          {
            key: 'elementsStyled',
            label: 'Elements styled',
            format: 'integer',
          },
          {
            key: 'elementsMatched',
            label: 'Elements matched',
            format: 'integer',
          },
          { key: 'stylesShared', label: 'Styles shared', format: 'integer' },
          { key: 'stylesReused', label: 'Styles reused', format: 'integer' },
        ],
      },
      {
        name: 'PreferenceRead',
        display: ['marker-chart', 'marker-table'],
        data: [
          { key: 'prefName', label: 'Name', format: 'string' },
          { key: 'prefKind', label: 'Kind', format: 'string' },
          { key: 'prefType', label: 'Type', format: 'string' },
          { key: 'prefValue', label: 'Value', format: 'string' },
        ],
      },
      {
        name: 'UserTiming',
        tooltipLabel: '{marker.data.name}',
        chartLabel: '{marker.data.name}',
        tableLabel: '{marker.data.name}',
        display: ['marker-chart', 'marker-table'],
        data: [
          // name
          { label: 'Marker', value: 'UserTiming' },
          { key: 'entryType', label: 'Entry Type', format: 'string' },
          {
            label: 'Description',
            value:
              'UserTiming is created using the DOM APIs performance.mark() and performance.measure().',
          },
        ],
      },
      {
        name: 'Text',
        tableLabel: '{marker.name} — {marker.data.name}',
        chartLabel: '{marker.name} — {marker.data.name}',
        display: ['marker-chart', 'marker-table'],
        data: [{ key: 'name', label: 'Details', format: 'string' }],
      },
      {
        name: 'Log',
        display: ['marker-table'],
        tableLabel: '({marker.data.module}) {marker.data.name}',
        data: [
          { key: 'module', label: 'Module', format: 'string' },
          { key: 'name', label: 'Name', format: 'string' },
        ],
      },
      {
        name: 'DOMEvent',
        tooltipLabel: '{marker.data.eventType} — DOMEvent',
        tableLabel: '{marker.data.eventType}',
        chartLabel: '{marker.data.eventType}',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [
          { key: 'latency', label: 'Latency', format: 'duration' },
          // eventType is in the payload as well.
        ],
      },

      // The following three schemas should have just been a single schema named
      // "tracing". They are kept here for historical accuracy.
      // The upgrader for version 52 adds the missing "tracing" schema.
      {
        name: 'Paint',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [{ key: 'category', label: 'Type', format: 'string' }],
      },
      {
        name: 'Navigation',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [{ key: 'category', label: 'Type', format: 'string' }],
      },
      {
        name: 'Layout',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [{ key: 'category', label: 'Type', format: 'string' }],
      },

      {
        name: 'IPC',
        tooltipLabel: 'IPC — {marker.data.niceDirection}',
        tableLabel:
          '{marker.name} — {marker.data.messageType} — {marker.data.niceDirection}',
        chartLabel: '{marker.data.messageType}',
        display: ['marker-chart', 'marker-table', 'timeline-ipc'],
        data: [
          { key: 'messageType', label: 'Type', format: 'string' },
          { key: 'sync', label: 'Sync', format: 'string' },
          { key: 'sendThreadName', label: 'From', format: 'string' },
          { key: 'recvThreadName', label: 'To', format: 'string' },
        ],
      },
      {
        // An unused schema for RefreshDriverTick markers.
        // This schema is not consistent with what post-schema Firefox would
        // output. Firefox (as of Jan 2025) is still using Text markers and does
        // not have a RefreshDriverTick schema. Furthermore, upgraded profiles
        // which get this schema do not have any { type: 'RefreshDriverTick' }
        // markers - in the past they picked up this schema due to a compat hack,
        // but this hack is now removed. So this schema is unused. It is kept
        // here for historical accuracy.
        name: 'RefreshDriverTick',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [{ key: 'name', label: 'Tick Reasons', format: 'string' }],
      },
      {
        // The schema is mostly handled with custom logic.
        // Note that profiles coming from recent Gecko engines won't have this.
        // Having this here was a mistake when implementing the upgrader, but
        // now that it's here we keep it to reduce confusion.
        name: 'Network',
        display: ['marker-table'],
        data: [],
      },
    ];
  },
  [34]: (profile: any) => {
    // We were incrementing timestamps for marker' causes only for a few marker
    // types: 'tracing' and 'Styles'.
    // See https://github.com/firefox-devtools/profiler/issues/3030
    // We can also note that DOMEvents were converted from "tracing" to their
    // own types, but they don't have a "cause" so we don't need to look after
    // them. They were the only ones being converted so far, we're lucky.
    for (const thread of profile.threads) {
      const delta = thread.processStartupTime;
      const { markers } = thread;

      for (const data of markers.data) {
        if (
          data &&
          data.type !== 'tracing' &&
          data.type !== 'Styles' &&
          data.cause &&
          data.cause.time !== undefined
        ) {
          data.cause.time += delta;
        }
      }
    }
  },
  [35]: (profile: any) => {
    // The browsingContextID inside the pages array and activeBrowsingContextID
    // have been renamed to tabID and activeTabID.
    // Previously, we were using the browsingcontextID to figure out which tab
    // that page belongs to. But that had some shortcomings. For example it
    // wasn't workig correctly on cross-group navigations, because browsingContext
    // was being replaced during that. So, we had to get a better number to
    // indicate the tabIDs. With the back-end work, we are not getting the
    // browserId, which corresponds to ID of a tab directly. See the back-end
    // bug for more details: https://bugzilla.mozilla.org/show_bug.cgi?id=1698129
    if (
      profile.meta.configuration &&
      profile.meta.configuration.activeBrowsingContextID
    ) {
      profile.meta.configuration.activeTabID =
        profile.meta.configuration.activeBrowsingContextID;
      delete profile.meta.configuration.activeBrowsingContextID;
    }

    if (profile.pages && profile.pages.length > 0) {
      for (const page of profile.pages) {
        // Directly copy the value of browsingContextID to tabID.
        page.tabID = page.browsingContextID;
        delete page.browsingContextID;
      }
    }
  },
  [36]: (profile: any) => {
    // Threads now have a nativeSymbols table.
    // The frame table has a new field: nativeSymbol.
    // The function table loses one field: address. (This field moves to the nativeSymbols table.)
    // The NativeSymbolsTable has the fields libIndex, address, and name.
    for (const thread of profile.threads) {
      const nativeSymbols: {
        libIndex: number[];
        address: Array<number | null>;
        name: number[];
        length: number;
      } = {
        libIndex: [],
        address: [],
        name: [],
        length: 0,
      };
      const { frameTable, funcTable, resourceTable } = thread;
      const funcToNativeSymbolMap = new Map();
      // Find functions for native code, and create native symbols for them.
      // Functions for native code are identified by the fact that their
      // resource is a library. The func's address is the symbol address.
      for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
        const resourceIndex = funcTable.resource[funcIndex];
        if (resourceIndex === -1) {
          continue;
        }
        const resourceType = resourceTable.type[resourceIndex];
        if (resourceType !== resourceTypes.library) {
          continue;
        }
        const libIndex = resourceTable.lib[resourceIndex];
        if (libIndex === null || libIndex === undefined || libIndex === -1) {
          continue;
        }
        const address = funcTable.address[funcIndex];
        const nativeSymbolIndex = nativeSymbols.length;
        nativeSymbols.libIndex.push(libIndex);
        nativeSymbols.address.push(address === -1 ? null : address);
        nativeSymbols.name.push(funcTable.name[funcIndex]);
        nativeSymbols.length++;
        funcToNativeSymbolMap.set(funcIndex, nativeSymbolIndex);
      }
      delete funcTable.address;
      frameTable.nativeSymbol = frameTable.func.map(
        (f: number) => funcToNativeSymbolMap.get(f) ?? null
      );
      thread.nativeSymbols = nativeSymbols;
    }
  },
  [37]: (profile: any) => {
    // "Java Main Thread" has been renamed to "AndroidUI (JVM)".
    // Usually thread name changes are not that important as they don't affect
    // the front-end logic. But this one is important because visibility of
    // timeline markers depends on this name.
    // We don't need a gecko upgrader for this change because this renaming was
    // done long ago.
    for (const thread of profile.threads) {
      if (thread.name === 'Java Main Thread') {
        thread.name = 'AndroidUI (JVM)';
      }
    }
  },
  [38]: (profile: any) => {
    // The frame table no longer contains return addresses, it now contains
    // "nudged" return addresses, i.e. return address minus one byte.
    // See nudgeReturnAddresses for more details.
    // The code from nudgeReturnAddresses is duplicated below because this
    // upgrader needs to stay unaffected by any profile format changes after
    // version 38.
    //
    // This upgrader is needed so that clicking "Re-symbolicate" on old profiles
    // will obtain correct line numbers and inline frames (once implemented),
    // and so that the assembly view (once implemented) on an old profile will
    // assign the correct "total" cost to call instructions.
    for (const thread of profile.threads) {
      const samplingSelfStacks = new Set<number>();
      const syncBacktraceSelfStacks = new Set<number>();

      const {
        samples,
        markers,
        jsAllocations,
        nativeAllocations,
        stackTable,
        frameTable,
      } = thread;

      for (let i = 0; i < samples.length; i++) {
        const stack = samples.stack[i];
        if (stack !== null) {
          samplingSelfStacks.add(stack);
        }
      }
      for (let i = 0; i < markers.length; i++) {
        const data = markers.data[i];
        if (data && data.cause) {
          const stack = data.cause.stack;
          if (stack !== null) {
            syncBacktraceSelfStacks.add(stack);
          }
        }
      }
      if (jsAllocations !== undefined) {
        for (let i = 0; i < jsAllocations.length; i++) {
          const stack = jsAllocations.stack[i];
          if (stack !== null) {
            syncBacktraceSelfStacks.add(stack);
          }
        }
      }
      if (nativeAllocations !== undefined) {
        for (let i = 0; i < nativeAllocations.length; i++) {
          const stack = nativeAllocations.stack[i];
          if (stack !== null) {
            syncBacktraceSelfStacks.add(stack);
          }
        }
      }

      const oldIpFrameToNewIpFrame = new Uint32Array(frameTable.length);
      const ipFrames = new Set<number>();
      for (const stack of samplingSelfStacks) {
        const frame = stackTable.frame[stack];
        oldIpFrameToNewIpFrame[frame] = frame;
        const address = frameTable.address[frame];
        if (address !== -1) {
          ipFrames.add(frame);
        }
      }
      const returnAddressFrames = new Map();
      const prefixStacks = new Set();
      for (const stack of syncBacktraceSelfStacks) {
        const frame = stackTable.frame[stack];
        const returnAddress = frameTable.address[frame];
        if (returnAddress !== -1) {
          returnAddressFrames.set(frame, returnAddress);
        }
      }
      for (let stack = 0; stack < stackTable.length; stack++) {
        const prefix = stackTable.prefix[stack];
        if (prefix === null || prefixStacks.has(prefix)) {
          continue;
        }
        prefixStacks.add(prefix);
        const prefixFrame = stackTable.frame[prefix];
        const prefixAddress = frameTable.address[prefixFrame];
        if (prefixAddress !== -1) {
          returnAddressFrames.set(prefixFrame, prefixAddress);
        }
      }

      if (ipFrames.size === 0 && returnAddressFrames.size === 0) {
        continue;
      }

      // Iterate over all *return address* frames, i.e. all frames that were obtained
      // by stack walking.
      for (const [frame, address] of returnAddressFrames) {
        if (ipFrames.has(frame)) {
          // This address of this frame was observed both as a return address and as
          // an instruction pointer register value. We have to duplicate this frame so
          // so that we can make a distinction between the two uses.
          // The new frame will be used as the ipFrame, and the old frame will be used
          // as the return address frame (and have its address nudged).
          const newIpFrame = frameTable.length;
          frameTable.address.push(address);
          frameTable.category.push(frameTable.category[frame]);
          frameTable.subcategory.push(frameTable.subcategory[frame]);
          frameTable.func.push(frameTable.func[frame]);
          frameTable.nativeSymbol.push(frameTable.nativeSymbol[frame]);
          frameTable.innerWindowID.push(frameTable.innerWindowID[frame]);
          frameTable.implementation.push(frameTable.implementation[frame]);
          frameTable.line.push(frameTable.line[frame]);
          frameTable.column.push(frameTable.column[frame]);
          frameTable.optimizations.push(frameTable.optimizations[frame]);
          frameTable.length++;
          oldIpFrameToNewIpFrame[frame] = newIpFrame;
        }
        // Subtract 1 byte from the return address.
        frameTable.address[frame] = address - 1;
      }

      // Now the frame table contains adjusted / "nudged" addresses.

      // Make a new stack table which refers to the adjusted frames.
      const newStackTable: {
        frame: number[];
        prefix: Array<number | null>;
        category: number[];
        subcategory: number[];
        length: number;
      } = {
        frame: [],
        prefix: [],
        category: [],
        subcategory: [],
        length: 0,
      };
      const mapForSamplingSelfStacks = new Map();
      const mapForSyncBacktraces = new Map();
      const prefixMap = new Uint32Array(stackTable.length);
      for (let stack = 0; stack < stackTable.length; stack++) {
        const frame = stackTable.frame[stack];
        const category = stackTable.category[stack];
        const subcategory = stackTable.subcategory[stack];
        const prefix = stackTable.prefix[stack];

        const newPrefix = prefix === null ? null : prefixMap[prefix];

        if (prefixStacks.has(stack) || syncBacktraceSelfStacks.has(stack)) {
          // Copy this stack to the new stack table, and use the original frame
          // (which will have the nudged address if this is a return address stack).
          const newStackIndex = newStackTable.length;
          newStackTable.frame.push(frame);
          newStackTable.category.push(category);
          newStackTable.subcategory.push(subcategory);
          newStackTable.prefix.push(newPrefix);
          newStackTable.length++;
          prefixMap[stack] = newStackIndex;
          mapForSyncBacktraces.set(stack, newStackIndex);
        }

        if (samplingSelfStacks.has(stack)) {
          // Copy this stack to the new stack table, and use the potentially duplicated
          // frame, with a non-nudged address.
          const ipFrame = oldIpFrameToNewIpFrame[frame];
          const newStackIndex = newStackTable.length;
          newStackTable.frame.push(ipFrame);
          newStackTable.category.push(category);
          newStackTable.subcategory.push(subcategory);
          newStackTable.prefix.push(newPrefix);
          newStackTable.length++;
          mapForSamplingSelfStacks.set(stack, newStackIndex);
        }
      }
      thread.stackTable = newStackTable;

      samples.stack = samples.stack.map((oldStackIndex: number | null) =>
        oldStackIndex === null
          ? null
          : (mapForSamplingSelfStacks.get(oldStackIndex) ?? null)
      );
      markers.data.forEach((data: any) => {
        if (data && 'cause' in data && data.cause) {
          data.cause.stack = mapForSyncBacktraces.get(data.cause.stack);
        }
      });
      if (jsAllocations !== undefined) {
        jsAllocations.stack = jsAllocations.stack.map(
          (oldStackIndex: number | null) =>
            oldStackIndex === null
              ? null
              : (mapForSyncBacktraces.get(oldStackIndex) ?? null)
        );
      }
      if (nativeAllocations !== undefined) {
        nativeAllocations.stack = nativeAllocations.stack.map(
          (oldStackIndex: number | null) =>
            oldStackIndex === null
              ? null
              : (mapForSyncBacktraces.get(oldStackIndex) ?? null)
        );
      }
    }
  },
  [39]: (profile: any) => {
    for (const thread of profile.threads) {
      if (thread.samples.threadCPUDelta) {
        // Check to see the CPU delta numbers are all null and if they are, remove
        // this array completely. For example on JVM threads, all the threadCPUDelta
        // values will be null and therefore it will fail to paint the activity graph.
        // Instead we should remove the whole array. This call will be quick for most
        // of the cases because we usually have values at least in the second sample.
        const hasCPUDeltaValues = thread.samples.threadCPUDelta.some(
          (val: number | null) => val !== null
        );
        if (!hasCPUDeltaValues) {
          delete thread.samples.threadCPUDelta;
        }
      }
    }
  },
  [40]: (profile: any) => {
    // The FrameTable has a new column: inlineDepth.
    // We can initialize this column to zero for all frames. Zero means "this is
    // the frame for the outer function at this address". That's correct because
    // old profiles have not been symbolicated with inline frames, and the function
    // name we got from symbolication was always the name for the "outer" function.
    for (const thread of profile.threads) {
      thread.frameTable.inlineDepth = Array(thread.frameTable.length).fill(0);
    }
  },
  [41]: (profile: any) => {
    // The libs list has moved from Thread to Profile - it is now shared between
    // all threads in the profile. And it only contains libs which are used by
    // at least one resource.
    //
    // The Lib fields have changed, too:
    //  - The start/end/offset fields are gone: They are not needed after
    //    profile processing, when all frame addresses have been made
    //    library-relative; and these values usually differ in the different
    //    processes, so the fields could not have a meaningful value in the
    //    shared list.
    //  - There is a codeId field which defaults to null. This will be used in
    //    the future to store another ID which lets the symbol server look up
    //    correct binary. On Windows this is the dll / exe CodeId, and on Linux
    //    and Android this is the full ELF build ID.
    //
    // We've also cleaned up the ResourceTable format:
    //  - All resources now have names.
    //  - Resources without a "host" or "lib" field have these fields set to
    //    null consistently.

    const libs: any[] = [];
    const libKeyToLibIndex = new Map();
    for (const thread of profile.threads) {
      const {
        libs: threadLibs,
        resourceTable,
        nativeSymbols,
        stringArray,
      } = thread;
      const stringTable = StringTable.withBackingArray(stringArray);
      const threadLibIndexToGlobalLibIndex = new Map();
      delete thread.libs;

      const getOrAddNewLib = (libIndex: number) => {
        let newLibIndex = threadLibIndexToGlobalLibIndex.get(libIndex);
        if (newLibIndex === undefined) {
          const lib = threadLibs[libIndex];
          const { debugName, breakpadId } = lib;
          const libKey = `${debugName}/${breakpadId}`;

          newLibIndex = libKeyToLibIndex.get(libKey);
          if (newLibIndex === undefined) {
            newLibIndex = libs.length;
            const { arch, name, path, debugPath, codeId } = lib;
            libs.push({
              arch,
              name,
              path,
              debugName,
              debugPath,
              breakpadId,
              codeId: codeId ?? null,
            });
            libKeyToLibIndex.set(libKey, newLibIndex);
          }
          threadLibIndexToGlobalLibIndex.set(libIndex, newLibIndex);
        }

        return newLibIndex;
      };

      for (
        let resourceIndex = 0;
        resourceIndex < resourceTable.length;
        resourceIndex++
      ) {
        const nameStringIndex = resourceTable.name[resourceIndex];
        if (
          nameStringIndex === -1 ||
          nameStringIndex === undefined ||
          nameStringIndex === null
        ) {
          resourceTable.name[resourceIndex] =
            stringTable.indexForString('<unnamed resource>');
        }
        const hostStringIndex = resourceTable.host[resourceIndex];
        if (hostStringIndex === -1 || hostStringIndex === undefined) {
          resourceTable.host[resourceIndex] = null;
        }
        const libIndex = resourceTable.lib[resourceIndex];
        if (libIndex === undefined || libIndex === null || libIndex === -1) {
          resourceTable.lib[resourceIndex] = null;
          continue;
        }

        const newLibIndex = getOrAddNewLib(libIndex);
        resourceTable.lib[resourceIndex] = newLibIndex;
      }

      for (
        let nativeSymbolIndex = 0;
        nativeSymbolIndex < nativeSymbols.length;
        nativeSymbolIndex++
      ) {
        const libIndex = nativeSymbols.libIndex[nativeSymbolIndex];
        const newLibIndex = getOrAddNewLib(libIndex);
        nativeSymbols.libIndex[nativeSymbolIndex] = newLibIndex;
      }
    }
    profile.libs = libs;
  },
  [42]: (profile: any) => {
    // The nativeSymbols table now has a new column: functionSize.
    // Its values can be null.
    for (const thread of profile.threads) {
      const { nativeSymbols } = thread;
      nativeSymbols.functionSize = Array(nativeSymbols.length).fill(null);
    }
  },
  [43]: (_profile: any) => {
    // The number property in counters is now optional.
  },
  [44]: (profile: any) => {
    // `searchable` property in the marker schema wasn't implemented before and
    // we had some manual checks for the marker fields below. With this version,
    // we removed this manual check and started to use the `searchable` property
    // of the marker schema.
    for (const schema of profile.meta.markerSchema) {
      let searchableFieldKeys: string[];
      switch (schema.name) {
        case 'FileIO': {
          // threadId wasn't in the schema before, so we need to add manually.
          schema.data.push({
            key: 'threadId',
            label: 'Thread ID',
            format: 'string',
            searchable: true,
          });
          searchableFieldKeys = [];
          break;
        }
        case 'Log': {
          searchableFieldKeys = ['name', 'module'];
          break;
        }
        case 'DOMEvent': {
          // In the earlier versions of Firefox, DOMEvent doesn't include
          // eventType in the backend.
          schema.data.push({
            key: 'eventType',
            label: 'Event Type',
            format: 'string',
            searchable: true,
          });
          // 'target' wasn't included in our code before. But I thought this
          // would be a useful addition.
          searchableFieldKeys = ['target'];
          break;
        }
        case 'TraceEvent': {
          // These weren't included in our code before. But I thought this
          // would be a useful addition.
          searchableFieldKeys = ['name1', 'name2', 'val1', 'val2'];
          break;
        }
        default: {
          searchableFieldKeys = ['name', 'category'];
          break;
        }
      }

      for (const field of schema.data) {
        if (searchableFieldKeys.includes(field.key)) {
          field.searchable = true;
        }
      }
    }
  },
  [45]: (profile: any) => {
    // The "optimizations" column was removed from the frame table.
    for (const thread of profile.threads) {
      delete thread.frameTable.optimizations;
    }
  },
  [46]: (profile: any) => {
    // An `isMainThread` field was added to the Thread type.
    //
    // This replaces the following function:
    //
    // export function isMainThread(thread: Thread): boolean {
    //   return (
    //     thread.name === 'GeckoMain' ||
    //     // If the pid is a string, then it's not one that came from the system.
    //     // These threads should all be treated as main threads.
    //     typeof thread.pid === 'string' ||
    //     // On Linux the tid of the main thread is the pid. This is useful for
    //     // profiles imported from the Linux 'perf' tool.
    //     String(thread.pid) === thread.tid
    //   );
    // }
    for (const thread of profile.threads) {
      thread.isMainThread =
        thread.name === 'GeckoMain' ||
        typeof thread.pid === 'string' ||
        String(thread.pid) === thread.tid;
    }
  },
  [47]: (profile: any) => {
    // The `pid` field of the Thread type was changed from `string | number` to `string`.
    // The same happened to the data.otherPid field of IPC markers, and to the
    // pid fields in the profiler.counters and profile.profilerOverhead lists.
    for (const thread of profile.threads) {
      thread.pid = `${thread.pid}`;

      for (const data of thread.markers.data) {
        if (data && data.type === 'IPC') {
          data.otherPid = `${data.otherPid}`;
        }
      }
    }
    if (profile.counters) {
      for (const counter of profile.counters) {
        counter.pid = `${counter.pid}`;
      }
    }
    if (profile.profilerOverhead) {
      for (const overhead of profile.profilerOverhead) {
        overhead.pid = `${overhead.pid}`;
      }
    }
  },
  [48]: (profile: any) => {
    // Remove the 'sampleGroups' object from the Counter structure.
    if (profile.counters && profile.counters.length > 0) {
      for (const counter of profile.counters) {
        counter.samples = counter.sampleGroups[0].samples;
        delete counter.sampleGroups;
      }
    }
  },
  [49]: (_profile: any) => {
    // The 'sanitized-string' marker schema format type has been added.
  },
  [50]: (_profile: any) => {
    // The format can now optionally store sample and counter sample
    // times as time deltas instead of absolute timestamps to reduce the JSON size.
  },
  [51]: (_profile: any) => {
    // This version bump added two new form types for new marker schema field:
    // "flow-id" and "terminating-flow-id".
    // Older frontends will not be able to display these fields.
    // Furthermore, the marker schema itself has an optional isStackBased field.
    // No upgrade is needed, as older versions of firefox would not generate
    // marker data with the new field types data, and no modification is needed in the
    // frontend to display older formats.
  },
  [52]: (profile: any) => {
    // This version simplifies how markers are mapped to their schema.
    // The schema is now purely determined by data.type. The marker's name is ignored.
    // If a marker has a null data, then it has no schema.
    //
    // In earlier versions, there were special cases for mapping markers with type
    // "tracing" and "Text", and for markers with a null data property. These
    // special cases have been removed.
    //
    // The upgrader for version 52 makes it so that existing profiles appear the
    // same with the simplified logic. Specifically:
    //  - Some old profiles have markers with data.type === 'tracing' but no schema
    //    with the name 'tracing'. To ensure that the tracing markers from these
    //    profile still show up in the 'timeline-overview' area, this upgrader adds
    //    a schema to such profiles.
    //  - Some old profiles have CC markers which only showed up in the memory track
    //    because of special treatment of 'tracing' markers - the markers would have
    //    data.type === 'tracing' and data.category === 'CC', and there would be a
    //    'CC' schema with 'timeline-memory'. This upgrader moves these tracing CC
    //    markers to a new 'tracingCCFrom52Upgrader' schema.
    //
    // Profiles from modern versions of Firefox already include a 'tracing' schema.
    // And they don't use tracing markers for CC markers.

    const schemaNames = new Set<string>(
      profile.meta.markerSchema.map((s: any) => s.name)
    );
    const kTracingCCSchemaName = 'tracingCCFrom52Upgrader';
    const shouldMigrateTracingCCMarkers = schemaNames.has('CC');
    let hasTracingMarkers = false;
    let hasMigratedTracingCCMarkers = false;
    for (const thread of profile.threads) {
      const { markers } = thread;
      for (let i = 0; i < markers.length; i++) {
        const data = markers.data[i];
        if (data && data.type === 'tracing' && data.category) {
          hasTracingMarkers = true;
          if (shouldMigrateTracingCCMarkers && data.category === 'CC') {
            data.type = kTracingCCSchemaName;
            hasMigratedTracingCCMarkers = true;
            if (data.interval) {
              // Also delete the interval property. This is present on old
              // profiles where marker phase information was represented in the
              // payload, i.e. you'd have interval: "start" / "end" on the
              // data object.
              // Our kTracingCCSchemaName schema does not list the interval field,
              // so we shouldn't have this field on the payload either.
              delete data.interval;
            }
          }
        }
      }
    }
    if (hasTracingMarkers && !schemaNames.has('tracing')) {
      // Make sure that tracing markers still show up in the timeline-overview area.
      profile.meta.markerSchema.push({
        name: 'tracing',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [{ key: 'category', label: 'Type', format: 'string' }],
      });
    }

    if (hasMigratedTracingCCMarkers) {
      // Add the kTracingCCSchemaName schema for migrated tracing CC markers, to
      // make sure that these markers still show up in the timeline-memory area.
      profile.meta.markerSchema.push({
        name: kTracingCCSchemaName,
        display: ['marker-chart', 'marker-table', 'timeline-memory'],
        data: [{ key: 'category', label: 'Type', format: 'string' }],
      });
    }
  },
  [53]: (profile: any) => {
    for (const thread of profile.threads) {
      const { frameTable, stackTable } = thread;

      // Attempt to keep some existing profiles working which weren't compliant
      // with the profile format's type definitions.
      if (!frameTable.category) {
        // Profiles generated by Lean before https://github.com/leanprover/lean4/pull/6363
        // didn't have category / subcategory columns in the frameTable. Migrate
        // the category / subcategory values from the stackTable.
        frameTable.category = new Array(frameTable.length).fill(null);
        frameTable.subcategory = new Array(frameTable.length).fill(null);
        for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
          const frameIndex = stackTable.frame[stackIndex];
          frameTable.category[frameIndex] = stackTable.category[stackIndex];
          frameTable.subcategory[frameIndex] =
            stackTable.subcategory[stackIndex];
        }
      } else if (!frameTable.subcategory) {
        // Profiles from vernier before https://github.com/jhawthorn/vernier/issues/128
        // didn't contain a subcategory column in the frameTable.
        //
        // Supply a column where every value is set to 0.
        // 0 is always a valid value for the subcategory.
        //
        // The requirements for subcategory values are:
        // - For frames with a null category, the subcategory value is ignored.
        // - For frames with a non-null category, the subcategory must be non-null.
        // - Subcategory 0 refers to the category itself; in profile.meta.categories,
        //   every category should have a subcategory list which starts with the
        //   generic subcategory "Other" at index 0.
        frameTable.subcategory = new Array(frameTable.length).fill(0);
      }

      // Remove stackTable.category and stackTable.subcategory.
      delete stackTable.category;
      delete stackTable.subcategory;
    }
  },
  [54]: (profile: any) => {
    // The `implementation` column was removed from the frameTable. Modern
    // profiles from Firefox use subcategories to represent the information
    // about the JIT type of a JS frame.
    // Furthermore, marker schema fields now support a `hidden` attribute. When
    // present and set to true, such fields will be omitted from the tooltip and
    // the sidebar.
    // And finally, `profile.meta.sampleUnits.time` now supports both `'ms'`
    // (milliseconds) and `'bytes'`. When set to `'bytes'`, the time value of a
    // sample will be interpreted as a bytes offset. This is useful for size
    // profiles, where a sample's "time" describes the offset at which the piece
    // is located within the entire file.

    // Very old Gecko profiles don't have JS subcategories. Convert the
    // implementation information to subcategories.
    function maybeConvertImplementationToSubcategories(profile: any) {
      const { categories } = profile.meta;
      if (!categories) {
        return;
      }

      if (categories.some((c: any) => c.subcategories.length !== 1)) {
        // This profile has subcategories.
        return;
      }

      const jsCategoryIndex = categories.findIndex(
        (c: any) => c.name === 'JavaScript'
      );
      if (jsCategoryIndex === -1) {
        // This profile has no JavaScript category.
        return;
      }

      const jsCategorySubcategories = categories[jsCategoryIndex].subcategories;
      const subcategoryForImplStr = new Map();

      for (const thread of profile.threads) {
        const { frameTable, stringArray } = thread;
        for (let i = 0; i < frameTable.length; i++) {
          const implStrIndex = frameTable.implementation[i];
          if (implStrIndex === null) {
            continue;
          }
          const implStr = stringArray[implStrIndex];
          let subcategory = subcategoryForImplStr.get(implStr);
          if (subcategory === undefined) {
            subcategory = jsCategorySubcategories.length;
            jsCategorySubcategories[subcategory] = `JIT (${implStr})`;
            subcategoryForImplStr.set(implStr, subcategory);
          }
          frameTable.category[i] = jsCategoryIndex;
          frameTable.subcategory[i] = subcategory;
        }
      }
    }

    maybeConvertImplementationToSubcategories(profile);

    // Delete the implementation column from the frameTable of every thread.
    for (const thread of profile.threads) {
      delete thread.frameTable.implementation;
    }

    // This field is no longer needed.
    delete profile.meta.doesNotUseFrameImplementation;
  },
  [55]: (profile: any) => {
    for (const markerSchema of profile.meta.markerSchema) {
      const staticFields = markerSchema.data.filter(
        (f: any) => f.key === undefined
      );
      const fields = markerSchema.data.filter(
        (f: any) => f.value === undefined
      );

      markerSchema.fields = fields;
      delete markerSchema.data;

      if (staticFields.length === 0) {
        continue;
      }

      // Migrate one of the static fields to the new `description` property.
      let staticDescriptionFieldIndex = staticFields.findIndex(
        (f: any) => f.label === 'Description'
      );
      if (staticDescriptionFieldIndex === -1) {
        staticDescriptionFieldIndex = 0;
      }
      const description = staticFields[staticDescriptionFieldIndex].value;
      markerSchema.description = description;

      // If there was more than one static field, we may be discarding useful data.
      // Print a warning to the console if that's the case, unless this is the
      // old { label: "Marker", value: "UserTiming" } field which never provided
      // any value. (On the Gecko side, it was removed by D196332.)
      const discardedFields = staticFields.filter(
        (_f: any, i: number) => i !== staticDescriptionFieldIndex
      );
      const potentiallyUsefulDiscardedFields = discardedFields.filter(
        (f: any) => f.label !== 'Marker' && f.value !== 'UserTiming'
      );
      if (potentiallyUsefulDiscardedFields.length !== 0) {
        console.warn(
          `Discarding the following static fields from marker schema "${markerSchema.name}": ${potentiallyUsefulDiscardedFields.map((f: any) => f.label + ': ' + f.value).join(', ')}`
        );
      }
    }
  },
  [56]: (profile: any) => {
    // The stringArray is now shared across all threads. It is stored at
    // profile.shared.stringArray.
    const stringArray: string[] = [];
    const stringTable = StringTable.withBackingArray(stringArray);

    // Precompute marker fields that need adjusting.
    const stringIndexMarkerFieldsByDataType = new Map();
    stringIndexMarkerFieldsByDataType.set('CompositorScreenshot', ['url']);
    for (const schema of profile.meta.markerSchema) {
      const { name, fields } = schema;
      const stringIndexFields = [];
      for (const field of fields) {
        if (
          field.format === 'unique-string' ||
          field.format === 'flow-id' ||
          field.format === 'terminating-flow-id'
        ) {
          stringIndexFields.push(field.key);
        }
      }
      if (stringIndexFields.length !== 0) {
        stringIndexMarkerFieldsByDataType.set(name, stringIndexFields);
      }
    }

    // Adjust all data across all threads.
    for (const thread of profile.threads) {
      const {
        markers,
        funcTable,
        nativeSymbols,
        resourceTable,
        jsTracer,
        stringArray: threadStringArray,
      } = thread;
      for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
        const nameStr = threadStringArray[markers.name[markerIndex]];
        markers.name[markerIndex] = stringTable.indexForString(nameStr);

        // Adjust string index marker fields.
        const data = markers.data[markerIndex];
        if (!data || !data.type) {
          continue;
        }

        const fieldsToAdjust = stringIndexMarkerFieldsByDataType.get(data.type);
        if (fieldsToAdjust !== undefined) {
          for (const fieldName of fieldsToAdjust) {
            const fieldValue = data[fieldName];
            const fieldStr = threadStringArray[fieldValue];
            if (fieldStr !== undefined) {
              data[fieldName] = stringTable.indexForString(fieldStr);
            }
          }
        }
      }
      for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
        funcTable.name[funcIndex] = stringTable.indexForString(
          threadStringArray[funcTable.name[funcIndex]]
        );
        const funcFileName = funcTable.fileName[funcIndex];
        if (funcFileName !== null) {
          funcTable.fileName[funcIndex] = stringTable.indexForString(
            threadStringArray[funcFileName]
          );
        }
      }
      for (let symIndex = 0; symIndex < nativeSymbols.length; symIndex++) {
        nativeSymbols.name[symIndex] = stringTable.indexForString(
          threadStringArray[nativeSymbols.name[symIndex]]
        );
      }
      for (
        let resourceIndex = 0;
        resourceIndex < resourceTable.length;
        resourceIndex++
      ) {
        resourceTable.name[resourceIndex] = stringTable.indexForString(
          threadStringArray[resourceTable.name[resourceIndex]]
        );
        const resourceHost = resourceTable.host[resourceIndex];
        if (resourceHost !== null) {
          resourceTable.host[resourceIndex] = stringTable.indexForString(
            threadStringArray[resourceHost]
          );
        }
      }
      if (jsTracer !== undefined) {
        for (
          let traceEventIndex = 0;
          traceEventIndex < jsTracer.length;
          traceEventIndex++
        ) {
          jsTracer.events[traceEventIndex] = stringTable.indexForString(
            threadStringArray[jsTracer.events[traceEventIndex]]
          );
        }
      }
      delete thread.stringArray;
    }
    profile.shared = { stringArray };
  },
  [57]: (profile: any) => {
    // The "searchable" property for fields in the marker schema was removed again.
    // Now all marker fields are searchable.
    for (const schema of profile.meta.markerSchema) {
      for (const field of schema.fields) {
        delete field.searchable;
      }
    }
  },
  // If you add a new upgrader here, please document the change in
  // `docs-developer/CHANGELOG-formats.md`.
};
/* eslint-enable no-useless-computed-key */
