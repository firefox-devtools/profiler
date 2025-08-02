/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * This file deals with old versions of the Gecko profile format, i.e. the
 * format that the Gecko profiler platform outputs. We want to be able to
 * run profiler.firefox.com on non-Nightly versions of Firefox, and we want
 * to be able to load old saved profiles, so this file upgrades old profiles
 * to the current format.
 *
 * Please don't forget to update the gecko profile format changelog in
 * `docs-developer/CHANGELOG-formats.md`.
 */

import { StringTable } from '../utils/string-table';
import { GECKO_PROFILE_VERSION } from '../app-logic/constants';

// Gecko profiles before version 1 did not have a profile.meta.version field.
// Treat those as version zero.
const UNANNOTATED_VERSION = 0;

function getProfileMeta(profile: unknown): any {
  if (
    profile &&
    typeof profile === 'object' &&
    'meta' in profile &&
    profile.meta &&
    typeof profile.meta === 'object'
  ) {
    return profile.meta;
  }

  throw new Error('Could not find the meta property on a profile.');
}

/**
 * Upgrades the supplied profile to the current version, by mutating |profile|.
 * Throws an exception if the profile is too new.
 * @param {object} profile The profile in the "Gecko profile" format.
 */
export function upgradeGeckoProfileToCurrentVersion(json: unknown) {
  const profileVersion = getProfileMeta(json).version || UNANNOTATED_VERSION;
  if (profileVersion === GECKO_PROFILE_VERSION) {
    return;
  }

  if (profileVersion > GECKO_PROFILE_VERSION) {
    throw new Error(
      `Unable to parse a Gecko profile of version ${profileVersion}, most likely profiler.firefox.com needs to be refreshed. ` +
        `The most recent version understood by this version of profiler.firefox.com is version ${GECKO_PROFILE_VERSION}.\n` +
        'You can try refreshing this page in case profiler.firefox.com has updated in the meantime.'
    );
  }

  // Convert to GECKO_PROFILE_VERSION, one step at a time.
  for (
    let destVersion = profileVersion + 1;
    destVersion <= GECKO_PROFILE_VERSION;
    destVersion++
  ) {
    if (destVersion in _upgraders) {
      _upgraders[destVersion](json);
    }
  }

  getProfileMeta(json).version = GECKO_PROFILE_VERSION;
}

function _archFromAbi(abi: string) {
  if (abi === 'x86_64-gcc3') {
    return 'x86_64';
  }
  return abi;
}

type GeckoProfileUpgrader = (profile: any) => void;

