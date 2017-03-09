// @flow
import { UniqueStringArray } from './unique-string-array';
import { resourceTypes } from './profile-data';

/**
 * The "old cleopatra format" is the profile format that was used by the
 * cleopatra version before the big rewrite. Profiles of this format are still
 * in the profile store, and there are links to those profiles strewn across
 * bugzilla. We want to be able to display those profiles.
 * This file's purpose is to convert "old cleopatra" profiles into
 * preprocessed profiles of "preprocessed profile format" version zero.
 * The result will be run through the preprocessed profile format
 * compatibility conversion. Consequently, when the preprocessed profile
 * format changes, this file does not need to be touched and instead we will
 * automatically take advantage of the preprocess profile format conversion.
 * 
 * A lot of this code will remind you of very similar code in
 * preprocess-profile.js. However, we intentionally do not share code with it:
 * We want preprocess-profile to be exclusively concerned with converting the
 * most recent raw profile format into the most recent preprocessed profile
 * format.
 * Some of the code below is basically a snapshot of the preprocessing code as
 * it was before the versioning scheme was introduced.
 */

export function isOldCleopatraFormat(profile: Object): boolean {
  return 'format' in profile &&
    profile.format === 'profileJSONWithSymbolicationTable,1';
}

type OldCleopatraMarker = {
  name: string,
  data: ?Object,
  time: number,
};

type OldCleopatraSample = {
  frames: number[],
  extraInfo: Object,
};

type OldCleopatraProfileThread = {
  samples: OldCleopatraSample[],
  markers: OldCleopatraMarker[],
  name: string,
};

type OldCleopatraProfileJSON = {
  threads: { [threadIndex: string]: OldCleopatraProfileThread },
};

type OldCleopatraProfile = {
  format: 'profileJSONWithSymbolicationTable,1',
  meta: Object,
  profileJSON: OldCleopatraProfileJSON,
  symbolicationTable: { [symbolIndex: string]: string },
};

function _getRealScriptURI(url: ?string) {
  if (url) {
    const urls = url.split(' -> ');
    return urls[urls.length - 1];
  }
  return url;
}

function _cleanFunctionName(functionName: string) {
  const ignoredPrefix = 'non-virtual thunk to ';
  if (functionName.startsWith && functionName.startsWith(ignoredPrefix)) {
    return functionName.substr(ignoredPrefix.length);
  }
  return functionName;
}

