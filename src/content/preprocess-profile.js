import { getContainingLibrary, getClosestLibrary } from './symbolication';
import { UniqueStringArray } from './unique-string-array';
import { resourceTypes } from './profile-data';
import { provideHostSide } from './promise-worker';
import { CURRENT_VERSION, upgradePreprocessedProfileToCurrentVersion, isPreprocessedProfile } from './preprocessed-profile-versioning';
import { upgradeRawProfileToCurrentVersion } from './raw-profile-versioning';
import { isOldCleopatraFormat, convertOldCleopatraProfile } from './old-cleopatra-profile-format';

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

function sortByField(fieldName, rawTable) {
  const fieldIndex = rawTable.schema[fieldName];
  const sortedData = rawTable.data.slice(0);
  sortedData.sort((a, b) => a[fieldIndex] - b[fieldIndex]);
  return Object.assign({}, rawTable, { data: sortedData });
}

function cleanFunctionName(functionName) {
  const ignoredPrefix = 'non-virtual thunk to ';
  if (functionName.startsWith && functionName.startsWith(ignoredPrefix)) {
    return functionName.substr(ignoredPrefix.length);
  }
  return functionName;
}

/**
 * Convert the given thread into preprocessed form. See docs/profile-data.md for more
 * information.
 * @param {object} thread The thread object, in the 'raw' format.
 * @param {array} libs A libs array.
 * @return {object} A new thread object in the 'preprocessed' format.
 */
function preprocessThread(thread, libs) {
  const stringTable = new UniqueStringArray(thread.stringTable);
  const frameTable = toStructOfArrays(thread.frameTable);
  const stackTable = toStructOfArrays(thread.stackTable);
  const samples = toStructOfArrays(thread.samples);
  const markers = toStructOfArrays(sortByField('time', thread.markers));
  const funcTable = {
    length: 0,
    name: [],
    resource: [],
    address: [],
    isJS: [],
    fileName: [],
    lineNumber: [],
  };
  function addFunc(name, resource, address, isJS, fileName, lineNumber) {
    const index = funcTable.length++;
    funcTable.name[index] = name;
    funcTable.resource[index] = resource;
    funcTable.address[index] = address;
    funcTable.isJS[index] = isJS;
    funcTable.fileName[index] = fileName;
    funcTable.lineNumber[index] = lineNumber;
  }
  const resourceTable = {
    length: 0,
    type: [],
    name: [],
    lib: [],
    icon: [],
    addonId: [],
    host: [],
  };
  function addLibResource(name, lib) {
    const index = resourceTable.length++;
    resourceTable.type[index] = resourceTypes.library;
    resourceTable.name[index] = name;
    resourceTable.lib[index] = lib;
  }
  function addWebhostResource(origin, host) {
    const index = resourceTable.length++;
    resourceTable.type[index] = resourceTypes.webhost;
    resourceTable.name[index] = origin;
    resourceTable.host[index] = host;
  }
  function addURLResource(url) {
    const index = resourceTable.length++;
    resourceTable.type[index] = resourceTypes.url;
    resourceTable.name[index] = url;
  }

  const libToResourceIndex = new Map();
  const libNameToResourceIndex = new Map();
  const originToResourceIndex = new Map();
  const stringTableIndexToNewFuncIndex = new Map();

  frameTable.func = frameTable.location.map(locationIndex => {
    let funcIndex = stringTableIndexToNewFuncIndex.get(locationIndex);
    if (funcIndex !== undefined) {
      return funcIndex;
    }

    let funcNameIndex = locationIndex;
    let resourceIndex = -1;
    let addressRelativeToLib = -1;
    let isJS = false;
    let fileName = null;
    let lineNumber = null;
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
          const nameStringIndex = stringTable.indexForString(lib.debugName);
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
            resourceIndex = originToResourceIndex.get(origin);
          } else {
            resourceIndex = resourceTable.length;
            originToResourceIndex.set(origin, resourceIndex);
            const originStringIndex = stringTable.indexForString(origin);
            if (host) {
              const hostIndex = stringTable.indexForString(host);
              addWebhostResource(originStringIndex, hostIndex);
            } else {
              const urlStringIndex = stringTable.indexForString(scriptURI);
              addURLResource(urlStringIndex);
            }
          }
          if (jsMatch[1]) {
            funcNameIndex = stringTable.indexForString(jsMatch[1]);
          } else {
            // Some JS frames don't have a function because they are for the
            // initial evaluation of the whole JS file. In that case, use the
            // file name itself, prepended by '(root scope) ', as the function
            // name.
            funcNameIndex = stringTable.indexForString(`(root scope) ${scriptURI}`);
          }
          fileName = stringTable.indexForString(scriptURI);
          lineNumber = jsMatch[3] | 0;
        }
      }
    }
    funcIndex = funcTable.length;
    addFunc(funcNameIndex, resourceIndex, addressRelativeToLib, isJS, fileName, lineNumber);
    stringTableIndexToNewFuncIndex.set(locationIndex, funcIndex);
    return funcIndex;
  });
  frameTable.address = frameTable.func.map(funcIndex => funcTable.address[funcIndex]);
  delete frameTable.location;

  return {
    name: thread.name,
    processType: thread.processType,
    tid: thread.tid,
    pid: thread.pid,
    libs, frameTable, funcTable, resourceTable, stackTable, markers, stringTable, samples,
  };
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
      ipdlMsg: [],
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
          if (/^P.+::Msg_/.test(label)) {
            taskTable.ipdlMsg[taskIndex] = stringTable.indexForString(label);
          } else if (taskTable.label[taskIndex] === undefined) {
            taskTable.label[taskIndex] = [stringTable.indexForString(label)];
          } else {
            taskTable.label[taskIndex].push(stringTable.indexForString(label));
          }
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
              stringIndex = stringTable.indexForString(`<0x${addressRelativeToLib.toString(16)} in ${lib.debugName}>`);
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
 * Adjust the "time" field by the given delta. This is needed when integrating
 * subprocess profiles into the parent process profile; each profile's process
 * has its own timebase, and we don't want to keep converting timestamps when
 * we deal with the integrated profile.
 * @param {object} samples The table of samples/markers.
 * @param {number} delta The time delta, in milliseconds, by which to adjust.
 * @return {object} A samples table with adjusted time values.
 */
