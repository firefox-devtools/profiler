import { getContainingLibrary } from './symbolication';
import { timeCode } from './time-code';
import { DataTable } from './data-table';
import { UniqueStringArray } from './unique-string-array';

function adjustTimeStamps(samplesOrMarkers, delta) {
  let { data, schema } = samplesOrMarkers;
  return {
    data: data.mapFields(schema.time, {
      time: time => time === -1 ? -1 : time + delta
    }),
    schema
  };
}

function turnSubprofileIntoThreads(subprofile, rootMeta) {
  let libs = preprocessSharedLibraries(subprofile.libs);
  let adjustTimestampsBy = rootMeta.startTime - subprofile.meta.startTime;
  return subprofile.threads.map(thread => {
    let newThread = fixUpThread(thread, rootMeta, libs);
    const { samples, markers } = newThread;
    return Object.assign(newThread, {
      samples: adjustTimeStamps(samples, adjustTimestampsBy),
      markers: adjustTimeStamps(markers, adjustTimestampsBy),
    });
  });
}

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
 * @return {[type]} [description]
 */
export function createFuncStackTableAndFixupSamples(stackTable, frameTable, funcTable, samples) {
return timeCode('createFuncStackTableAndFixupSamples', () => {
  let stackIndexToFuncStackIndex = new Map();
  const funcCount = funcTable.data.length;
  let prefixFuncStackAndFuncToFuncStackMap = new Map(); // prefixFuncStack * funcCount + func => funcStack
  let funcStackTable = {
    schema: {
      prefix: 0,
      func: 1
    }
  };
  funcStackTable.data = new DataTable(funcStackTable.schema);
  funcStackTable.data.declareAdder('addFuncStack', ['prefix', 'func']);
  for (let stackIndex = 0; stackIndex < stackTable.data.length; stackIndex++) {
    const prefixStack = stackTable.data.getValue(stackIndex, stackTable.schema.prefix);
    const prefixFuncStack = (prefixStack === null) ? null :
       stackIndexToFuncStackIndex.get(prefixStack);
    const frameIndex = stackTable.data.getValue(stackIndex, stackTable.schema.frame);
    if (frameIndex === null) {
      console.log("have null frameIndex", stackIndex, stackTable);
    }
    const funcIndex = frameTable.data.getValue(frameIndex, frameTable.schema.func);
    const prefixFuncStackAndFuncIndex = prefixFuncStack * funcCount + funcIndex;
    let funcStackIndex = prefixFuncStackAndFuncToFuncStackMap.get(prefixFuncStackAndFuncIndex);
    if (funcStackIndex === undefined) {
      funcStackIndex = funcStackTable.data.length;
      if (funcIndex === null) {
        console.log("adding funcStack with null funcIndex", funcStackIndex, frameIndex, frameTable);
      }
      funcStackTable.data.addFuncStack(prefixFuncStack, funcIndex);
      prefixFuncStackAndFuncToFuncStackMap.set(prefixFuncStackAndFuncIndex, funcStackIndex);
    }
    stackIndexToFuncStackIndex.set(stackIndex, funcStackIndex);
  }

  const newSamplesSchema = ('funcStack' in samples.schema)
    ? samples.schema
    : Object.assign({ funcStack: Object.keys(samples.schema).length }, samples.schema);

  const newSamplesData = samples.data.mapFieldsWithNewSchema(newSamplesSchema, samples.schema.stack, {
    funcStack: stack => stackIndexToFuncStackIndex.get(stack)
  });

  return {
    funcStackTable,
    samples: {
      schema: newSamplesSchema,
      data: newSamplesData
    }
  };
});
}

function fixUpThread(thread, rootMeta, libs) {
  let funcTable = {
    schema: {
      name: 0,
      resource: 1,
      address: 2
    }
  };
  funcTable.data = new DataTable(funcTable.schema);
  funcTable.data.declareAdder('addFunc', ['name', 'resource', 'address']);
  let resourceTable = {
    schema: {
      type: 0,
      name: 1,
      lib: 2,
      icon: 3,
      addonId: 4
    }
  };
  resourceTable.data = new DataTable(resourceTable.schema);
  resourceTable.data.declareAdder('addLibResource', ['type', 'name', 'lib']);
  let stringTable = new UniqueStringArray(thread.stringTable);

  // Converting the frameTable to a DataTable drops the optimizations JSON here,
  // because DataTable can only store float fields. Find a solution for that.
  const frameTableData = new DataTable(thread.frameTable.schema, thread.frameTable.data);
  const frameTable = { schema: thread.frameTable.schema, data: frameTableData };

  const stackTableData = new DataTable(thread.stackTable.schema, thread.stackTable.data);
  const stackTable = { schema: thread.stackTable.schema, data: stackTableData };

  const samplesData = new DataTable(thread.samples.schema, thread.samples.data);
  const samples = { schema: thread.samples.schema, data: samplesData };

  const markersData = new DataTable(thread.markers.schema, thread.markers.data);
  const markers = { schema: thread.markers.schema, data: markersData };

  let newFrameTableSchema = Object.assign({}, thread.frameTable.schema);
  newFrameTableSchema.func = thread.frameTable.schema.location;
  // newFrameTableSchema.address = Object.keys(thread.frameTable.schema).length;
  delete newFrameTableSchema.location;

  let libToResourceIndex = new Map();
  let stringTableIndexToNewFuncIndex = new Map();

  const newFrameTableData = frameTable.data.mapFieldsWithNewSchema(newFrameTableSchema, thread.frameTable.schema.location, {
    func: locationIndex => {
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
            resourceIndex = resourceTable.data.length;
            libToResourceIndex.set(lib, resourceIndex);
            const nameStringIndex = stringTable.indexForString(lib.pdbName);
            resourceTable.data.addLibResource(resourceTypes.library, nameStringIndex, libs.indexOf(lib));
          }
        }
      }
      funcIndex = funcTable.data.length;
      funcTable.data.addFunc(locationIndex, resourceIndex, addressRelativeToLib);
      stringTableIndexToNewFuncIndex.set(locationIndex, funcIndex);
      return funcIndex;
    }
  });
/*
    if (locationString.startsWith('0x')) {
      frame.address = funcTable.data.getValue(funcIndex, funcTable.schema.address);
    }
*/
  const newFrameTable = {
    data: newFrameTableData,
    schema: newFrameTableSchema
  };

  const { samples: newSamples, funcStackTable } =
    createFuncStackTableAndFixupSamples(stackTable, newFrameTable, funcTable, samples);

  return Object.assign({}, thread, {
    libs, funcTable, resourceTable, stackTable, funcStackTable, samples: newSamples,
    frameTable: newFrameTable,
    stringTable, markers
  });
}

// Returns an array of threads, fit for inclusion in the root profile.
function preprocessThread(thread, rootMeta, libs) {
  if (typeof thread === 'string') {
    return turnSubprofileIntoThreads(JSON.parse(thread), rootMeta);
  }
  return [fixUpThread(thread, rootMeta, libs)];
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
    return Object.assign({}, lib, {pdbName, breakpadId});
  }).sort((a, b) => a.start - b.start);
}

export function preprocessProfile(profile) {
  // profile.meta.startTime is process start time, as a timestamp in ms
  let libs = preprocessSharedLibraries(profile.libs);
  let meta = profile.meta;
  return {
    meta,
    threads: profile.threads.reduce((newThreads, thread) => {
      return newThreads.concat(preprocessThread(thread, meta, libs));
    }, [])
  };
}
