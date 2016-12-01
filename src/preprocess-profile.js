import { getContainingLibrary, getClosestLibrary } from './symbolication';
import { UniqueStringArray } from './unique-string-array';
import { resourceTypes } from './profile-data';
import { provideHostSide } from './promise-worker';

/**
 * Module for converting a profile into the 'preprocessed' format.
 * @module preprocess-profile
 */

/**
 * Turn a data table from the form `{ schema, data }` (as used in the raw profile
 * JSON) into a struct of arrays. This isn't very nice to read, but it
 * drastically reduces the number of JS objects the JS engine has to deal with,
 * resulting in fewer GC pauses and hopefully better performance.
 *
 * @param {object} rawTable A data table of the form `{ schema, data }`.
 * @return {object} A data table of the form `{ length: number, field1: array, field2: array }`
 */
function toStructOfArrays(rawTable) {
  const result = { length: rawTable.data.length };
  for (const fieldName in rawTable.schema) {
    const fieldIndex = rawTable.schema[fieldName];
    result[fieldName] = rawTable.data.map(entry => (fieldIndex in entry) ? entry[fieldIndex] : null);
  }
  return result;
}

// JS File information sometimes comes with multiple URIs which are chained
// with " -> ". We only want the last URI in this list.
function getRealScriptURI(url) {
  if (url) {
    const urls = url.split(' -> ');
    return urls[urls.length - 1];
  }
  return url;
}

function preprocessThreadStageOne(thread) {
  const stringTable = new UniqueStringArray(thread.stringTable);
  const frameTable = toStructOfArrays(thread.frameTable);
  const stackTable = toStructOfArrays(thread.stackTable);
  const samples = toStructOfArrays(thread.samples);
  const markers = toStructOfArrays(thread.markers);
  return Object.assign({}, thread, {
    frameTable, stackTable, markers, stringTable, samples,
  });
}


function cleanFunctionName(functionName) {
  const ignoredPrefix = 'non-virtual thunk to ';
  if (functionName.startsWith && functionName.startsWith(ignoredPrefix)) {
    return functionName.substr(ignoredPrefix.length);
  }
  return functionName;
}

function preprocessThreadStageTwo(thread, libs) {
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

  const { stringTable, frameTable, stackTable, samples, markers } = thread;

  const libToResourceIndex = new Map();
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
    let addressRelativeToLib = -1;
    let isJS = false;
    const locationString = stringTable.getString(funcNameIndex);
    if (locationString.startsWith('0x')) {
      const address = parseInt(locationString.substr(2), 16);
      const lib = getContainingLibrary(libs, address);
      if (lib) {
        addressRelativeToLib = address - lib.start;
        if (libToResourceIndex.has(lib)) {
          resourceIndex = libToResourceIndex.get(lib);
        } else {
          resourceIndex = resourceTable.length;
          libToResourceIndex.set(lib, resourceIndex);
          const nameStringIndex = stringTable.indexForString(lib.pdbName);
          addLibResource(nameStringIndex, libs.indexOf(lib));
        }
      }
    } else {
      const cppMatch = 
        /^(.*) \(in ([^)]*)\) (\+ [0-9]+)$/.exec(locationString) ||
        /^(.*) \(in ([^)]*)\) (\(.*:.*\))$/.exec(locationString) ||
        /^(.*) \(in ([^)]*)\)$/.exec(locationString);
      if (cppMatch) {
        funcNameIndex = stringTable.indexForString(cleanFunctionName(cppMatch[1]));
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
        const jsMatch =
          /^(.*) \((.*):([0-9]+)\)$/.exec(locationString) ||
          /^()(.*):([0-9]+)$/.exec(locationString);
        if (jsMatch) {
          isJS = true;
          const scriptURI = getRealScriptURI(jsMatch[2]);
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
  frameTable.address = frameTable.func.map(funcIndex => funcTable.address[funcIndex]);
  delete frameTable.location;

  return Object.assign({}, thread, {
    libs, frameTable, funcTable, resourceTable, stackTable, markers, stringTable, samples,
  });
}

/**
 * Convert the given thread into preprocessed form. See docs/profile-data.md for more
 * information.
 * @param {object} thread The thread object, in the 'raw' format.
 * @param {array} libs A libs array, in preprocessed format (as returned by preprocessSharedLibraries).
 * @return {object} A new thread object in the 'preprocessed' format.
 */
function preprocessThread(thread, libs) {
  return preprocessThreadStageTwo(preprocessThreadStageOne(thread), libs);
}

/**
 * Ensure every lib has pdbName and breakpadId fields, and sort them by start address.
 * @param {string} libs The sharedLibrary JSON string as found in a profile in the 'raw' format.
 * @return {array} An array of lib objects, sorted by startAddress.
 */
function preprocessSharedLibraries(libs) {
  return JSON.parse(libs).map(lib => {
    let pdbName, breakpadId;
    if ('breakpadId' in lib) {
      pdbName = lib.name.substr(lib.name.lastIndexOf('/') + 1);
      breakpadId = lib.breakpadId;
    } else {
      pdbName = lib.pdbName;
      const pdbSig = lib.pdbSignature.replace(/[{}-]/g, '').toUpperCase();
      breakpadId = pdbSig + lib.pdbAge;
    }
    return Object.assign({}, lib, { pdbName, breakpadId });
  }).sort((a, b) => a.start - b.start);
}

function emptyTaskTracerData() {
  return {
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
      label: [],
      address: [],
    },
    tasksIdToTaskIndexMap: new Map(),
    stringTable: new UniqueStringArray(),
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
  };
}

