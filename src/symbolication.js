import bisection from 'bisection';
import { resourceTypes, createFuncStackTableAndFixupSamples } from './merge-profiles';
import { UniqueStringArray } from './unique-string-array';

/**
 * Return the library object that contains address.
 * @param  array of {start,end,...} libs    The array of librarys
 * @param                           address The address to find
 * @return {start,end,...} lib object       The lib object that contains address, rv.start <= address < rv.end, or null if no such lib object exists.
 */
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

/**
 * Find the functions in this thread's funcTable that we need symbols for.
 * @param  object thread The thread, in "preprocessed profile" format.
 * @return Map           A map containing the funcIndices of the functions that
 *                       need to be symbolicated. Each entry's key is a lib
 *                       object from the thread's libs array, and the value is
 *                       an array of funcIndex.
 *                       Example:
 *                       map.get(lib): [0, 1, 2, 8, 34]
 */
function gatherAddressesInThread(thread) {
  const { libs, funcTable, stringTable, resourceTable } = thread;
  const foundAddresses = new Map();
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    const resourceIndex = funcTable.resource[funcIndex];
    if (resourceIndex === -1) {
      continue;
    }
    const resourceType = resourceTable.type[resourceIndex];
    if (resourceType !== resourceTypes.library) {
      continue;
    }

    const name = stringTable.getString(funcTable.name[funcIndex]);
    if (!name.startsWith('0x')) {
      // Somebody already symbolicated this function for us.
      continue;
    }

    const libIndex = resourceTable.lib[resourceIndex];
    const lib = libs[libIndex];
    let libFuncs = foundAddresses.get(lib);
    if (libFuncs === undefined) {
      libFuncs = [];
      foundAddresses.set(lib, libFuncs);
    }
    libFuncs.push(funcIndex);
  };
  return foundAddresses;
}

/**
 * Using the provided func address table, find out which funcs are actually the
 * same function, and make a list of the real func addresses that we need
 * symbols for.
 * Before we had the func address table for this library, we weren't able to
 * tell whether two frames are the same function, so we naively created one
 * function per frame, giving each function the address of the frame.
 * Now that we know at which address each function truly starts, we can find
 * out which of the naively-created funcs are the same function and collapse
 * those into just one func. This information is returned in the
 * oldFuncToNewFuncMap outparameter.
 * Before we can request symbols, we need to make a list of func addresses for
 * the symbols we need. These addresses need to be the true function start
 * addresses from the func address table. This information is returned in the
 * return value - the return value is a map whose keys are the true func
 * addresses that we need symbols for. The value of each map entry is the
 * funcIndex for the func that has become the "one true func" for this function.
 * @param  array  funcAddressTable    An array containing the address of every function of a library, in ascending order.
 * @param  array  funcsToSymbolicate  An array containing funcIndex elements for the funcs in this library.
 * @param  object funcTable           The funcTable that the funcIndices in addressToSymbolicate refer to.
 * @param  Map    oldFuncToNewFuncMap An out parameter that specifies how funcs should be merged.
 * @return object                     A map that maps a func address to a funcIndex, one entry for each func that needs to be symbolicated.
 */
function findFunctionsToMergeAndSymbolicationAddresses(funcAddressTable, funcsToSymbolicate, funcTable, oldFuncToNewFuncMap = new Map()) {
  let addrToFuncIndexMap = new Map();

  // Sort funcsToSymbolicate by address.
  funcsToSymbolicate.sort((i1, i2) => {
    const address1 = funcTable.address[i1];
    const address2 = funcTable.address[i2];
    if (address1 === address2) {
      // Two funcs had the same address? This shouldn't happen.
      return i1 - i2;
    }
    return address1 - address2;
  });

  let lastFuncIndex = -1;
  let nextFuncAddress = 0;
  let nextFuncAddressIndex = 0;
  for (let funcIndex of funcsToSymbolicate) {
    const funcAddress = funcTable.address[funcIndex];
    if (funcAddress < nextFuncAddress) {
      // The address of the func at funcIndex is still inside the
      // lastFuncIndex func. So those are actually the same function.
      // Collapse them into each other.
      oldFuncToNewFuncMap.set(funcIndex, lastFuncIndex);
      continue;
    }

    // Now funcAddress >= nextFuncAddress.
    // Find the index in funcAddressTable of the function that funcAddress is
    // inside of.
    let funcAddressIndex = bisection.right(funcAddressTable, funcAddress, nextFuncAddressIndex) - 1;
    if (funcAddressIndex >= 0) {
      const realFuncAddress = funcAddressTable[funcAddressIndex];
      nextFuncAddressIndex = funcAddressIndex + 1;
      nextFuncAddress = (nextFuncAddressIndex < funcAddressTable.length) ? funcAddressTable[nextFuncAddressIndex] : Infinity;
      lastFuncIndex = funcIndex;
      addrToFuncIndexMap.set(realFuncAddress, funcIndex);
    }
  }
  return addrToFuncIndexMap;
}