// _upgraders[i] converts from version i - 1 to version i.
// Every "upgrader" takes the profile as its single argument and mutates it.
/* eslint-disable no-useless-computed-key */
const _upgraders: {
  [key: number]: GeckoProfileUpgrader;
} = {
  [1]: () => {
    throw new Error(
      'Gecko profiles without version numbers are very old and no conversion code has been written for that version of the profile format.'
    );
  },
  [2]: () => {
    throw new Error(
      'Gecko profile version 1 is very old and no conversion code has been written for that version of the profile format.'
    );
  },
  [3]: () => {
    throw new Error(
      'Gecko profile version 2 is very old and no conversion code has been written for that version of the profile format.'
    );
  },
  [4]: (profile: any) => {
    function convertToVersionFourRecursive(p: any) {
      // In version < 3, p.libs was a JSON string.
      // Starting with version 4, libs is an actual array, each lib has
      // "debugName", "debugPath", "breakpadId" and "path" fields, and the
      // array is sorted by start address.
      p.libs = JSON.parse(p.libs)
        .map((lib: any) => {
          if ('breakpadId' in lib) {
            lib.debugName = lib.name.substr(lib.name.lastIndexOf('/') + 1);
          } else {
            lib.debugName = lib.pdbName;
            const pdbSig = lib.pdbSignature.replace(/[{}-]/g, '').toUpperCase();
            lib.breakpadId = pdbSig + lib.pdbAge;
          }
          delete lib.pdbName;
          delete lib.pdbAge;
          delete lib.pdbSignature;
          lib.path = lib.name;
          lib.name = lib.debugName.endsWith('.pdb')
            ? lib.debugName.substr(0, lib.debugName.length - 4)
            : lib.debugName;
          lib.arch = _archFromAbi(p.meta.abi);
          lib.debugPath = '';
          return lib;
        })
        .sort((a: any, b: any) => a.start - b.start);

      for (let threadIndex = 0; threadIndex < p.threads.length; threadIndex++) {
        if (typeof p.threads[threadIndex] === 'string') {
          // Also do the modification to embedded subprocess profiles.
          const subprocessProfile = JSON.parse(p.threads[threadIndex]);
          convertToVersionFourRecursive(subprocessProfile);
          p.threads[threadIndex] = JSON.stringify(subprocessProfile);
        } else {
          // At the beginning of format version 3, the thread name for any
          // threads in a "tab" process was "Content", and the processType
          // field did not exist. When this was changed, the version was not
          // updated, so we handle both cases here.
          const thread = p.threads[threadIndex];
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
      }

      p.meta.version = 4;
    }
    convertToVersionFourRecursive(profile);
  },
  [5]: (profile: any) => {
    // In version 4, profiles from other processes were embedded as JSON
    // strings in the threads array. Version 5 breaks those out into a
    // separate "processes" array and no longer stringifies them.
    function convertToVersionFiveRecursive(p: any) {
      const allThreadsAndProcesses = p.threads.map((threadOrProcess: any) => {
        if (typeof threadOrProcess === 'string') {
          const processProfile = JSON.parse(threadOrProcess);
          convertToVersionFiveRecursive(processProfile);
          return {
            type: 'process',
            data: processProfile,
          };
        }
        return {
          type: 'thread',
          data: threadOrProcess,
        };
      });
      p.processes = allThreadsAndProcesses
        .filter((x: any) => x.type === 'process')
        .map((p: any) => p.data);
      p.threads = allThreadsAndProcesses
        .filter((x: any) => x.type === 'thread')
        .map((t: any) => t.data);
      p.meta.version = 5;
    }
    convertToVersionFiveRecursive(profile);
  },
  [6]: (profile: any) => {
    // The frameNumber column was removed from the samples table.
    function convertToVersionSixRecursive(p: any) {
      for (const thread of p.threads) {
        delete thread.samples.schema.frameNumber;
        for (
          let sampleIndex = 0;
          sampleIndex < thread.samples.data.length;
          sampleIndex++
        ) {
          // Truncate the array to a maximum length of 5.
          // The frameNumber used to be the last item, at index 5.
          thread.samples.data[sampleIndex].splice(5);
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionSixRecursive(subprocessProfile);
      }
    }
    convertToVersionSixRecursive(profile);
  },
  [7]: (profile: any) => {
    // The type field for DOMEventMarkerPayload was renamed to eventType.
    function convertToVersionSevenRecursive(p: any) {
      for (const thread of p.threads) {
        const nameIndex = thread.markers.schema.name;
        const dataIndex = thread.markers.schema.data;
        for (let i = 0; i < thread.markers.data.length; i++) {
          const name = thread.stringTable[thread.markers.data[i][nameIndex]];
          if (name === 'DOMEvent') {
            const data = thread.markers.data[i][dataIndex];
            data.eventType = data.type;
            data.type = 'DOMEvent';
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionSevenRecursive(subprocessProfile);
      }
    }
    convertToVersionSevenRecursive(profile);
  },
  [8]: (profile: any) => {
    // Profiles have the following new attributes:
    //  - meta.shutdownTime: null if the process is still running, otherwise
    //    the shutdown time of the process in milliseconds relative to
    //    meta.startTime
    //  - pausedRanges: an array of
    //    { startTime: number | null, endTime: number | null, reason: string }
    // Each thread has the following new attributes:
    //  - registerTime: The time this thread was registered with the profiler,
    //    in milliseconds since meta.startTime
    //  - unregisterTime: The time this thread was unregistered from the
    //    profiler, in milliseconds since meta.startTime, or null
    function convertToVersionEightRecursive(p: any) {
      // We can't invent missing data, so just initialize everything with some
      // kind of empty value.

      // "The profiler was never paused during the recorded range, and we never
      // collected a profile."
      p.pausedRanges = [];

      // "All processes were still alive by the time the profile was captured."
      p.meta.shutdownTime = null;

      for (const thread of p.threads) {
        // "All threads were registered instantly at process startup."
        thread.registerTime = 0;

        // "All threads were still alive by the time the profile was captured."
        thread.unregisterTime = null;
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionEightRecursive(subprocessProfile);
      }
    }
    convertToVersionEightRecursive(profile);
  },
  [9]: (profile: any) => {
    // Upgrade GC markers

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

    function convertToVersionNineRecursive(p: any) {
      for (const thread of p.threads) {
        const dataIndex = thread.markers.schema.data;
        for (let i = 0; i < thread.markers.data.length; i++) {
          let marker = thread.markers.data[i][dataIndex];
          if (marker) {
            switch (marker.type) {
              case 'GCMinor':
                marker = upgradeGCMinorMarker(marker);
                break;
              case 'GCMajor':
                marker = upgradeGCMajorMarker_Gecko8To9(marker);
                break;
              default:
                break;
            }
            thread.markers.data[i][dataIndex] = marker;
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionNineRecursive(subprocessProfile);
      }
    }
    convertToVersionNineRecursive(profile);
  },
  [10]: (profile: any) => {
    // Removed the startDate and endDate from DOMEventMarkerPayload and
    // made it a tracing marker instead. DOMEventMarkerPayload is no longer a
    // single marker, it requires a start and an end marker. Therefore, we have
    // to change the old DOMEvent marker and also create an end marker for each
    // DOMEvent.
    function convertToVersionTenRecursive(p: any) {
      for (const thread of p.threads) {
        const { markers } = thread;
        const nameIndex = markers.schema.name;
        const dataIndex = markers.schema.data;
        const timeIndex = markers.schema.time;
        const extraMarkers = [];
        for (let i = 0; i < markers.data.length; i++) {
          const marker = markers.data[i];
          const name = thread.stringTable[marker[nameIndex]];
          const data = marker[dataIndex];
          if (name === 'DOMEvent' && data.type !== 'tracing') {
            const endMarker = [];
            endMarker[dataIndex] = {
              type: 'tracing',
              category: 'DOMEvent',
              timeStamp: data.timeStamp,
              interval: 'end',
              eventType: data.eventType,
              phase: data.phase,
            };
            endMarker[timeIndex] = data.endTime;
            endMarker[nameIndex] = marker[nameIndex];
            extraMarkers.push(endMarker);

            marker[timeIndex] = data.startTime;
            marker[dataIndex] = {
              type: 'tracing',
              category: 'DOMEvent',
              timeStamp: data.timeStamp,
              interval: 'start',
              eventType: data.eventType,
              phase: data.phase,
            };
          }
        }

        // Add all extraMarkers to the end of the markers array. In the Gecko
        // profile format, markers don't need to be sorted by time.
        markers.data = markers.data.concat(extraMarkers);
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionTenRecursive(subprocessProfile);
      }
    }
    convertToVersionTenRecursive(profile);
  },
  [11]: (profile: any) => {
    // Ensure there is always a pid in the profile meta AND upgrade
    // profile.meta categories.

    // This first upgrader ensures there is always a PID. The PID has been included
    // in the Gecko profile version for quite a while, but there has never been
    // an upgrader ensuring that one exists. This pid upgrader is piggy-backing on
    // version 11, but is unrelated to the actual version bump. If no pid number exists,
    // then a unique string label is created.
    let unknownPid = 0;
    function ensurePidsRecursive(p: any) {
      for (const thread of p.threads) {
        if (thread.pid === null || thread.pid === undefined) {
          thread.pid = `Unknown Process ${++unknownPid}`;
        }
      }
      for (const subprocessProfile of p.processes) {
        ensurePidsRecursive(subprocessProfile);
      }
    }
    ensurePidsRecursive(profile);

    // profile.meta has a new property called "categories", which contains a
    // list of categories, which are objects with "name" and "color" properties.
    // The "category" column in the frameTable now refers to elements in this
    // list.
    //
    // Old category list:
    // https://searchfox.org/mozilla-central/rev/5a744713370ec47969595e369fd5125f123e6d24/js/public/ProfilingStack.h#193-201
    // New category list:
    // [To be inserted once the Gecko change lands in mozilla-central]
    const categories = [
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
    const oldCategoryToNewCategory = {
      [1 << 4 /* OTHER */]: 1 /* Other */,
      [1 << 5 /* CSS */]: 3 /* Layout */,
      [1 << 6 /* JS */]: 2 /* JavaScript */,
      [1 << 7 /* GC */]: 6 /* GC / CC */,
      [1 << 8 /* CC */]: 6 /* GC / CC */,
      [1 << 9 /* NETWORK */]: 7 /* Network */,
      [1 << 10 /* GRAPHICS */]: 4 /* Graphics */,
      [1 << 11 /* STORAGE */]: 1 /* Other */,
      [1 << 12 /* EVENTS */]: 1 /* Other */,
    };
    function convertToVersionElevenRecursive(p: any) {
      p.meta.categories = categories;
      for (const thread of p.threads) {
        const schemaIndexCategory = thread.frameTable.schema.category;
        for (const frame of thread.frameTable.data) {
          if (schemaIndexCategory in frame) {
            if (frame[schemaIndexCategory] !== null) {
              if (frame[schemaIndexCategory] in oldCategoryToNewCategory) {
                frame[schemaIndexCategory] =
                  oldCategoryToNewCategory[frame[schemaIndexCategory]];
              } else {
                frame[schemaIndexCategory] = 1 /* Other*/;
              }
            }
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionElevenRecursive(subprocessProfile);
      }
    }
    convertToVersionElevenRecursive(profile);
  },
  [12]: (profile: any) => {
    // This version will add column numbers to the JS functions and scripts.
    // There is also a new property in the frameTable called "column" which
    // swaps positions with the "category" property.  The new value for
    // "category" in the frameTable schema will be 5.
    const oldSchemaCategoryIndex = 4;
    const newSchemaCategoryIndex = 5;
    function convertToVersionTwelveRecursive(p: any) {
      for (const thread of p.threads) {
        const schemaIndexCategory = thread.frameTable.schema.category;
        for (const frame of thread.frameTable.data) {
          // The following eslint rule is disabled, as it's not worth updating the
          // linting on upgraders, as they are "write once and forget" code.
          /* eslint-disable-next-line no-prototype-builtins */
          if (frame.hasOwnProperty(schemaIndexCategory)) {
            frame[newSchemaCategoryIndex] = frame[oldSchemaCategoryIndex];
            frame[oldSchemaCategoryIndex] = null;
          }
        }
        thread.frameTable.schema.category = newSchemaCategoryIndex;
        thread.frameTable.schema.column = oldSchemaCategoryIndex;
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionTwelveRecursive(subprocessProfile);
      }
    }
    convertToVersionTwelveRecursive(profile);
  },
  [13]: (profile: any) => {
    // The type field on some markers were missing. Renamed category field of
    // VsyncTimestamp and LayerTranslation marker payloads to type and added
    // a type field to Screenshot marker payload.
    function convertToVersionThirteenRecursive(p: any) {
      for (const thread of p.threads) {
        const nameIndex = thread.markers.schema.name;
        const dataIndex = thread.markers.schema.data;
        for (let i = 0; i < thread.markers.data.length; i++) {
          const name = thread.stringTable[thread.markers.data[i][nameIndex]];
          const data = thread.markers.data[i][dataIndex];
          switch (name) {
            case 'VsyncTimestamp':
            case 'LayerTranslation':
            case 'CompositorScreenshot':
              data.type = name;
              delete data.category;
              break;
            default:
              break;
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionThirteenRecursive(subprocessProfile);
      }
    }
    convertToVersionThirteenRecursive(profile);
  },
  [14]: (profile: any) => {
    // Profiles now have a relevantForJS property in the frameTable.
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
    function convertToVersionFourteenRecursive(p: any) {
      for (const thread of p.threads) {
        thread.frameTable.schema = {
          location: 0,
          relevantForJS: 1,
          implementation: 2,
          optimizations: 3,
          line: 4,
          column: 5,
          category: 6,
        };
        const locationIndex = thread.frameTable.schema.location;
        const relevantForJSIndex = thread.frameTable.schema.relevantForJS;
        const stringTable = StringTable.withBackingArray(thread.stringTable);
        for (let i = 0; i < thread.frameTable.data.length; i++) {
          const frameData = thread.frameTable.data[i];
          frameData.splice(relevantForJSIndex, 0, false);

          const location = stringTable.getString(frameData[locationIndex]);
          if (location.startsWith('AutoEntryScript ')) {
            frameData[relevantForJSIndex] = true;
            frameData[locationIndex] = stringTable.indexForString(
              location.substring('AutoEntryScript '.length)
            );
          } else {
            frameData[relevantForJSIndex] = domCallRegex.test(location);
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersionFourteenRecursive(subprocessProfile);
      }
    }
    convertToVersionFourteenRecursive(profile);
  },
  [15]: (profile: any) => {
    // The type field for DOMEventMarkerPayload was renamed to eventType.
    function convertToVersion15Recursive(p: any) {
      for (const thread of p.threads) {
        const stringTable = StringTable.withBackingArray(thread.stringTable);
        if (!stringTable.hasString('DiskIO')) {
          // There are no DiskIO markers.
          continue;
        }

        const fileIoStringIndex = stringTable.indexForString('FileIO');
        const nameIndex = thread.markers.schema.name;
        const dataIndex = thread.markers.schema.data;
        for (let i = 0; i < thread.markers.data.length; i++) {
          const markerData = thread.markers.data[i];
          const payload = markerData[dataIndex];
          if (payload && payload.type === 'DiskIO') {
            markerData[nameIndex] = fileIoStringIndex;
            payload.type = 'FileIO';
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersion15Recursive(subprocessProfile);
      }
    }
    convertToVersion15Recursive(profile);
  },
  [16]: (profile: any) => {
    // profile.meta.categories now has a subcategories property on each element,
    // with an array of subcategories for that category.
    // And the frameTable has another column, subcategory.
    function convertToVersion16Recursive(p: any) {
      for (const category of p.meta.categories) {
        category.subcategories = ['Other'];
      }
      for (const thread of p.threads) {
        const { frameTable } = thread;
        frameTable.schema.subcategory = 7;
        for (
          let frameIndex = 0;
          frameIndex < frameTable.data.length;
          frameIndex++
        ) {
          // Set a non-null subcategory on every frame that has a non-null category.
          // The subcategory is going to be subcategory 0, the "Other" subcategory.
          const category =
            frameTable.data[frameIndex][frameTable.schema.category];
          if (category) {
            frameTable.data[frameIndex][frameTable.schema.subcategory] = 0;
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersion16Recursive(subprocessProfile);
      }
    }
    convertToVersion16Recursive(profile);

    // -------------------------------------------------------------------------
    // Retro-actively upgrade Gecko profiles that don't have marker categories.
    // This happened sometime before version 16.

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

    function addMarkerCategoriesRecursively(p: any) {
      for (const thread of p.threads) {
        const { markers, stringTable } = thread;
        if (markers.schema.category !== undefined) {
          // There is nothing to upgrade, do not continue.
          return;
        }
        markers.schema.category = 3;
        for (
          let markerIndex = 0;
          markerIndex < markers.data.length;
          markerIndex++
        ) {
          const nameIndex = markers.data[markerIndex][markers.schema.name];
          const data = markers.data[markerIndex][markers.schema.data];

          let key: string = stringTable[nameIndex];
          if (data && data.type) {
            key = data.type === 'tracing' ? data.category : data.type;
          }
          let categoryIndex = keyToCategoryIndex.get(key);
          if (categoryIndex === undefined) {
            categoryIndex = otherCategory;
          }

          markers.data[markerIndex][markers.schema.category] = categoryIndex;
        }
      }
      for (const subprocessProfile of p.processes) {
        addMarkerCategoriesRecursively(subprocessProfile);
      }
    }
    addMarkerCategoriesRecursively(profile);
  },
  [17]: (profile: any) => {
    // Previously, we had DocShell ID and DocShell History ID in the page object
    // to identify a specific page. We changed these IDs in the gecko side to
    // Browsing Context ID and Inner Window ID. Inner Window ID is enough to
    // identify a specific frame now. We were keeping two field in marker
    // payloads, but now we are only keeping innerWindowID. Browsing Context IDs
    // are necessary to identify which frame belongs to which tab. Browsing
    // Contexts doesn't change after a navigation.
    let browsingContextID = 1;
    let innerWindowID = 1;
    function convertToVersion17Recursive(p: any) {
      if (p.pages && p.pages.length > 0) {
        // It's not possible to have a marker belongs to a different DocShell in
        // different processes currently(pre-fission). It's not necessary to put
        // those maps outside of the function.
        const oldKeysToNewKey: Map<string, number> = new Map();
        const docShellIDtoBrowsingContextID: Map<string, number> = new Map();

        for (const page of p.pages) {
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

        for (const thread of p.threads) {
          const { markers } = thread;
          const dataIndex = markers.schema.data;
          for (let i = 0; i < thread.markers.data.length; i++) {
            const markerData = thread.markers.data[i];
            const payload = markerData[dataIndex];

            if (
              payload &&
              payload.docShellId !== undefined &&
              payload.docshellHistoryId !== undefined
            ) {
              const newKey = oldKeysToNewKey.get(
                `d${payload.docShellId}h${payload.docshellHistoryId}`
              );
              if (newKey === undefined) {
                console.error(
                  'No page found with given docShellId and historyId'
                );
              } else {
                // We don't need to add the browsingContextID here because we
                // only need innerWindowID since it's unique for each page.
                payload.innerWindowID = newKey;
              }

              delete payload.docShellId;
              delete payload.docshellHistoryId;
            }
          }
        }
      }

      for (const subprocessProfile of p.processes) {
        convertToVersion17Recursive(subprocessProfile);
      }
    }
    convertToVersion17Recursive(profile);
  },
  [18]: (profile: any) => {
    // Due to a bug in gecko side, we were keeping the sample_group inside an
    // object instead of an array. Usually there is only one sample group, that's
    // why it wasn't a problem before. To future proof it, we are fixing it by
    // moving it inside an array. See: https://bugzilla.mozilla.org/show_bug.cgi?id=1584190
    function convertToVersion18Recursive(p: any) {
      if (p.counters && p.counters.length > 0) {
        for (const counter of p.counters) {
          // It's possible to have an empty sample_groups object due to gecko bug.
          // Remove it if that's the case.
          if ('samples' in counter.sample_groups) {
            counter.sample_groups = [counter.sample_groups];
          } else {
            counter.sample_groups = [];
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersion18Recursive(subprocessProfile);
      }
    }
    convertToVersion18Recursive(profile);
  },
  [19]: (profile: any) => {
    // Profiles now have an innerWindowID property in the frameTable.
    // We are filling this array with 0 values because we have no idea what that value might be.
    function convertToVersion19Recursive(p: any) {
      for (const thread of p.threads) {
        const { frameTable } = thread;
        frameTable.schema = {
          location: 0,
          relevantForJS: 1,
          innerWindowID: 2,
          implementation: 3,
          optimizations: 4,
          line: 5,
          column: 6,
          category: 7,
          subcategory: 8,
        };
        for (
          let frameIndex = 0;
          frameIndex < frameTable.data.length;
          frameIndex++
        ) {
          // Adding 0 for every frame.
          const innerWindowIDIndex = frameTable.schema.innerWindowID;
          frameTable.data[frameIndex].splice(innerWindowIDIndex, 0, 0);
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersion19Recursive(subprocessProfile);
      }
    }
    convertToVersion19Recursive(profile);
  },
  [20]: (profile: any) => {
    // The idea of phased markers was added to profiles. This upgrader removes the `time`
    // field from markers and replaces it with startTime, endTime and phase.
    //
    // It also removes the startTime and endTime from payloads, except for IPC and
    // Network markers.
    type OldSchema = { name: 0; time: 1; category: 2; data: 3 };
    type Payload = $Shape<{
      startTime: number;
      endTime: number;
      type: string;
      interval: string;
    }>;

    const INSTANT = 0;
    const INTERVAL = 1;
    const INTERVAL_START = 2;
    const INTERVAL_END = 3;

    function convertToVersion20Recursive(p: any) {
      for (const thread of p.threads) {
        const { markers } = thread;
        const oldSchema: OldSchema = markers.schema;
        const newSchema = {
          name: 0,
          startTime: 1,
          endTime: 2,
          phase: 3,
          category: 4,
          data: 5,
        };
        markers.schema = newSchema;

        for (
          let markerIndex = 0;
          markerIndex < markers.data.length;
          markerIndex++
        ) {
          const markerTuple = markers.data[markerIndex];
          const name: number = markerTuple[oldSchema.name];
          const time: number = markerTuple[oldSchema.time];
          const category: number = markerTuple[oldSchema.category];
          const data: Payload = markerTuple[oldSchema.data];

          let newStartTime: null | number = time;
          let newEndTime: null | number = null;
          let phase: 0 | 1 | 2 | 3 = INSTANT;

          // If there is a payload, it MAY change to an interval marker.
          if (data) {
            const { startTime, endTime, type, interval } = data;
            if (type === 'tracing') {
              if (interval === 'start') {
                newStartTime = time;
                newEndTime = null;
                phase = INTERVAL_START;
              } else if (interval === 'end') {
                newStartTime = null;
                newEndTime = time;
                phase = INTERVAL_END;
              } else {
                // The interval property could also be inexistant. In that case we
                // decide this is an instance marker.
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

          // Rewrite the tuple with our new data.
          const newTuple = [];
          newTuple[newSchema.name] = name;
          newTuple[newSchema.startTime] = newStartTime;
          newTuple[newSchema.endTime] = newEndTime;
          newTuple[newSchema.phase] = phase;
          newTuple[newSchema.category] = category;
          newTuple[newSchema.data] = data;
          markers.data[markerIndex] = newTuple;
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersion20Recursive(subprocessProfile);
      }
    }
    convertToVersion20Recursive(profile);
  },
  [21]: (profile: any) => {
    // Migrate DOMEvent markers to Markers 2.0

    // This is a fairly permissive type, but helps ensure the logic below is type checked.
    type DOMEventPayload20_to_21 = {
      // Tracing -> DOMEvent
      type: 'tracing' | 'DOMEvent';
      category: 'DOMEvent';
      eventType: string;
      // These are removed:
      timeStamp?: number;
      // This gets added:
      latency: number;
    };

    type UnknownArityTuple = any[];

    type ProfileV20 = {
      threads: Array<{
        markers: {
          data: UnknownArityTuple[];
          schema: { name: number; startTime: number; data: number };
        };
      }>;
      processes: ProfileV20[];
    };

    // DOMEvents are tracing markers with a little bit more information about them,
    // so it was easier to migrate them with a profile upgrader.
    function convertToVersion21Recursive(p: ProfileV20) {
      for (const thread of p.threads) {
        const { markers } = thread;

        for (
          let markerIndex = 0;
          markerIndex < markers.data.length;
          markerIndex++
        ) {
          const markerTuple = markers.data[markerIndex];
          const payload: DOMEventPayload20_to_21 =
            markerTuple[markers.schema.data];
          if (
            payload &&
            payload.type === 'tracing' &&
            payload.category === 'DOMEvent'
          ) {
            const startTime: number = markerTuple[markers.schema.startTime];

            // Mutate the payload to limit GC.
            payload.type = 'DOMEvent';
            if (payload.timeStamp !== undefined) {
              payload.latency = startTime - payload.timeStamp;
            }
            delete payload.timeStamp;
          }
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersion21Recursive(subprocessProfile);
      }
    }
    convertToVersion21Recursive(profile);
  },
  [22]: (untypedProfile: any) => {
    // The marker schema, which details how to display markers was added. Back-fill
    // any old profiles with a default schema.
    type GeckoProfileVersion20To21 = {
      meta: { markerSchema: unknown };
      processes: GeckoProfileVersion20To21[];
    };
    const geckoProfile: GeckoProfileVersion20To21 = untypedProfile;

    // Provide the primary marker schema list in the parent process.
    geckoProfile.meta.markerSchema = [
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
      // There is a processed profile format upgrader (version 52) which adds the
      // "tracing" schema for profiles which don't have it.
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
        // output. Firefox (as of Jan 2026) is still using Text markers and does
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

    for (const processes of geckoProfile.processes) {
      // We only need the marker schema in the parent process, as the front-end
      // de-duplicates each process' schema.
      processes.meta.markerSchema = [];
    }
  },
  [23]: (profile: any) => {
    // The browsingContextID inside the pages array and activeBrowsingContextID
    // have been renamed to tabID and activeTabID.
    // Previously, we were using the browsingcontextID to figure out which tab
    // that page belongs to. But that had some shortcomings. For example it
    // wasn't workig correctly on cross-group navigations, because browsingContext
    // was being replaced during that. So, we had to get a better number to
    // indicate the tabIDs. With the back-end work, we are not getting the
    // browserId, which corresponds to ID of a tab directly. See the back-end
    // bug for more details: https://bugzilla.mozilla.org/show_bug.cgi?id=1698129
    function convertToVersion23Recursive(p: any) {
      if (
        profile.meta.configuration &&
        profile.meta.configuration.activeBrowsingContextID
      ) {
        profile.meta.configuration.activeTabID =
          profile.meta.configuration.activeBrowsingContextID;
        delete profile.meta.configuration.activeBrowsingContextID;
      }

      if (p.pages && p.pages.length > 0) {
        for (const page of p.pages) {
          // Directly copy the value of browsingContextID to tabID.
          page.tabID = page.browsingContextID;
          delete page.browsingContextID;
        }
      }

      for (const subprocessProfile of p.processes) {
        convertToVersion23Recursive(subprocessProfile);
      }
    }
    convertToVersion23Recursive(profile);
  },
  [24]: (_: any) => {
    // This version bumps happened when a new end status "STATUS_CANCELED"
    // appeared for network markers, to ensure that a new version of the
    // frontend will handle it.
    // No upgrade is needed though, because previous versions of firefox weren't
    // generating anything in this case.
  },
  [25]: (_: any) => {
    // This version bumps happened when private browsing data could be captured
    // by the profiler. We want to ensure that the frontend will be able to
    // sanitize it if needed.
    // No upgrade is needed though, because previous versions of firefox weren't
    // capturing this data and no new mandatory values are present in this
    // version.
  },
  [26]: (profile: any) => {
    // `searchable` property in the marker schema wasn't implemented before and
    // we had some manual checks for the marker fields below. With this version,
    // we removed this manual check and started to use the `searchable` property
    // of the marker schema.
    function convertToVersion26Recursive(p: any) {
      for (const schema of p.meta.markerSchema) {
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

      for (const subprocessProfile of p.processes) {
        convertToVersion26Recursive(subprocessProfile);
      }
    }

    convertToVersion26Recursive(profile);
  },
  [27]: (profile: any) => {
    // The "optimizations" column was removed from the frame table.
    function convertToVersion27Recursive(p: any) {
      for (const thread of p.threads) {
        delete thread.frameTable.schema.optimizations;
      }

      for (const subprocessProfile of p.processes) {
        convertToVersion27Recursive(subprocessProfile);
      }
    }
    convertToVersion27Recursive(profile);
  },
  [28]: (_: any) => {
    // This version bump added a new marker schema format type, named "unique-string",
    // which older frontends will not be able to display.
    // No upgrade is needed, as older versions of firefox would not generate
    // marker data with unique-string typed data, and no modification is needed in the
    // frontend to display older formats.
  },
  [29]: (profile: any) => {
    // Remove the 'sample_groups' object from the GeckoCounter structure.
    function convertToVersion29Recursive(p: any) {
      if (p.counters && p.counters.length > 0) {
        for (const counter of p.counters) {
          if (!counter.sample_groups) {
            // Running Firefox 121 with external power counters coming from an
            // already updated script may result in this code seeing already
            // upgraded counters; ignore them.
            continue;
          }
          counter.samples = counter.sample_groups[0].samples;
          delete counter.sample_groups;
        }
      }
      for (const subprocessProfile of p.processes) {
        convertToVersion29Recursive(subprocessProfile);
      }
    }
    convertToVersion29Recursive(profile);
  },
  [30]: (_: any) => {
    // This version bump added a new marker schema format type, named "sanitized-string",
    // which older frontends will not be able to display.
    // No upgrade is needed, as older versions of firefox would not generate
    // marker data with sanitized-string typed data, and no modification is needed in the
    // frontend to display older formats.
  },
  [31]: (_: any) => {
    // This version bump added two new form types for new marker schema field:
    // "flow-id" and "terminating-flow-id".
    // Older frontends will not be able to display these fields.
    // Furthermore, the marker schema itself has an optional isStackBased field.
    // No upgrade is needed, as older versions of firefox would not generate
    // marker data with the new field types data, and no modification is needed in the
    // frontend to display older formats.
  },

  // If you add a new upgrader here, please document the change in
  // `docs-developer/CHANGELOG-formats.md`.
};
/* eslint-enable no-useless-computed-key */