function addPreprocessedTaskTracerData(tasktracer, result, libs, startTime) {
  const { data, start, threads } = tasktracer;

  const {
    taskTable, tasksIdToTaskIndexMap, stringTable,
    addressIndicesByLib, addressTable,
    threadTable, tidToThreadIndexMap,
  } = result;

  for (const thread of threads) {
    const threadIndex = threadTable.length++;
    threadTable.tid[threadIndex] = thread.tid;
    threadTable.name[threadIndex] = stringTable.indexForString(thread.name);
    threadTable.start[threadIndex] = start;
    tidToThreadIndexMap.set(thread.tid, threadIndex);
  }

  const addressIndicesByAddress = new Map();

  for (let i = 0; i < data.length; i++) {
    const line = data[i];

    // All lines are of the form <digit> ' ' <taskId> [' ' <additional fields>]*
    // <digit> describes the type of the line.
    const firstSpacePos = 1;
    const secondSpacePos = line.indexOf(' ', firstSpacePos + 1);

    // taskIds are stored as JS strings, because they are originally uint64_t.
    const taskId = line.substring(firstSpacePos + 1, secondSpacePos);
    let taskIndex = tasksIdToTaskIndexMap.get(taskId);
    if (taskIndex === undefined) {
      taskIndex = taskTable.length++;
      tasksIdToTaskIndexMap.set(taskId, taskIndex);
    }

    switch (line.charAt(0)) {
      case '0': // DISPATCH, '0 taskId dispatchTime sourceEventId sourceEventType parentTaskId'
        {
          const thirdSpacePos = line.indexOf(' ', secondSpacePos + 1);
          const fourthSpacePos = line.indexOf(' ', thirdSpacePos + 1);
          const fifthSpacePos = line.indexOf(' ', fourthSpacePos + 1);
          taskTable.dispatchTime[taskIndex] = Math.round(+line.substring(secondSpacePos + 1, thirdSpacePos) - startTime);
          taskTable.sourceEventId[taskIndex] = line.substring(thirdSpacePos + 1, fourthSpacePos);
          taskTable.sourceEventType[taskIndex] = line.substring(fourthSpacePos + 1, fifthSpacePos)|0;
          taskTable.parentTaskId[taskIndex] = line.substring(fifthSpacePos + 1);
        }
        break;
      case '1': // BEGIN, '1 taskId beginTime processId threadId'
        {
          const thirdSpacePos = line.indexOf(' ', secondSpacePos + 1);
          const fourthSpacePos = line.indexOf(' ', thirdSpacePos + 1);
          taskTable.beginTime[taskIndex] = Math.round(+line.substring(secondSpacePos + 1, thirdSpacePos) - startTime);
          taskTable.processId[taskIndex] = line.substring(thirdSpacePos + 1, fourthSpacePos);
          const tid = +line.substring(fourthSpacePos + 1);
          let threadIndex = tidToThreadIndexMap.get(tid);
          if (threadIndex === undefined) {
            threadIndex = threadTable.length++;
            threadTable.tid[threadIndex] = tid;
            threadTable.name[threadIndex] = stringTable.indexForString(`Thread ${tid}`);
            threadTable.start[threadIndex] = start;
            tidToThreadIndexMap.set(tid, threadIndex);
          }
          taskTable.threadIndex[taskIndex] = threadIndex;
        }
        break;
      case '2': // END, '2 taskId endTime'
        taskTable.endTime[taskIndex] = Math.round(+line.substring(secondSpacePos + 1) - startTime);
        break;
      case '3': // ADD_LABEL, '3 taskId labelTime "label"'
        {
          const thirdSpacePos = line.indexOf(' ', secondSpacePos + 1);
          const label = line.substring(thirdSpacePos + 1 + 1, line.length - 1);
          taskTable.label[taskIndex] = stringTable.indexForString(label);
        }
        break;
      case '4': // GET_VTABLE, '4 taskId address'
        {
          const hexAddress = line.substring(secondSpacePos + 1);
          const address = parseInt(hexAddress, 16);
          let addressIndex = addressIndicesByAddress.get(address);
          if (addressIndex === undefined) {
            addressIndex = addressTable.length++;
            const lib = getClosestLibrary(libs, address);
            let stringIndex;
            let addressRelativeToLib = -1;
            if (lib) {
              addressRelativeToLib = address - lib.start;
              stringIndex = stringTable.indexForString(`<0x${addressRelativeToLib.toString(16)} in ${lib.pdbName}>`);
              let addressIndicesForThisLib = addressIndicesByLib.get(lib);
              if (addressIndicesForThisLib === undefined) {
                addressIndicesForThisLib = [];
                addressIndicesByLib.set(lib, addressIndicesForThisLib);
              }
              addressIndicesForThisLib.push(addressIndex);
            } else {
              stringIndex = stringTable.indexForString(`<unknown 0x${hexAddress}>`);
            }
            addressIndicesByAddress.set(address, addressIndex);
            addressTable.address[addressIndex] = addressRelativeToLib;
            addressTable.className[addressIndex] = stringIndex;
            addressTable.lib[addressIndex] = lib;
          }
          taskTable.address[taskIndex] = addressIndex;
        }
        break;
      default:
        break;
    }
  }
}