/**
 * Modify the symbolicated funcs to point to the new func name strings.
 * This function adds the func names to the thread's string table and
 * adjusts the funcTable to point to those strings.
 * @param thread             The thread whose funcTable needs adjusting.
 * @param funcAddrs          An array of addresses of the functions that we got symbols for.
 * @param funcNames          An array of strings containing the corresponding symbols.
 * @param addrToFuncIndexMap A Map that maps a func address to the funcIndex.
 * @return                   The new thread object.
 */
function setFuncNames(thread, funcAddrs, funcNames, addrToFuncIndexMap) {
  let funcTable = Object.assign({}, thread.funcTable);
  funcTable.name = funcTable.name.slice();
  let stringTable = thread.stringTable;
  funcAddrs.forEach((addr, addrIndex) => {
    let funcIndex = addrToFuncIndexMap.get(addr);
    let symbolName = funcNames[addrIndex];
    let symbolIndex = stringTable.indexForString(symbolName);
    funcTable.name[funcIndex] = symbolIndex;
  });
  return Object.assign({}, thread, { funcTable, stringTable });
}

/**
 * Correctly collapse a function into another function and return a consistent
 * profile that no longer refers to the collapsed-away function.
 * The new frameTable has an updated func column, where all pointers
 * to old funcs have been replaced to the corresponding new func.
 * "Functions" in a profile are created before the library's function table is
 * known, by creating one function per frame address. Once the function table
 * is known, different addresses that are inside the same function need to be
 * merged into that same function.
 * @param  object thread              The thread that needs to be augmented. Treated as immutable.
 * @param  object oldFuncToNewFuncMap A map that defines which function should be collapsed into which other function.
 * @return object                     The new thread object.
 */
function applyFunctionMerging(thread, oldFuncToNewFuncMap) {
  const frameTable = Object.assign({}, thread.frameTable, {
    func: thread.frameTable.func.map(oldFunc => {
      const newFunc = oldFuncToNewFuncMap.get(oldFunc);
      return newFunc === undefined ? oldFunc : newFunc;
    })
  });
  return Object.assign({}, thread, { frameTable },
    createFuncStackTableAndFixupSamples(thread.stackTable, frameTable, thread.funcTable, thread.samples));
}

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
  let updatedThread = thread;
  let oldFuncToNewFuncMap = new Map();

  let scheduledThreadUpdate = false;
  function scheduleThreadUpdate() {
    if (!scheduledThreadUpdate) {
      setTimeout(callOnUpdateThread, 0);
      scheduledThreadUpdate = true;
    }
  }

  function callOnUpdateThread() {
    updatedThread = applyFunctionMerging(updatedThread, oldFuncToNewFuncMap)
    cbo.onUpdateThread(updatedThread, oldFuncToNewFuncMap);
    oldFuncToNewFuncMap = new Map();
    scheduledThreadUpdate = false;
  }

  let foundAddresses = gatherAddressesInThread(thread);
  return Promise.all(Array.from(foundAddresses).map(function ([lib, funcsToSymbolicate]) {
    // lib is a lib object from thread.libs.
    // funcsToSymbolicate is an array of funcIndex.
    return symbolStore.getFuncAddressTableForLib(lib).then(funcAddressTable => {
      // We now have the func address table for lib. This lets us merge funcs
      // that are actually the same function.
      // We don't have any symbols yet. We'll request those after we've merged
      // the functions.
      let addrToFuncIndexMap = findFunctionsToMergeAndSymbolicationAddresses(funcAddressTable, funcsToSymbolicate, updatedThread.funcTable, oldFuncToNewFuncMap);
      scheduleThreadUpdate();

      // Now list the func addresses that we want symbols for, and request them.
      let funcAddrs = Array.from(addrToFuncIndexMap.keys()).sort((a, b) => a - b);
      return symbolStore.getSymbolsForAddressesInLib(funcAddrs, lib).then(funcNames => {
        // We have the symbol names now. Add them to our string table and point
        // to them from the funcTable.
        updatedThread = setFuncNames(updatedThread, funcAddrs, funcNames, addrToFuncIndexMap);
        scheduleThreadUpdate();
      });
    }).catch(error => {
      console.log(`Couldn't get symbols for library ${lib.pdbName} ${lib.breakpadId}`);
      // console.error(error);
      // Don't throw, so that the resulting promise will be resolved, thereby
      // indicating that we're done symbolicating with lib.
    });
  }));
}

/**
 * Symbolicate a profile.
 * @param  object profile     The profile to symbolicate, in preprocessed format.
 * @param  object symbolStore A SymbolStore object with a getFuncAddressTableForLib and getSymbolsForAddressesInLib methods.
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
