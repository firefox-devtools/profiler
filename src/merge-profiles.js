import { getContainingLibrary } from './symbolication';
import { UniqueStringArray } from './unique-string-array';

export const resourceTypes = {
  unknown: 0,
  library: 1,
  addon: 2,
  webhost: 3,
  otherhost: 4,
  url: 5
};

/**
 * Takes the stack table and the frame table, creates a func stack table and
 * fixes up the funcStack field in the samples data.
 * @return object  The funcStackTable and the new samples object.
 */
export function createFuncStackTableAndFixupSamples(stackTable, frameTable, funcTable, samples) {
  let stackIndexToFuncStackIndex = new Map();
  const funcCount = funcTable.length;
  let prefixFuncStackAndFuncToFuncStackMap = new Map(); // prefixFuncStack * funcCount + func => funcStack
  let funcStackTable = { length: 0, prefix: [], func: [] };
  function addFuncStack(prefix, func) {
    const index = funcStackTable.length++;
    funcStackTable.prefix[index] = prefix;
    funcStackTable.func[index] = func;
  }
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixStack = stackTable.prefix[stackIndex];
    const prefixFuncStack = (prefixStack === null) ? null :
       stackIndexToFuncStackIndex.get(prefixStack);
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const prefixFuncStackAndFuncIndex = prefixFuncStack * funcCount + funcIndex;
    let funcStackIndex = prefixFuncStackAndFuncToFuncStackMap.get(prefixFuncStackAndFuncIndex);
    if (funcStackIndex === undefined) {
      funcStackIndex = funcStackTable.length;
      addFuncStack(prefixFuncStack, funcIndex);
      prefixFuncStackAndFuncToFuncStackMap.set(prefixFuncStackAndFuncIndex, funcStackIndex);
    }
    stackIndexToFuncStackIndex.set(stackIndex, funcStackIndex);
  }

  return {
    funcStackTable,
    samples: Object.assign({}, samples, {
      funcStack: samples.stack.map(stack => stackIndexToFuncStackIndex.get(stack))
    })
  };
}

function toStructOfArrays(rawTable) {
  const result = { length: rawTable.data.length };
  for (let fieldName in rawTable.schema) {
    const fieldIndex = rawTable.schema[fieldName];
    result[fieldName] = rawTable.data.map(entry => (fieldIndex in entry) ? entry[fieldIndex] : null);
  }
  return result;
}

function preprocessThread(thread, rootMeta, libs) {
  let funcTable = {
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
  let resourceTable = {
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

  let stringTable = new UniqueStringArray(thread.stringTable);
  const frameTable = toStructOfArrays(thread.frameTable);
  const stackTable = toStructOfArrays(thread.stackTable);
  const samples = toStructOfArrays(thread.samples);
  const markers = toStructOfArrays(thread.markers);

  let libToResourceIndex = new Map();
  let stringTableIndexToNewFuncIndex = new Map();

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

function adjustTimeStamps(samplesOrMarkers, delta) {
  return Object.assign({}, samplesOrMarkers, {
    time: samplesOrMarkers.time.map(time => time === -1 ? -1 : time + delta)
  });
}

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
        const newThread = preprocessThread(thread, profile.meta, subprocessLibs);
        newThread.samples = adjustTimeStamps(newThread.samples, adjustTimestampsBy);
        newThread.markers = adjustTimeStamps(newThread.markers, adjustTimestampsBy);
        threads.push(newThread);
      }
    } else {
      threads.push(preprocessThread(threadOrSubprocess, profile.meta, libs));
    }
  }
  return { meta: profile.meta, threads };
}
