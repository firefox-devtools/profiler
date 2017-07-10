/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import bisection from 'bisection';
import { resourceTypes } from './profile-data';
import immutableUpdate from '../utils/immutable-update';

import type {
  Profile,
  Thread,
  ThreadIndex,
  FuncTable,
  Lib,
  TaskTracer,
  IndexIntoFuncTable,
  IndexIntoTaskTracerAddresses,
} from '../types/profile';
import type { MemoryOffset } from '../types/units';
import type { SymbolStore } from './symbol-store';

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
  onGotTaskTracerNames: (IndexIntoTaskTracerAddresses[], string[]) => void,
};

type IndexIntoAddressTable = number;

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
 * Given a memory address, find the nearest library.
 */
export function getClosestLibrary(
  libs: Lib[],
  address: MemoryOffset
): null | Lib {
  if (isNaN(address)) {
    return null;
  }

  const startAddresses = libs.map(lib => lib.start);
  const libIndex = bisection.right(startAddresses, address, 0) - 1;
  if (libIndex < 0) {
    return null;
  }
  return libs[libIndex];
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
    if (libIndex === null || libIndex === undefined) {
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
 * Using the provided func address table, find out which funcs are actually the
 * same function, and make a list of the real func addresses that we need
 * symbols for.
 *
 * Before we had the func address table for this library, we weren't able to
 * tell whether two frames are the same function, so we naively created one
 * function per frame, giving each function the address of the frame.
 * Now that we know at which address each function truly starts, we can find
 * out which of the naively-created funcs are the same function and collapse
 * those into just one func. This information is returned in the
 * oldFuncToNewFuncMap.
 *
 * Before we can request symbols, we need to make a list of func addresses for
 * the symbols we need. These addresses need to be the true function start
 * addresses from the func address table. This information is returned in the
 * return value - the return value is a map whose keys are the true func
 * addresses that we need symbols for. The value of each map entry is the
 * funcIndex for the func that has become the "one true func" for this function.
 */
function findFunctionsToMergeAndSymbolicationAddresses(
  funcAddressTable: Uint32Array,
  funcsToSymbolicate: IndexIntoFuncTable[],
  funcTable: FuncTable
): {|
  funcAddrIndices: IndexIntoAddressTable[],
  funcIndices: IndexIntoFuncTable[],
  oldFuncToNewFuncMap: Map<IndexIntoFuncTable, IndexIntoFuncTable>,
|} {
  const oldFuncToNewFuncMap = new Map();
  const funcAddrIndices = [];
  const funcIndices = [];

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
  for (const funcIndex of funcsToSymbolicate) {
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
    const funcAddressIndex =
      bisection.right(funcAddressTable, funcAddress, nextFuncAddressIndex) - 1;
    if (funcAddressIndex >= 0) {
      // TODO: Take realFuncAddress and put it into the func table.
      // const realFuncAddress = funcAddressTable[funcAddressIndex];
      nextFuncAddressIndex = funcAddressIndex + 1;
      nextFuncAddress =
        nextFuncAddressIndex < funcAddressTable.length
          ? funcAddressTable[nextFuncAddressIndex]
          : Infinity;
      lastFuncIndex = funcIndex;
      funcAddrIndices.push(funcAddressIndex);
      funcIndices.push(funcIndex);
    }
  }
  return { funcAddrIndices, funcIndices, oldFuncToNewFuncMap };
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
  return Object.assign({}, thread, { funcTable, stringTable });
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
  return Object.assign({}, thread, { frameTable });
}

/**
 * Symbolicate the given thread. Calls the symbolication handlers `onMergeFunctions`
 * and `onGotFuncNames` after each bit of symbolication, and resolves the returned
 * promise once completely done.
 */
function symbolicateThread(
  thread: Thread,
  threadIndex: ThreadIndex,
  symbolStore: SymbolStore,
  symbolicationHandlers: SymbolicationHandlers
): Promise<void[]> {
  const foundFuncMap = gatherFuncsInThread(thread);
  return Promise.all(
    Array.from(foundFuncMap).map(function([lib, funcsToSymbolicate]) {
      // lib is a lib object from thread.libs.
      // funcsToSymbolicate is an array of funcIndex.
      return symbolStore
        .getFuncAddressTableForLib(lib)
        .then(funcAddressTable => {
          // We now have the func address table for lib. This lets us merge funcs
          // that are actually the same function.
          // We don't have any symbols yet. We'll request those after we've merged
          // the functions.
          const {
            funcAddrIndices,
            funcIndices,
            oldFuncToNewFuncMap,
          } = findFunctionsToMergeAndSymbolicationAddresses(
            funcAddressTable,
            funcsToSymbolicate,
            thread.funcTable
          );
          symbolicationHandlers.onMergeFunctions(
            threadIndex,
            oldFuncToNewFuncMap
          );

          // Now list the func addresses that we want symbols for, and request them.
          return symbolStore
            .getSymbolsForAddressesInLib(funcAddrIndices, lib)
            .then(funcNames => {
              symbolicationHandlers.onGotFuncNames(
                threadIndex,
                funcIndices,
                funcNames
              );
            });
        })
        .catch(() => {
          // We could not find symbols for this library.
          // Don't throw, so that the resulting promise will be resolved, thereby
          // indicating that we're done symbolicating with lib.
        });
    })
  );
}

function symbolicateTaskTracer(
  tasktracer: TaskTracer,
  symbolStore: SymbolStore,
  symbolicationHandlers: SymbolicationHandlers
): Promise<void[]> {
  const { addressTable, addressIndicesByLib } = tasktracer;
  return Promise.all(
    Array.from(addressIndicesByLib).map(([lib, addressIndices]) => {
      return symbolStore
        .getFuncAddressTableForLib(lib)
        .then(funcAddressTable => {
          addressIndices.sort(
            (a, b) => addressTable.address[a] - addressTable.address[b]
          );
          const funcAddrIndices = [];
          const addressIndicesToSymbolicate = [];
          for (const addressIndex of addressIndices) {
            const address = addressTable.address[addressIndex];
            const funcAddressIndex =
              bisection.right(funcAddressTable, address, 0) - 1;
            if (funcAddressIndex >= 0) {
              funcAddrIndices.push(funcAddressIndex);
              addressIndicesToSymbolicate.push(addressIndex);
            }
          }
          return symbolStore
            .getSymbolsForAddressesInLib(funcAddrIndices, lib)
            .then(symbolNames => {
              symbolicationHandlers.onGotTaskTracerNames(
                addressIndicesToSymbolicate,
                symbolNames
              );
            });
        });
    })
  );
}

/**
 * Modify certain known symbol names for cleaner presentations.
 */
function classNameFromSymbolName(symbolName: string): string {
  let className = symbolName;

  const vtablePrefix = 'vtable for ';
  if (className.startsWith(vtablePrefix)) {
    className = className.substring(vtablePrefix.length);
  }

  const sourceEventMarkerPos = className.indexOf(
    'SourceEventType)::CreateSourceEvent'
  );
  if (sourceEventMarkerPos !== -1) {
    return className.substring(
      sourceEventMarkerPos + 'SourceEventType)::Create'.length
    );
  }

  const runnableFunctionMarker = 'mozilla::detail::RunnableFunction<';
  if (className.startsWith(runnableFunctionMarker)) {
    const parenPos = className.indexOf('(', runnableFunctionMarker.length + 1);
    const functionName = className.substring(
      runnableFunctionMarker.length,
      parenPos
    );
    return `RunnableFunction(${functionName})`;
  }

  const runnableMethodMarker = 'mozilla::detail::RunnableMethodImpl<';
  if (className.startsWith(runnableMethodMarker)) {
    const parenPos = className.indexOf('(', runnableMethodMarker.length);
    const endPos = className.indexOf('::*)', parenPos + 1);
    className = className.substring(parenPos + 1, endPos);
    return `RunnableMethod(${className})`;
  }

  return className;
}

export function setTaskTracerNames(
  tasktracer: TaskTracer,
  addressIndices: IndexIntoTaskTracerAddresses[],
  symbolNames: string[]
): TaskTracer {
  const { stringTable, addressTable } = tasktracer;
  const className = addressTable.className.slice();
  for (let i = 0; i < addressIndices.length; i++) {
    const addressIndex = addressIndices[i];
    const classNameString = classNameFromSymbolName(symbolNames[i]);
    className[addressIndex] = stringTable.indexForString(classNameString);
  }
  return immutableUpdate(tasktracer, {
    addressTable: immutableUpdate(tasktracer.addressTable, { className }),
  });
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
export function symbolicateProfile(
  profile: Profile,
  symbolStore: SymbolStore,
  symbolicationHandlers: SymbolicationHandlers
): Promise<void[] | void> {
  const symbolicationPromises = profile.threads.map((thread, threadIndex) => {
    return symbolicateThread(
      thread,
      threadIndex,
      symbolStore,
      symbolicationHandlers
    );
  });
  if ('tasktracer' in profile) {
    symbolicationPromises.push(
      symbolicateTaskTracer(
        profile.tasktracer,
        symbolStore,
        symbolicationHandlers
      )
    );
  }
  return Promise.all(symbolicationPromises).then(() => undefined);
}
