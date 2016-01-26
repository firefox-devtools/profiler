import { resourceTypes, createFuncStackTableAndFixupSamples } from './merge-profiles';
import { timeCode } from './time-code';
import { DataTable } from './data-table';
import { UniqueStringArray } from './unique-string-array';

export function getContainingLibrary(libs, address) {
  if (isNaN(address)) {
    return null;
  }

  let left = 0;
  let right = libs.length - 1;
  while (left <= right) {
    let mid = ((left + right) / 2)|0;
    if (address >= libs[mid].end)
      left = mid + 1;
    else if (address < libs[mid].start)
      right = mid - 1;
    else
      return libs[mid];
  }
  return null;
}

// See python bisect.bisect_right
function bisectRight(a, x, lo = 0, hi = a.length) {
  while (lo < hi) {
    let mid = ((lo + hi) / 2)|0;
    if (x < a[mid]) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

function fixupFrameTable(frameTable, oldFuncToNewFuncMap) {
  const { data, schema } = frameTable;
  return {
    schema,
    data: data.mapFields(schema.func, {
      func: oldFunc => {
        const newFunc = oldFuncToNewFuncMap.get(oldFunc);
        return newFunc === undefined ? oldFunc : newFunc;
      }
    })
  };
}

/**
 * XXX fix this comment
 * Using the provided symbol table, replace addresses in the thread's
 * funcTable with their corresponding symbols.
 * @param  array  [addrs, syms] The symbol table.
 * @param  array  addresses     The addresses to replace, as an array of
 *                              [funcTableIndex, integerAddressRelativeToLibrary]
 *                              elements.
 * @param  object thread        The thread whose funcTable needs to be augmented.
 * @return object               The updated thread as a new object.
 */
function mergeFunctions(addrs, addressesToSymbolicate, thread, oldFuncToNewFuncMap = new Map(), addrToFuncIndexMap = new Map()) {
  let funcTable = {
    schema: thread.funcTable.schema,
    data: new DataTable(thread.funcTable.schema, thread.funcTable.data)
  };
  addressesToSymbolicate.sort(([i1, address1], [i2, address2]) => {
    if (address1 !== address2) {
      return address1 - address2;
    }
    return i1 - i2;
  });
  let lastFuncIndex = -1;
  let nextFuncAddress = 0;
  let nextFuncAddressIndex = 0;
  for (let [funcIndex, addr] of addressesToSymbolicate) {
    if (addr < nextFuncAddress) {
      oldFuncToNewFuncMap.set(funcIndex, lastFuncIndex);
      continue;
    }
    let funcAddressIndex = bisectRight(addrs, addr, nextFuncAddressIndex) - 1;
    if (funcAddressIndex >= 0) {
      const funcAddr = addrs[funcAddressIndex];
      nextFuncAddressIndex = funcAddressIndex + 1;
      nextFuncAddress = (nextFuncAddressIndex < addrs.length) ? addrs[nextFuncAddressIndex] : Infinity;
      lastFuncIndex = funcIndex;
      addrToFuncIndexMap.set(funcAddr, funcIndex);
    }
  }
  const frameTable = fixupFrameTable(thread.frameTable, oldFuncToNewFuncMap);
  const { funcStackTable, samples } = createFuncStackTableAndFixupSamples(thread.stackTable, frameTable, funcTable, thread.samples);
  return Object.assign({}, thread, { funcTable, frameTable, funcStackTable, samples });
}

function setFuncNames(thread, funcAddrs, funcNames, addrToFuncIndexMap) {
  let funcTable = {
    schema: thread.funcTable.schema,
    data: new DataTable(thread.funcTable.schema, thread.funcTable.data)
  };
  let stringTable = thread.stringTable;
  funcAddrs.forEach((addr, addrIndex) => {
    let funcIndex = addrToFuncIndexMap.get(addr);
    let symbolName = funcNames[addrIndex];
    let symbolIndex = stringTable.indexForString(symbolName);
    funcTable.data.setValue(funcIndex, funcTable.schema.name, symbolIndex);
  });
  return Object.assign({}, thread, { funcTable, stringTable });
}

/**
 * Find the addresses in this thread's funcTable that we need symbols for.
 * @param  object thread The thread, in "preprocessed profile" format.
 * @return Map           A map containing the addresses. Each entry's key is a
 *                       lib object from the thread's libs array, and the value
 *                       is an array of two-element arrays, where the first
 *                       field is an index to the function table, and the
 *                       second field is the (integer, relative-to-library)
 *                       address at that index.
 *                       Example:
 *                       map.get(lib): [[0, 1234], [1, 1237], [2, 1240]]
 */
function gatherAddressesInThread(thread) {
return timeCode('gatherAddressesInThread', () => {
  let { libs, funcTable, stringTable, resourceTable } = thread;
  let foundAddresses = new Map();
  funcTable.data.threeFieldsForEach(funcTable.schema.resource, funcTable.schema.name, funcTable.schema.address, (resourceIndex, nameIndex, address, funcIndex) => {
    if (resourceIndex === -1) {
      return;
    }
    const resource = resourceTable.data.getObject(resourceIndex);
    if (resource.type !== resourceTypes.library) {
      return;
    }

    const name = stringTable.getString(nameIndex);
    if (!name.startsWith('0x')) {
      // Somebody already symbolicated this function for us.
      return;
    }

    const libIndex = resource.lib;
    const lib = libs[libIndex];
    if (!foundAddresses.has(lib)) {
      foundAddresses.set(lib, []);
    }
    foundAddresses.get(lib).push([funcIndex, address]);
  });
  return foundAddresses;
});}

/**
 * Symbolicate the given thread. Calls cbo.onUpdateThread after each bit of
 * symbolication, and resolves the returned promise once completely done.
 * @param  object  thread      The thread to symbolicate, in the "preprocessed profile" format.
 * @param  object  symbolStore A SymbolStore object that can be used for getting the required symbol tables.
 * @param  object  cbo         An object containing a callback function 'onUpdateThread' which is called with
 *                             a new updated thread every time we've done a bit of symbolication.
 * @return Promise             A promise that resolves (with nothing) once symbolication of the thread has completed.
 */
function symbolicateThread(thread, symbolStore, cbo) {
  let foundAddresses = gatherAddressesInThread(thread);
  let updatedThread = thread;
  return Promise.all(Array.from(foundAddresses).map(function ([lib, addresses]) {
    return symbolStore.getFuncAddressTableForLib(lib).then(addrs => {
      let oldFuncToNewFuncMap = new Map();
      let addrToFuncIndexMap = new Map();
      updatedThread = mergeFunctions(addrs, addresses, updatedThread, oldFuncToNewFuncMap, addrToFuncIndexMap);
      cbo.onUpdateThread(updatedThread, oldFuncToNewFuncMap);
      let funcAddrs = Array.from(addrToFuncIndexMap.keys()).sort((a, b) => a - b);
      return symbolStore.getSymbolsForAddressesInLib(funcAddrs, lib).then(funcNames => {
        updatedThread = setFuncNames(updatedThread, funcAddrs, funcNames, addrToFuncIndexMap);
        cbo.onUpdateThread(updatedThread, oldFuncToNewFuncMap);
      });
    }).catch(error => {
      // console.log(`Couldn't get symbols for library ${lib.pdbName} ${lib.breakpadId}`);
      // console.error(error);
      // Don't throw, so that the resulting promise will be resolved, thereby
      // indicating that we're done symbolicating with lib.
    });
  }));
}

/**
 * Symbolicate a profile.
 * @param  object profile     The profile to symbolicate, in preprocessed format
 *                            (XXX give a name to this format and spec it - it's the
 *                            version that preprocessProfile (in merge-profiles.js) outputs,
 *                            with a libs object in each thread, all threads resolved to
 *                            objects (no JSON strings), and addrTable and funcTable fields on each thread).
 * @param  object symbolStore A SymbolStore object with a getSymbolTableForLib method for getting symbols tables.
 * @param  object cbo         An object containing a callback function 'onUpdateProfile',  which is called
 *                            with a new updated profile whenever we've done a bit of symbolication.
 * @return Promise            A promise that resolves (with nothing) once symbolication has completed.
 */
export function symbolicateProfile(profile, symbolStore, cbo) {
  let updatedProfile = profile;
  return Promise.all(profile.threads.map((thread, threadIndex) => {
    return symbolicateThread(thread, symbolStore, {
      onUpdateThread: (updatedThread, oldFuncToNewFuncMap) => {
        let threads = updatedProfile.threads.slice();
        threads[threadIndex] = updatedThread;
        updatedProfile = Object.assign({}, updatedProfile, { threads });
        cbo.onUpdateProfile(updatedProfile);
      }
    });
  }));
}