function adjustSampleTimestamps(samples, delta) {
  return Object.assign({}, samples, {
    time: samples.time.map(time => time === undefined ? undefined : time + delta),
  });
}

/**
 * Adjust all timestamp fields by the given delta. This is needed when
 * integrating subprocess profiles into the parent process profile; each
 * profile's process has its own timebase, and we don't want to keep
 * converting timestamps when we deal with the integrated profile.
 * @param {object} samples The table of markers.
 * @param {number} delta The time delta, in milliseconds, by which to adjust.
 * @return {object} A markers table with adjusted time values.
 */
function adjustMarkerTimestamps(markers, delta) {
  return Object.assign({}, markers, {
    time: markers.time.map(time => time === undefined ? undefined : time + delta),
    data: markers.data.map(data => {
      if (!data) {
        return data;
      }
      const newData = Object.assign({}, data);
      if ('startTime' in newData) {
        newData.startTime += delta;
      }
      if ('endTime' in newData) {
        newData.endTime += delta;
      }
      return newData;
    }),
  });
}

/**
 * Convert a profile from "raw" format into the preprocessed format.
 * Throws an exception if it encounters an incompatible profile.
 * For a description of the preprocessed format, look at docs/profile-data.md or
 * alternately the tests for this function.
 * @param {object} profile A profile object, in the 'raw' format.
 * @return {object} A new profile object, in the 'preprocessed' format.
 */
export function preprocessProfile(profile) {
  // Handle profiles from older versions of Gecko. This call might throw an
  // exception.
  upgradeRawProfileToCurrentVersion(profile);

  const libs = profile.libs;
  let threads = [];
  const tasktracer = emptyTaskTracerData();

  if (('tasktracer' in profile) && ('threads' in profile.tasktracer)) {
    addPreprocessedTaskTracerData(profile.tasktracer, tasktracer, libs, profile.meta.startTime);
  }

  for (const threadOrSubprocess of profile.threads) {
    if (typeof threadOrSubprocess === 'string') {
      const subprocessProfile = JSON.parse(threadOrSubprocess);
      const subprocessLibs = subprocessProfile.libs;
      const adjustTimestampsBy = subprocessProfile.meta.startTime - profile.meta.startTime;
      threads = threads.concat(subprocessProfile.threads.map((thread, threadIndex) => {
        const newThread = preprocessThread(thread, subprocessLibs);
        newThread.samples = adjustSampleTimestamps(newThread.samples, adjustTimestampsBy);
        newThread.markers = adjustMarkerTimestamps(newThread.markers, adjustTimestampsBy);
        if (newThread.name === 'Content') {
          // Workaround for bug 1322471.
          if (threadIndex === 0) {
            newThread.name = 'GeckoMain';
          } else {
            newThread.name = 'Unknown';
          }
          newThread.processType = newThread.processType || 'tab';
        }
        return newThread;
      }));
      if (('tasktracer' in subprocessProfile) && ('threads' in subprocessProfile.tasktracer)) {
        addPreprocessedTaskTracerData(subprocessProfile.tasktracer, tasktracer, subprocessLibs, profile.meta.startTime);
      }
    } else {
      const newThread = preprocessThread(threadOrSubprocess, libs);
      newThread.processType = newThread.processType || 'default';
      threads.push(newThread);
    }
  }
  const result = {
    meta: Object.assign({}, profile.meta, {
      preprocessedProfileVersion: CURRENT_VERSION,
    }),
    threads,
    tasktracer,
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

function unserializeProfile(profile) {
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

export function unserializeProfileOfArbitraryFormat(jsonString) {
  try {
    let profile = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    if (isOldCleopatraFormat(profile)) {
      profile = convertOldCleopatraProfile(profile); // outputs proprocessed profile
    }
    if (isPreprocessedProfile(profile)) {
      upgradePreprocessedProfileToCurrentVersion(profile);
      return unserializeProfile(profile);
    }
    // Else: Treat it as a raw profile and just attempt to preprocess it.
    return preprocessProfile(profile);
  } catch (e) {
    throw new Error(`Unserializing the profile failed: ${e}`);
  }
}

export class ProfilePreprocessor {
  preprocessProfile(profile) {
    return new Promise(resolve => {
      resolve(preprocessProfile(profile));
    });
  }
}

export const ProfilePreprocessorThreaded = provideHostSide('profile-preprocessor-worker.js', ['preprocessProfile']);
