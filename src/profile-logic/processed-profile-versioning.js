/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
/**
 * This file deals with old versions of the "processed" profile format,
 * i.e. the format that profiler.firefox.com uses internally. Profiles in this format
 * can be saved out to files or uploaded to the profile store server, and we
 * want to be able to display profiles that were saved at any point in the
 * past, regardless of their version. So this file upgrades old profiles to
 * the current format.
 */

import { sortDataTable } from '../utils/data-table-utils';
import { resourceTypes } from './data-structures';
import { UniqueStringArray } from '../utils/unique-string-array';
import { timeCode } from '../utils/time-code';
import { PROCESSED_PROFILE_VERSION } from '../app-logic/constants';
import { coerce } from '../utils/flow';
import type { SerializableProfile } from 'firefox-profiler/types';

// Processed profiles before version 1 did not have a profile.meta.preprocessedProfileVersion
// field. Treat those as version zero.
const UNANNOTATED_VERSION = 0;

/**
 * Upgrades the supplied profile to the current version, by mutating |profile|.
 * Throws an exception if the profile is too new. If the profile does not appear
 * to be a processed profile, then return null. The profile provided is the
 * "serialized" form of a processed profile, i.e. stringArray instead of stringTable.
 */
export function attemptToUpgradeProcessedProfileThroughMutation(
  profile: mixed
): SerializableProfile | null {
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
    return coerce<MixedObject, SerializableProfile>(profile);
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

  const upgradedProfile = coerce<MixedObject, SerializableProfile>(profile);
  upgradedProfile.meta.preprocessedProfileVersion = PROCESSED_PROFILE_VERSION;

  return upgradedProfile;
}

function _archFromAbi(abi) {
  if (abi === 'x86_64-gcc3') {
    return 'x86_64';
  }
  return abi;
}

function _getRealScriptURI(url) {
  if (url) {
    const urls = url.split(' -> ');
    return urls[urls.length - 1];
  }
  return url;
}

