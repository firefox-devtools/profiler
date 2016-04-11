import { getContainingLibrary } from './symbolication';
import { UniqueStringArray } from './unique-string-array';
import { resourceTypes, createFuncStackTableAndFixupSamples } from './profile-data';

/**
 * Turn a data table from the form { schema, data } (as used in the raw profile
 * JSON) into a struct of arrays. This isn't very nice to read, but it
 * drastically reduces the number of JS objects the JS engine has to deal with,
 * resulting in fewer GC pauses.
 */
function toStructOfArrays(rawTable) {
  const result = { length: rawTable.data.length };
  for (let fieldName in rawTable.schema) {
    const fieldIndex = rawTable.schema[fieldName];
    result[fieldName] = rawTable.data.map(entry => (fieldIndex in entry) ? entry[fieldIndex] : null);
  }
  return result;
}

/**
 * Convert the given thread into preprocessed form.
 * @param  {[type]} thread   [description]
 * @param  {[type]} libs     [description]
 * @return {[type]}          [description]
 */
function preprocessThread(thread, libs) {
  const funcTable = {
    length: 0,
    name: [],
    resource: [],
    address: []
  };
  function addFunc(name, resource, address) {
    const index = funcTable.length++;
    funcTable.name[index] = name;
    funcTable.resource[index] = resource;
    funcTable.address[index] = address;
  }
  const resourceTable = {
    length: 0,
    type: [],
    name: [],
    lib: [],
    icon: [],
    addonId: []
  };
  function addLibResource(name, lib) {
    const index = resourceTable.length++;
    resourceTable.type[index] = resourceTypes.library;
    resourceTable.name[index] = name;
    resourceTable.lib[index] = lib;
  }

  const stringTable = new UniqueStringArray(thread.stringTable);
  const frameTable = toStructOfArrays(thread.frameTable);
  const stackTable = toStructOfArrays(thread.stackTable);
  const samples = toStructOfArrays(thread.samples);
  const markers = toStructOfArrays(thread.markers);

  const libToResourceIndex = new Map();
  const stringTableIndexToNewFuncIndex = new Map();

  frameTable.func = frameTable.location.map(locationIndex => {
    let funcIndex = stringTableIndexToNewFuncIndex.get(locationIndex);
    if (funcIndex !== undefined) {
      return funcIndex;
    }

    let resourceIndex = -1;
    let addressRelativeToLib = -1;
    const locationString = stringTable.getString(locationIndex);
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
    }
    funcIndex = funcTable.length;
    addFunc(locationIndex, resourceIndex, addressRelativeToLib);
    stringTableIndexToNewFuncIndex.set(locationIndex, funcIndex);
    return funcIndex;
  });
  frameTable.address = frameTable.func.map(funcIndex => funcTable.address[funcIndex]);
  delete frameTable.location;

  return Object.assign({}, thread, {
    libs, frameTable, funcTable, resourceTable, stackTable, stringTable, markers
  }, createFuncStackTableAndFixupSamples(stackTable, frameTable, funcTable, samples));
}

/**
 * Ensure every lib has pdbName and breakpadId fields, and sort them by start address.
 */
function preprocessSharedLibraries(libs) {
  return JSON.parse(libs).map(lib => {
    let pdbName, breakpadId;
    if ('breakpadId' in lib) {
      pdbName = lib.name.substr(lib.name.lastIndexOf("/") + 1);
      breakpadId = lib.breakpadId;
    } else {
      pdbName = lib.pdbName;
      let pdbSig = lib.pdbSignature.replace(/[{}-]/g, "").toUpperCase();
      breakpadId = pdbSig + lib.pdbAge;
    }
    return Object.assign({}, lib, { pdbName, breakpadId });
  }).sort((a, b) => a.start - b.start);
}

/**
 * Adjust the "time" field by the given delta.
 */
function adjustTimestamps(samplesOrMarkers, delta) {
  return Object.assign({}, samplesOrMarkers, {
    time: samplesOrMarkers.time.map(time => time === undefined ? undefined : time + delta)
  });
}

/**
 * Convert a profile from "raw" format into the preprocessed format.
 * For a description of the preprocessed format, look at the tests for this
 * function. (Sorry!)
 */
export function preprocessProfile(profile) {
  // profile.meta.startTime is process start time, as a timestamp in ms
  const libs = preprocessSharedLibraries(profile.libs);
  const threads = [];
  for (let threadOrSubprocess of profile.threads) {
    if (typeof threadOrSubprocess === 'string') {
      const subprocessProfile = JSON.parse(threadOrSubprocess);
      const subprocessLibs = preprocessSharedLibraries(subprocessProfile.libs);
      const adjustTimestampsBy = subprocessProfile.meta.startTime - profile.meta.startTime;
      for (let thread of subprocessProfile.threads) {
        const newThread = preprocessThread(thread, subprocessLibs);
        newThread.samples = adjustTimestamps(newThread.samples, adjustTimestampsBy);
        newThread.markers = adjustTimestamps(newThread.markers, adjustTimestampsBy);
        threads.push(newThread);
      }
    } else {
      threads.push(preprocessThread(threadOrSubprocess, libs));
    }
  }
  return { meta: profile.meta, threads };
}
