/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { resourceTypes } from './data-structures';
import { SymbolsNotFoundError } from './errors';

import type {
  Profile,
  Thread,
  ThreadIndex,
  Lib,
  IndexIntoFuncTable,
} from '../types/profile';
import type { MemoryOffset } from '../types/units';
import type {
  AbstractSymbolStore,
  AddressResult,
  LibSymbolicationRequest,
} from './symbol-store';

type SymbolicationHandlers = {
  onMergeFunctions: (
    threadIndex: ThreadIndex,
    Map<IndexIntoFuncTable, IndexIntoFuncTable>
  ) => void,
  onGotFuncNames: (
    threadIndex: ThreadIndex,
    funcIndices: IndexIntoFuncTable[],
    funcNames: string[]
  ) => void,
};

type LibKey = string; // of the form ${debugName}/${breakpadId}
type Address = number;
type ThreadSymbolicationInfo = Map<LibKey, Map<Address, IndexIntoFuncTable>>;

/**
 * Return the library object that contains the address such that
 * rv.start <= address < rv.end, or null if no such lib object exists.
 */
export function getContainingLibrary(
  libs: Lib[],
  address: MemoryOffset
): Lib | null {
  if (isNaN(address)) {
    return null;
  }

  let left = 0;
  let right = libs.length - 1;
  while (left <= right) {
    const mid = ((left + right) / 2) | 0;
    if (address >= libs[mid].end) {
      left = mid + 1;
    } else if (address < libs[mid].start) {
      right = mid - 1;
    } else {
      return libs[mid];
    }
  }
  return null;
}

/**
 * Find the functions in this thread's funcTable that we need symbols for. The map
 * that is returned is keyed off the Lib objects, and has a list of IndexIntoFuncTable
 * for the still unsymbolicated functions.
 */
function gatherFuncsInThread(thread: Thread): Map<Lib, IndexIntoFuncTable[]> {
  const { libs, funcTable, stringTable, resourceTable } = thread;
  const foundAddresses: Map<Lib, IndexIntoFuncTable[]> = new Map();
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
    if (libIndex === null || libIndex === undefined || libIndex === -1) {
      throw new Error('libIndex must be a valid index.');
    }
    const lib = libs[libIndex];
    if (lib === undefined) {
      throw new Error('Did not find a lib.');
    }
    let libFuncs = foundAddresses.get(lib);
    if (libFuncs === undefined) {
      libFuncs = [];
      foundAddresses.set(lib, libFuncs);
    }
    libFuncs.push(funcIndex);
  }
  return foundAddresses;
}

/**
 * Modify the symbolicated funcs to point to the new func name strings.
 * This function adds the func names to the thread's string table and
 * adjusts the funcTable to point to those strings.
 */
export function setFuncNames(
  thread: Thread,
  funcIndices: IndexIntoFuncTable[],
  funcNames: string[]
): Thread {
  const funcTable = Object.assign({}, thread.funcTable);
  funcTable.name = funcTable.name.slice();
  const stringTable = thread.stringTable;
  funcIndices.forEach((funcIndex, i) => {
    const symbolName = funcNames[i];
    const symbolIndex = stringTable.indexForString(symbolName);
    funcTable.name[funcIndex] = symbolIndex;
  });
  return { ...thread, funcTable, stringTable };
}

/**
 * Correctly collapse a function into another function and return a consistent
 * profile that no longer refers to the collapsed-away function.
 * The new frameTable has an updated func column, where all indices
 * to old funcs have been replaced to the corresponding new func.
 * "Functions" in a profile are created before the library's function table is
 * known, by creating one function per frame address. Once the function table
 * is known, different addresses that are inside the same function need to be
 * merged into that same function.
 */
export function applyFunctionMerging(
  thread: Thread,
  oldFuncToNewFuncMap: Map<IndexIntoFuncTable, IndexIntoFuncTable>
): Thread {
  const frameTable = Object.assign({}, thread.frameTable, {
    func: thread.frameTable.func.map(oldFunc => {
      const newFunc = oldFuncToNewFuncMap.get(oldFunc);
      return newFunc === undefined ? oldFunc : newFunc;
    }),
  });
  return { ...thread, frameTable };
}

// Gather the symbols needed in this thread into a nested map:
// libKey -> address relative to lib -> index of the func
function getThreadSymbolicationInfo(thread: Thread): ThreadSymbolicationInfo {
  const foundFuncMap = gatherFuncsInThread(thread);
  const { funcTable } = thread;
  const libKeyToAddressToFuncMap = new Map();
  for (const [lib, funcsToSymbolicate] of foundFuncMap) {
    const libKey = `${lib.debugName}/${lib.breakpadId}`;
    const addressToFuncMap = new Map();
    libKeyToAddressToFuncMap.set(libKey, addressToFuncMap);
    for (const funcIndex of funcsToSymbolicate) {
      const funcAddress = funcTable.address[funcIndex];
      addressToFuncMap.set(funcAddress, funcIndex);
    }
  }
  return libKeyToAddressToFuncMap;
}