function _mutateProfileToEnsureCauseBacktraces(profile) {
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
      category => category.name === defaultCategory.name
    );
    if (index === -1) {
      // Add on any unknown categories.
      profile.meta.categories.push(defaultCategory);
    }
  }

  const otherCategory = profile.meta.categories.findIndex(
    category => category.name === 'Other'
  );

  const keyToCategoryIndex: Map<string, number> = new Map(
    keyToCategoryName.map(([key, categoryName]) => {
      const index = profile.meta.categories.findIndex(
        category => category.name === categoryName
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

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the profile as its single argument and mutates it.
/* eslint-disable no-useless-computed-key */
const _upgraders = {
  [1]: profile => {
    // Starting with version 1, markers are sorted.
    timeCode('sorting thread markers', () => {
      for (const thread of profile.threads) {
        sortDataTable(thread.markers, thread.markers.time, (a, b) => a - b);
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
  [2]: profile => {
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
  [3]: profile => {
    // Make sure every lib has a debugPath property. We can't infer this
    // value from the other properties on the lib so we just set it to the
    // empty string.
    for (const thread of profile.threads) {
      for (const lib of thread.libs) {
        lib.debugPath = lib.debugPath || '';
      }
    }
  },
  [4]: profile => {
    profile.threads.forEach(thread => {
      const { funcTable, stringArray, resourceTable } = thread;
      const stringTable = new UniqueStringArray(stringArray);

      // resourceTable gains a new field ("host") and a new resourceType:
      // "webhost". Resources from http and https URLs are now grouped by
      // origin (protocol + host) into one webhost resource, instead of being
      // separate per-URL resources.
      // That means that multiple old resources can collapse into one new
      // resource. We need to keep track of such collapsing (using the
      // oldResourceToNewResourceMap) and then execute apply the changes to
      // the resource pointers in the funcTable.
      const newResourceTable = {
        length: 0,
        type: [],
        name: [],
        lib: [],
        icon: [],
        addonId: [],
        host: [],
      };
      function addLibResource(name, lib) {
        const index = newResourceTable.length++;
        newResourceTable.type[index] = resourceTypes.library;
        newResourceTable.name[index] = name;
        newResourceTable.lib[index] = lib;
      }
      function addWebhostResource(origin, host) {
        const index = newResourceTable.length++;
        newResourceTable.type[index] = resourceTypes.webhost;
        newResourceTable.name[index] = origin;
        newResourceTable.host[index] = host;
      }
      function addUrlResource(url) {
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
          funcTable.resource[funcIndex] = oldResourceToNewResourceMap.get(
            oldResourceIndex
          );
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
      thread.stringArray = stringTable.serializeToArray();
    });
  },
  [5]: profile => {
    // The "frameNumber" column was removed from the samples table.
    for (const thread of profile.threads) {
      delete thread.samples.frameNumber;
    }
  },
  [6]: profile => {
    // The type field for DOMEventMarkerPayload was renamed to eventType.
    for (const thread of profile.threads) {
      const { stringArray, markers } = thread;
      const stringTable = new UniqueStringArray(stringArray);
      const newDataArray = [];
      for (let i = 0; i < markers.length; i++) {
        const name = stringTable.getString(markers.name[i]);
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
  [7]: profile => {
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
  [8]: profile => {
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
      const stringTable = new UniqueStringArray(stringArray);
      const newDataArray = [];
      for (let i = 0; i < markers.length; i++) {
        const name = stringTable.getString(markers.name[i]);
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
  [9]: profile => {
    // Upgrade the GC markers

    /*
     * Upgrade a GCMajor marker in the Gecko profile format.
     */
    function upgradeGCMajorMarker_Gecko8To9(marker) {
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

    function upgradeGCMajorMarker_Processed8to9(marker8) {
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

    function upgradeGCMinorMarker(marker8) {
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

    function convertPhaseTimes(old_phases) {
      const phases = {};
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
  [10]: profile => {
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
  [11]: profile => {
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

      const stringTable = new UniqueStringArray(stringArray);
      const extraMarkers = [];
      for (let i = 0; i < markers.length; i++) {
        const name = stringTable.getString(markers.name[i]);
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
        const newMarkers = {
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
  [12]: profile => {
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
      const stringTable = new UniqueStringArray(stringArray);
      for (let i = 0; i < frameTable.length; i++) {
        const funcIndex = frameTable.func[i];
        const funcName = stringTable.getString(funcTable.name[funcIndex]);
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
  [13]: profile => {
    // The stackTable has a new column called "category", which is computed
    // from the stack's frame's category, or if that is null, from the stack's
    // prefix's category. For root stacks whose frame doesn't have a category,
    // the category is set to the grey category (usually something like "Other").
    // The same algorithm is used in profile processing, when the processed
    // profile's category column is derived from the gecko profile (which does
    // not have a category column in its stack table).
    const { meta, threads } = profile;
    const defaultCategory = meta.categories.findIndex(c => c.color === 'grey');

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
  [14]: profile => {
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
  [15]: profile => {
    // Profiles now have a column property in the frameTable
    for (const thread of profile.threads) {
      thread.frameTable.column = new Array(thread.frameTable.length);
      for (let i = 0; i < thread.frameTable.length; i++) {
        thread.frameTable.column[i] = null;
      }
    }
  },
  [16]: profile => {
    // The type field on some markers were missing. Renamed category field of
    // VsyncTimestamp and LayerTranslation marker payloads to type and added
    // a type field to Screenshot marker payload.
    // In addition to that, we removed the `vsync` field from VsyncTimestamp
    // since we don't use that field and have a timestamp for them already.
    // Old profiles might still have this property.
    for (const thread of profile.threads) {
      const { stringArray, markers } = thread;
      const stringTable = new UniqueStringArray(stringArray);
      const newDataArray = [];
      for (let i = 0; i < markers.length; i++) {
        const name = stringTable.getString(markers.name[i]);
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
  [17]: profile => {
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
      const stringTable = new UniqueStringArray(stringArray);
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
      thread.stringArray = stringTable.serializeToArray();
    }
  },
  [18]: profile => {
    // When we added column numbers we forgot to update the func table.
    // As a result, when we had a column number for an entry, the line number
    // ended up in the `fileName` property, and the column number in the
    // `lineNumber` property.
    // We update the func table with right values of 'fileName', 'lineNumber' and 'columnNumber'.
    for (const thread of profile.threads) {
      const { funcTable, stringArray } = thread;
      const stringTable = new UniqueStringArray(stringArray);
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
      thread.stringArray = stringTable.serializeToArray();
    }
  },
  [19]: profile => {
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
  [20]: _profile => {
    // rss and uss was removed from the SamplesTable. The version number was bumped
    // to help catch errors of using an outdated version of profiler.firefox.com with a newer
    // profile. There's no good reason to remove the values for upgrading profiles though.
  },
  [21]: profile => {
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
  [22]: profile => {
    // FileIO was originally called DiskIO. This profile upgrade performs the rename.
    for (const thread of profile.threads) {
      if (thread.stringArray.indexOf('DiskIO') === -1) {
        // There are no DiskIO markers.
        continue;
      }
      let fileIoStringIndex = thread.stringArray.indexOf('FileIO');
      if (fileIoStringIndex === -1) {
        fileIoStringIndex = thread.stringArray.length;
        thread.stringArray.push('FileIO');
      }

      for (let i = 0; i < thread.markers.length; i++) {
        const data = thread.markers.data[i];
        if (data && data.type === 'DiskIO') {
          data.type = 'FileIO';
          thread.markers.name[i] = fileIoStringIndex;
        }
      }
    }
  },
  [23]: profile => {
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
      frameTable.subcategory = frameTable.category.map(c =>
        c === null ? null : 0
      );
      stackTable.subcategory = stackTable.category.map(c =>
        c === null ? null : 0
      );
    }
  },
  [24]: profile => {
    // Markers now have a category field. For older profiles, guess the marker category.
    _guessMarkerCategories(profile);
  },
  [25]: profile => {
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
        markers.data = markers.data.map(data => {
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
  [26]: profile => {
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
  [27]: profile => {
    // Profiles now have an innerWindowID property in the frameTable.
    // We are filling this array with 0 values because we have no idea what that value might be.
    for (const thread of profile.threads) {
      const { frameTable } = thread;
      frameTable.innerWindowID = new Array(frameTable.length).fill(0);
    }
  },
  [28]: profile => {
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
  [29]: profile => {
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
  [30]: profile => {
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
      startTime: number,
      endTime: number,
      type: string,
      interval: string,
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
        const data: ?Payload = markers.data[i];
        const time: number = times[i];

        // Start out by assuming it's an instant marker.
        let newStartTime = time;
        let newEndTime = null;
        let phase = INSTANT;

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
  [31]: profile => {
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
  [32]: profile => {
    // Migrate DOMEvent markers to Markers 2.0

    // This is a fairly permissive type, but helps ensure the logic below is type checked.
    type DOMEventPayload31_to_32 = {
      // Tracing -> DOMEvent
      type: 'tracing' | 'DOMEvent',
      category: 'DOMEvent',
      eventType: string,
      // These are removed:
      timeStamp: number,
      // This gets added:
      latency: number,
    };

    // This is just the useful parts of the processed profile version 31.
    type ProfileV31 = {
      threads: Array<{
        markers: {
          data: any[],
          startTime: Array<number | null>,
          length: number,
          ...
        },
        ...
      }>,
      processes: ProfileV31[],
    };

    for (const { markers } of (profile: ProfileV31).threads) {
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
  [33]: profile => {
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
      {
        // TODO - Note that this marker is a "tracing" marker currently.
        // See issue #2749
        name: 'Paint',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [{ key: 'category', label: 'Type', format: 'string' }],
      },
      {
        // TODO - Note that this marker is a "tracing" marker currently.
        // See issue #2749
        name: 'Navigation',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [{ key: 'category', label: 'Type', format: 'string' }],
      },
      {
        // TODO - Note that this marker is a "tracing" marker currently.
        // See issue #2749
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
        name: 'RefreshDriverTick',
        display: ['marker-chart', 'marker-table', 'timeline-overview'],
        data: [{ key: 'name', label: 'Tick Reasons', format: 'string' }],
      },
      {
        // The schema is mostly handled with custom logic.
        name: 'Network',
        display: ['marker-table'],
        data: [],
      },
    ];
  },
};
/* eslint-enable no-useless-computed-key */