/**
 * Adjust the "time" field by the given delta.
 * @param {object} samplesOrMarkers The table of samples/markers.
 * @param {number} delta The time delta, in milliseconds, by which to adjust.
 * @return {object} A samples/markers table with adjusted time values.
 */
function adjustTimestamps(samplesOrMarkers, delta) {
  return Object.assign({}, samplesOrMarkers, {
    time: samplesOrMarkers.time.map(time => time === undefined ? undefined : time + delta),
  });
}

/**
 * Convert a profile from "raw" format into the preprocessed format.
 * For a description of the preprocessed format, look at docs/profile-data.md or
 * alternately the tests for this function.
 * @param {object} profile A profile object, in the 'raw' format.
 * @return {object} A new profile object, in the 'preprocessed' format.
 */
export function preprocessProfile(profile) {
  const libs = preprocessSharedLibraries(profile.libs);
  const threads = [];
  const tasktracer = emptyTaskTracerData();

  if (('tasktracer' in profile) && ('threads' in profile.tasktracer)) {
    addPreprocessedTaskTracerData(profile.tasktracer, tasktracer, libs, profile.meta.startTime);
  }

  for (const threadOrSubprocess of profile.threads) {
    if (typeof threadOrSubprocess === 'string') {
      const subprocessProfile = JSON.parse(threadOrSubprocess);
      const subprocessLibs = preprocessSharedLibraries(subprocessProfile.libs);
      const adjustTimestampsBy = subprocessProfile.meta.startTime - profile.meta.startTime;
      for (const thread of subprocessProfile.threads) {
        const newThread = preprocessThread(thread, subprocessLibs);
        newThread.samples = adjustTimestamps(newThread.samples, adjustTimestampsBy);
        newThread.markers = adjustTimestamps(newThread.markers, adjustTimestampsBy);
        threads.push(newThread);
      }
      if (('tasktracer' in subprocessProfile) && ('threads' in subprocessProfile.tasktracer)) {
        addPreprocessedTaskTracerData(subprocessProfile.tasktracer, tasktracer, subprocessLibs, profile.meta.startTime);
      }
    } else {
      threads.push(preprocessThread(threadOrSubprocess, libs));
    }
  }
  const result = {
    meta: profile.meta,
    threads, tasktracer,
  };
  return result;
}

export function serializeProfile(profile) {
  // stringTable -> stringArray
  const newProfile = Object.assign({}, profile, {
    threads: profile.threads.map(thread => {
      const stringTable = thread.stringTable;
      const newThread = Object.assign({}, thread);
      delete newThread.stringTable;
      newThread.stringArray = stringTable.serializeToArray();
      return newThread;
    }),
  });
  if ('tasktracer' in newProfile) {
    const newTasktracer = Object.assign({}, newProfile.tasktracer);
    const stringTable = newTasktracer.stringTable;
    delete newTasktracer.stringTable;
    newTasktracer.stringArray = stringTable.serializeToArray();
    newProfile.tasktracer = newTasktracer;
  }
  return JSON.stringify(newProfile);
}

