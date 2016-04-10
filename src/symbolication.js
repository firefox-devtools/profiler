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

/**
 * Find the functions in this thread's funcTable that we need symbols for.
 * @param  object thread The thread, in "preprocessed profile" format.
 * @return Map           A map containing the funcIndices. Each entry's key is a
 *                       lib object from the thread's libs array, and the value
 *                       is an array of funcIndex.
 *                       Example:
 *                       map.get(lib): [0, 1, 2, 8, 34]
 */
function gatherAddressesInThread(thread) {
  let { libs, funcTable, stringTable, resourceTable } = thread;
  let foundAddresses = new Map();
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

function fixupFrameTable(frameTable, oldFuncToNewFuncMap) {
  return Object.assign({}, frameTable, {
    func: frameTable.func.map(oldFunc => {
      const newFunc = oldFuncToNewFuncMap.get(oldFunc);
      return newFunc === undefined ? oldFunc : newFunc;
    })
  });
}

/**
 * XXX fix this comment
 * Using the provided symbol table, replace addresses in the thread's
 * funcTable with their corresponding symbols.
 * @param  array  [addrs, syms] The symbol table.
 * @param  array  addresses     The addresses to replace, as an array of
 *                              [funcTableIndex, integerAddressRelativeToLibrary]
 *                              elements.
 * @param  object funcTable     The funcTable that the funcIndices in addressToSymbolicate refer to.
 * @return object               A map that maps an address to a funcIndex.
 */
function mergeFunctions(addrs, addressesToSymbolicate, funcTable, oldFuncToNewFuncMap = new Map()) {
  let addrToFuncIndexMap = new Map();
  addressesToSymbolicate.sort((i1, i2) => {
    const address1 = funcTable.address[i1];
    const address2 = funcTable.address[i2];
    if (address1 !== address2) {
      return address1 - address2;
    }
    return i1 - i2;
  });
  let lastFuncIndex = -1;
  let nextFuncAddress = 0;
  let nextFuncAddressIndex = 0;
  for (let funcIndex of addressesToSymbolicate) {
    const addr = funcTable.address[funcIndex];
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
  return addrToFuncIndexMap;
}

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
 * "Functions" in a profile are created before the library's function table is
 * known, by creating one function per frame address. Once the function table
 * is known, different addresses that are inside the same function need to be
 * merged into that same function. For that purpose, 
 * @param  {[type]} thread              [description]
 * @param  {[type]} oldFuncToNewFuncMap [description]
 * @return {[type]}                     [description]
 */
function correctThreadFrameTableAndFuncStackTableAndSamplesAfterFunctionsWereMerged(thread, oldFuncToNewFuncMap) {
  const frameTable = fixupFrameTable(thread.frameTable, oldFuncToNewFuncMap);
  const { funcStackTable, samples } = createFuncStackTableAndFixupSamples(thread.stackTable, frameTable, thread.funcTable, thread.samples);
  return Object.assign({}, thread, { frameTable, funcStackTable, samples });
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
  let foundAddresses = gatherAddressesInThread(thread);
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
    updatedThread = correctThreadFrameTableAndFuncStackTableAndSamplesAfterFunctionsWereMerged(updatedThread, oldFuncToNewFuncMap)
    cbo.onUpdateThread(updatedThread, oldFuncToNewFuncMap);
    oldFuncToNewFuncMap = new Map();
    scheduledThreadUpdate = false;
  }

  return Promise.all(Array.from(foundAddresses).map(function ([lib, addresses]) {
    // addresses is an object containing two arrays as { funcIndex, address }
    return symbolStore.getFuncAddressTableForLib(lib).then(addrs => {
      let addrToFuncIndexMap = mergeFunctions(addrs, addresses, updatedThread.funcTable, oldFuncToNewFuncMap);
      scheduleThreadUpdate();
      let funcAddrs = Array.from(addrToFuncIndexMap.keys()).sort((a, b) => a - b);
      return symbolStore.getSymbolsForAddressesInLib(funcAddrs, lib).then(funcNames => {
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