// Go through all the threads to gather up the addresses we need to symbolicate
// for each library.
function buildLibSymbolicationRequestsForAllThreads(
  symbolicationInfo: ThreadSymbolicationInfo[]
): LibSymbolicationRequest[] {
  const libKeyToAddressesMap = new Map();
  for (const threadSymbolicationInfo of symbolicationInfo) {
    for (const [libKey, addressToFuncMap] of threadSymbolicationInfo) {
      let addressSet = libKeyToAddressesMap.get(libKey);
      if (addressSet === undefined) {
        addressSet = new Set();
        libKeyToAddressesMap.set(libKey, addressSet);
      }
      for (const funcAddress of addressToFuncMap.keys()) {
        addressSet.add(funcAddress);
      }
    }
  }
  return Array.from(libKeyToAddressesMap).map(([libKey, addresses]) => {
    const [debugName, breakpadId] = libKey.split('/');
    const lib = { debugName, breakpadId };
    return { lib, addresses };
  });
}

// With the symbolication results for the library given by libKey, call the
// symbolicationHandlers for each thread. Those calls will ensure that the
// symbolication information eventually makes it into the thread.
// Most of the work in this function is just munging the data that we have into
// the shape that the symbolicationHandlers methods expect.
function finishSymbolicationForLib(
  profile: Profile,
  symbolicationInfo: ThreadSymbolicationInfo[],
  resultsForLib: Map<number, AddressResult>,
  libKey: string,
  symbolicationHandlers: SymbolicationHandlers
): void {
  const { threads } = profile;
  for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
    const threadSymbolicationInfo = symbolicationInfo[threadIndex];
    const addressToFuncIndexMap = threadSymbolicationInfo.get(libKey);
    if (addressToFuncIndexMap !== undefined) {
      const funcAddressToCanonicalFuncIndexMap = new Map();
      const funcIndices = [];
      const funcNames = [];
      const oldFuncToNewFuncMap = new Map();
      for (const [address, funcIndex] of addressToFuncIndexMap) {
        const addressResult = resultsForLib.get(address);
        if (addressResult !== undefined) {
          // |address| is the original address that we found during stackwalking,
          // as a library-relative offset.
          // |addressResult.functionOffset| is the offset between the start of
          // the function and |address|.
          // |funcAddress| is the start of the function, as a library-relative
          // offset.
          const funcAddress = address - addressResult.functionOffset;
          const canonicalFuncIndexForThisFuncAddress = funcAddressToCanonicalFuncIndexMap.get(
            funcAddress
          );
          if (canonicalFuncIndexForThisFuncAddress !== undefined) {
            oldFuncToNewFuncMap.set(
              funcIndex,
              canonicalFuncIndexForThisFuncAddress
            );
          } else {
            funcAddressToCanonicalFuncIndexMap.set(funcAddress, funcIndex);
            funcIndices.push(funcIndex);
            funcNames.push(addressResult.name);
          }
        }
      }
      symbolicationHandlers.onMergeFunctions(threadIndex, oldFuncToNewFuncMap);
      symbolicationHandlers.onGotFuncNames(threadIndex, funcIndices, funcNames);
    }
  }
}

/**
 * When collecting profile samples, the profiler only collects raw memory addresses
 * of the program's functions. This function takes the list of memory addresses, and
 * uses a symbol store to look up the symbols (names) of all of the functions. Initially
 * each memory address is a assigned a function in the profile, but these addresses may
 * actually point to the same function. During the processes of symbolication, any memory
 * addresses that share the same function have their FrameTable and FuncTable updated
 * to point to same function.
 */
export async function symbolicateProfile(
  profile: Profile,
  symbolStore: AbstractSymbolStore,
  symbolicationHandlers: SymbolicationHandlers
): Promise<void> {
  const symbolicationInfo = profile.threads.map(getThreadSymbolicationInfo);
  const libSymbolicationRequests = buildLibSymbolicationRequestsForAllThreads(
    symbolicationInfo
  );
  await symbolStore.getSymbols(
    libSymbolicationRequests,
    (request, results) => {
      const { debugName, breakpadId } = request.lib;
      const libKey = `${debugName}/${breakpadId}`;
      finishSymbolicationForLib(
        profile,
        symbolicationInfo,
        results,
        libKey,
        symbolicationHandlers
      );
    },
    (request, error) => {
      if (!(error instanceof SymbolsNotFoundError)) {
        // rethrow JavaScript programming error
        throw error;
      }
      // We could not find symbols for this library.
      console.warn(error);
    }
  );
}