function attemptToUnserializePreprocessedProfileFormat(profile) {
  try {
    if (!('threads' in profile) || profile.threads.length < 1 ||
        ('stringArray' in profile.threads[0])) {
      return undefined;
    }
  } catch (e) {
    return undefined;
  }

  // stringArray -> stringTable
  profile.threads.forEach(thread => {
    const stringArray = thread.stringArray;
    delete thread.stringArray;
    thread.stringTable = new UniqueStringArray(stringArray);
  });
  if ('tasktracer' in profile) {
    const tasktracer = profile.tasktracer;
    const stringArray = tasktracer.stringArray;
    delete tasktracer.stringArray;
    tasktracer.stringTable = new UniqueStringArray(stringArray);
  }
  return profile;
}

function preprocessThreadFromProfileJSONWithSymbolicationTable(thread, symbolicationTable) {
  const stringTable = new UniqueStringArray();
  const frameTable = {
    length: 0,
    category: [],
    location: [],
    implementation: [],
    line: [],
    optimizations: [],
  };
  const stackTable = {
    length: 0,
    frame: [],
    prefix: [],
  };
  const samples = {
    length: 0,
    frameNumber: [],
    power: [],
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

  // Do markers first. Markers are easy.
  for (let i = 0; i < thread.markers.length; i++) {
    const marker = thread.markers[i];
    const markerIndex = markers.length++;
    markers.data[markerIndex] = ('data' in marker) ? marker.data : null;
    markers.name[markerIndex] = stringTable.indexForString(marker.name);
    markers.time[markerIndex] = ('time' in marker) ? marker.time : null;
  }

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
        frameTable.location[frameIndex] = stringTable.indexForString(symbolicationTable[frameSymbolicationTableIndex]);
        frameTable.category[frameIndex] = null;
        frameTable.implementation[frameIndex] = null;
        frameTable.line[frameIndex] = null;
        frameTable.optimizations[frameIndex] = null;
        frameMap.set(frameSymbolicationTableIndex, frameIndex);
      }
      let stackIndex = stackMap.get(`${prefix}:${frameIndex}`);
      if (stackIndex === undefined) {
        stackIndex = stackTable.length++;
        stackTable.prefix[stackIndex] = prefix;
        stackTable.frame[stackIndex] = frameIndex;
        stackMap.set(`${prefix}:${frameIndex}`, stackIndex);
      }
      prefix = stackIndex;
    }
    const sampleIndex = samples.length++;
    samples.stack[sampleIndex] = prefix;
    samples.time[sampleIndex] = ('time' in sample.extraInfo) ? sample.extraInfo.time : null;
    samples.responsiveness[sampleIndex] = ('responsiveness' in sample.extraInfo) ? sample.extraInfo.responsiveness : null;
    samples.frameNumber[sampleIndex] = ('frameNumber' in sample.extraInfo) ? sample.extraInfo.frameNumber : null;
    samples.power[sampleIndex] = ('power' in sample.extraInfo) ? sample.extraInfo.power : null;
    samples.rss[sampleIndex] = ('rss' in sample.extraInfo) ? sample.extraInfo.rss : null;
    samples.uss[sampleIndex] = ('uss' in sample.extraInfo) ? sample.extraInfo.uss : null;
  }

  return {
    name: thread.name,
    frameTable, stackTable, markers, stringTable, samples,
  };
}

function attemptToUnserializeRawProfileFormat(profile) {
  try {
    if (!('libs' in profile) || typeof profile.libs !== 'string' ||
        !('threads' in profile) || profile.threads.length < 1 ||
        !('frameTable' in profile.threads[0]) ||
        !('schema' in profile.threads[0].frameTable)) {
      return undefined;
    }
  } catch (e) {
    return undefined;
  }
  return preprocessProfile(profile);
}

function attemptToUnserializeProfileJSONWithSymbolicationTableProfileFormat(profile) {
  try {
    if (!('format' in profile) || profile.format !== 'profileJSONWithSymbolicationTable,1') {
      return undefined;
    }
  } catch (e) {
    return undefined;
  }

  const { meta, profileJSON, symbolicationTable } = profile;

  const threads = [];
  const tasktracer = emptyTaskTracerData();

  for (const threadIndex in profileJSON.threads) {
    const thread = profileJSON.threads[threadIndex];
    threads.push(preprocessThreadStageTwo(preprocessThreadFromProfileJSONWithSymbolicationTable(thread, symbolicationTable), []));
  }
  const result = {
    meta, threads, tasktracer,
  };
  return result;
}

export function unserializeProfile(jsonString) {
  const profile = JSON.parse(jsonString);
  return attemptToUnserializePreprocessedProfileFormat(profile) ||
         attemptToUnserializeRawProfileFormat(profile) ||
         attemptToUnserializeProfileJSONWithSymbolicationTableProfileFormat(profile);
}

export class ProfilePreprocessor {
  preprocessProfile(profile) {
    return Promise.resolve(preprocessProfile(profile));
  }
}

export const ProfilePreprocessorThreaded = provideHostSide('profile-preprocessor-worker.js', ['preprocessProfile']);