function _convertThread(thread: OldCleopatraProfileThread, symbolicationTable) {
  const stringTable = new UniqueStringArray(symbolicationTable);
  const frameTable = {
    length: 0,
    category: [],
    location: [],
    implementation: [],
    line: [],
    optimizations: [],
    func: undefined,
    address: undefined,
  };
  const stackTable = {
    length: 0,
    frame: [],
    prefix: [],
  };
  const samples = {
    length: 0,
    frameNumber: [],
    responsiveness: [],
    rss: [],
    stack: [],
    time: [],
    uss: [],
  };
  const markers = {
    length: 0,
    data: [],
    name: [],
    time: [],
  };

  const frameMap = new Map();
  const stackMap = new Map();

  for (let i = 0; i < thread.samples.length; i++) {
    const sample = thread.samples[i];
    // sample has the shape: {
    //   frames: [symbolicationTableIndices for the stack frames]
    //   extraInfo: {
    //     responsiveness,
    //     time,
    //   }
    // }
    //
    // We map every stack frame to a frame.
    // Then we walk the stack, creating "stacks" (= (prefix stack, frame) pairs)
    // as needed, and arrive at the sample's stackIndex.
    const frames = sample.frames;
    let prefix = null;
    for (let i = 0; i < frames.length; i++) {
      const frameSymbolicationTableIndex = frames[i];
      let frameIndex = frameMap.get(frameSymbolicationTableIndex);
      if (frameIndex === undefined) {
        frameIndex = frameTable.length++;
        frameTable.location[frameIndex] = frameSymbolicationTableIndex;
        frameTable.category[frameIndex] = null;
        frameTable.implementation[frameIndex] = null;
        frameTable.line[frameIndex] = null;
        frameTable.optimizations[frameIndex] = null;
        frameMap.set(frameSymbolicationTableIndex, frameIndex);
      }
      const stackMapKey = prefix !== null
        ? `${prefix}:${frameIndex}`
        : `:${frameIndex}`;
      let stackIndex = stackMap.get(stackMapKey);
      if (stackIndex === undefined) {
        stackIndex = stackTable.length++;
        stackTable.prefix[stackIndex] = prefix;
        stackTable.frame[stackIndex] = frameIndex;
        stackMap.set(stackMapKey, stackIndex);
      }
      prefix = stackIndex;
    }
    const sampleIndex = samples.length++;
    samples.stack[sampleIndex] = prefix;
    samples.time[sampleIndex] = 'time' in sample.extraInfo
      ? sample.extraInfo.time
      : null;
    samples.responsiveness[sampleIndex] = 'responsiveness' in sample.extraInfo
      ? sample.extraInfo.responsiveness
      : null;
    samples.frameNumber[sampleIndex] = 'frameNumber' in sample.extraInfo
      ? sample.extraInfo.frameNumber
      : null;
    samples.rss[sampleIndex] = 'rss' in sample.extraInfo
      ? sample.extraInfo.rss
      : null;
    samples.uss[sampleIndex] = 'uss' in sample.extraInfo
      ? sample.extraInfo.uss
      : null;
  }

  for (let i = 0; i < thread.markers.length; i++) {
    const marker = thread.markers[i];
    const markerIndex = markers.length++;
    markers.data[markerIndex] = marker.data;
    markers.name[markerIndex] = stringTable.indexForString(marker.name);
    markers.time[markerIndex] = marker.time;
  }

  const funcTable = {
    length: 0,
    name: [],
    resource: [],
    address: [],
    isJS: [],
  };
  function addFunc(name, resource, address, isJS) {
    const index = funcTable.length++;
    funcTable.name[index] = name;
    funcTable.resource[index] = resource;
    funcTable.address[index] = address;
    funcTable.isJS[index] = isJS;
  }
  const resourceTable = {
    length: 0,
    type: [],
    name: [],
    lib: [],
    icon: [],
    addonId: [],
  };
  function addLibResource(name, lib) {
    const index = resourceTable.length++;
    resourceTable.type[index] = resourceTypes.library;
    resourceTable.name[index] = name;
    resourceTable.lib[index] = lib;
  }
  function addURLResource(url) {
    const index = resourceTable.length++;
    resourceTable.type[index] = resourceTypes.url;
    resourceTable.name[index] = url;
  }

  const libNameToResourceIndex = new Map();
  const urlToResourceIndex = new Map();
  const stringTableIndexToNewFuncIndex = new Map();

  frameTable.func = frameTable.location.map(locationIndex => {
    let funcNameIndex = locationIndex;
    let funcIndex = stringTableIndexToNewFuncIndex.get(funcNameIndex);
    if (funcIndex !== undefined) {
      return funcIndex;
    }

    let resourceIndex = -1;
    const addressRelativeToLib = -1;
    let isJS = false;
    const locationString = stringTable.getString(funcNameIndex);
    if (!locationString.startsWith('0x')) {
      const cppMatch = /^(.*) \(in ([^)]*)\) (\+ [0-9]+)$/.exec(
        locationString
      ) ||
        /^(.*) \(in ([^)]*)\) (\(.*:.*\))$/.exec(locationString) ||
        /^(.*) \(in ([^)]*)\)$/.exec(locationString);
      if (cppMatch) {
        funcNameIndex = stringTable.indexForString(
          _cleanFunctionName(cppMatch[1])
        );
        const libraryNameStringIndex = stringTable.indexForString(cppMatch[2]);
        funcIndex = stringTableIndexToNewFuncIndex.get(funcNameIndex);
        if (funcIndex !== undefined) {
          return funcIndex;
        }
        if (libNameToResourceIndex.has(libraryNameStringIndex)) {
          resourceIndex = libNameToResourceIndex.get(libraryNameStringIndex);
        } else {
          resourceIndex = resourceTable.length;
          libNameToResourceIndex.set(libraryNameStringIndex, resourceIndex);
          addLibResource(libraryNameStringIndex, -1);
        }
      } else {
        const jsMatch = /^(.*) \((.*):([0-9]+)\)$/.exec(locationString) ||
          /^()(.*):([0-9]+)$/.exec(locationString);
        if (jsMatch) {
          isJS = true;
          const scriptURI = _getRealScriptURI(jsMatch[2]);
          if (urlToResourceIndex.has(scriptURI)) {
            resourceIndex = urlToResourceIndex.get(scriptURI);
          } else {
            resourceIndex = resourceTable.length;
            urlToResourceIndex.set(scriptURI, resourceIndex);
            const urlStringIndex = stringTable.indexForString(scriptURI);
            addURLResource(urlStringIndex);
          }
        }
      }
    }
    funcIndex = funcTable.length;
    addFunc(funcNameIndex, resourceIndex, addressRelativeToLib, isJS);
    stringTableIndexToNewFuncIndex.set(funcNameIndex, funcIndex);
    return funcIndex;
  });
  frameTable.address = frameTable.func.map(
    funcIndex => funcTable.address[funcIndex]
  );
  delete frameTable.location;

  let threadName = thread.name;
  let processType;
  if (threadName === 'Content') {
    processType = 'tab';
  } else if (threadName === 'Plugin') {
    processType = 'plugin';
  } else {
    processType = 'default';
  }

  if (threadName === 'Content') {
    threadName = 'GeckoMain';
  }

  return {
    libs: [],
    name: threadName,
    processType,
    frameTable,
    funcTable,
    resourceTable,
    stackTable,
    markers,
    samples,
    stringArray: stringTable.serializeToArray(),
  };
}

function arrayFromArrayLikeObject<T>(obj: { [index: string]: T }): T[] {
  const result: T[] = [];
  for (const index in obj) {
    result[+index] = obj[index];
  }
  return result;
}

/**
 * Convert the old cleopatra format into the serialized preprocessed format
 * version zero.
 * @param {object} profile The input profile.
 * @returns A "preprocessed" profile that needs to be run through the
 *          "preprocessed format" compatibility conversion.
 */
export function convertOldCleopatraProfile(
  profile: OldCleopatraProfile
): Object {
  const { meta, profileJSON } = profile;

  const threads = arrayFromArrayLikeObject(profileJSON.threads);
  const symbolicationTable = arrayFromArrayLikeObject(
    profile.symbolicationTable
  );

  return {
    meta,
    threads: threads.map(t => _convertThread(t, symbolicationTable)),
    tasktracer: {
      taskTable: {
        length: 0,
        dispatchTime: [],
        sourceEventId: [],
        sourceEventType: [],
        parentTaskId: [],
        beginTime: [],
        processId: [],
        threadIndex: [],
        endTime: [],
        ipdlMsg: [],
        label: [],
        address: [],
      },
      tasksIdToTaskIndexMap: new Map(),
      stringArray: [],
      addressTable: {
        length: 0,
        address: [],
        className: [],
        lib: [],
      },
      addressIndicesByLib: new Map(),
      threadTable: {
        length: 0,
        tid: [],
        name: [],
        start: [],
      },
      tidToThreadIndexMap: new Map(),
    },
  };
}
