/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  getRawStackTableBuilder,
  finishRawFrameTableBuilder,
  finishRawStackTableBuilder,
  shallowCloneFuncTable,
  finishRawNativeSymbolTableBuilder,
  getRawNativeSymbolTableBuilderWithExistingContents,
  getRawFrameTableBuilderWithExistingContents,
} from './data-structures';
import type {
  RawFrameTableBuilder,
  RawNativeSymbolTableBuilder,
} from './data-structures';
import { SymbolsNotFoundError } from './errors';

import type {
  Profile,
  RawProfileSharedData,
  RawThread,
  RawStackTable,
  FuncTable,
  SourceTable,
  IndexIntoFuncTable,
  IndexIntoFrameTable,
  IndexIntoResourceTable,
  IndexIntoNativeSymbolTable,
  IndexIntoSourceTable,
  IndexIntoStringTable,
  IndexIntoLibs,
  Address,
  CallNodePath,
  Lib,
} from 'firefox-profiler/types';
import { FrameFlag } from 'firefox-profiler/types';
import type {
  AbstractSymbolStore,
  AddressResult,
  LibSymbolicationRequest,
} from './symbol-store';
import { PathSet } from '../utils/path';
import { StringTable } from '../utils/string-table';
import { updateRawThreadStacks } from './profile-data';

// Contains functions to symbolicate a profile.

/**
 * Symbolication Overview
 *
 * Symbolication is the process of looking up function names for native code and
 * assigning those function names to the functions in the profile.
 *
 * When the profiler samples call stacks for native code, it only collects
 * addresses: the address of the instruction which is currently being executed,
 * and the "return addresses" for its callers on the stack, i.e. the addresses
 * of the instructions that will be executed after each function returns.
 * To obtain a profile with function names, these addresses need to be
 * translated into library-relative offsets, looked up per library, and then
 * substituted with the corresponding function name strings in the profile.
 *
 * The actual lookup of symbols is not handled in this file; it is delegated to
 * an AbstractSymbolStore interface.
 *
 * The functions in this file perform the following tasks:
 *  - assigning addresses to their containing libraries so that they can be
 *    translated into library-relative offsets
 *  - gathering all addresses in the profile which require symbolication,
 *    grouped by library, and requesting symbols from the symbol store
 *  - once the results from the symbol store come in, performing the
 *    substutitions in the profile.
 *
 * Implementation details
 *
 * The implementation has the following constraints:
 *  - Symbolication needs to be asynchronous, and the profile needs to be fully
 *    interactive before symbols have arrived. This means that there needs to
 *    be an intact funcTable from the very start, because the call nodes for
 *    the call tree are based on funcs.
 *  - When the symbols arrive, we cannot mutate the profile in-place. Instead,
 *    we need to delegate the profile mutation to our caller so that it can go
 *    through redux actions and reducers; the profile is part of the redux state
 *    so any profile adjustment needs to follow proper procedure. This allows
 *    all derived data and UI that depends on profile contents to be notified
 *    and updated in the regular ways.
 *    It also allows multiple steps of symbolication to happen in one redux
 *    store update, which saves re-renders if symbol results for many small
 *    libraries arrive at nearly the same time.
 *  - When symbols arrive, the user shouldn't "lose their place" in the call
 *    tree UI; concretely this means that the selected call node and the set of
 *    expanded call nodes should survive symbolication-triggered adjustments of
 *    the funcTable as much as possible. More specifically, if all frames that
 *    used to be assigned to function A get reassigned to function B, we want to
 *    create an A -> B entry in an oldFuncToNewFuncsMap that gets dispatched in
 *    a redux action so that the appropriate parts of the redux state can react.
 *  - Multiple processes and threads in the profile will require symbols from
 *    the same set of native libraries, and the number and size of the
 *    symbolication requests for each library should be minimized. This means
 *    that we want to gather all needed addresses across the entire profile
 *    first, rather than requesting symbols separately for each thread.
 *
 * There are two symbolication scenarios: "Initial symbolication" and
 * "re-symbolication". Initial symbolication is the common case: It's kicked off
 * right after converting a Gecko profile into a processed profile.
 * Re-symbolication is the rarer case - it is invoked by an explicit user action,
 * from a button that's hidden away in a panel, and is only necessary if, for
 * some reason, the symbols obtained during initial symbolication were
 * incomplete or otherwise incorrect.
 *
 * Symbolication happens in a number of phases.
 *
 * I. Preparation during profile processing: When native code addresses initially
 * arrive in the Firefox profiler, they come in the form of hex strings in the
 * frame table of the Gecko profile. Profile processing then does the following:
 *  - It detects frames of native code based on the hex string format.
 *  - It looks up the containing library for each address.
 *  - For each native frame, it creates one funcTable entry. It can't really do
 *    any better at this point because it would need to have the symbols in
 *    order to create only one func per actual function. So, to repeat, the
 *    initial funcTable has one func per native frame.
 *    It also creates a nativeSymbols table but leaves it completely empty.
 *  - The frame and its func both get their address field set to the
 *    library-relative offset.
 *  - The frame's lib field is set to the index of the containing library in
 *    profile.libs. The frame's address field is relative to that lib.
 *    Symbolication groups frames by this field.
 *  - The func's resource field is set to a resource of type "library" with the
 *    name of the library. Multiple libraries with the same name can exist and
 *    they will share the same resource, for example in a merged profile from
 *    two different builds of the same library.
 *  - All frames start out with their nativeSymbol field set to null.
 *  - All return addresses are adjusted by subtracting one byte, to point into
 *    the call instruction. See nudgeReturnAddresses for details.
 *
 * II. Address gathering per library: This step goes through all threads and
 * gathers up addresses per library that need to be symbolicated. It also keeps
 * around enough per-thread information so that the per-thread substitution step
 * at the end can perform its work efficiently.
 *
 * III. Symbol lookup: Handled by the AbstractSymbolStore.
 *
 * IV. Symbol result processing: Forwards the symbol lookup result to the caller,
 * expecting a future call to applySymbolicationSteps.
 *
 * V. Profile substitution: Invoked from from a thunk action. Processes the
 * symbolication result, groups frame addresses by symbol addresses, finds or
 * creates nativeSymbols for these symbolAddresses, groups funcs by the function
 * name + filename, creates new funcs and frames for inlined calls, and sets
 * line numbers on frames. At the end, it creates a new thread object with an
 * updated frameTable, stackTable, funcTable, nativeSymbols and stringTable,
 * with the symbols substituted in the right places. This often causes many funcs
 * to be orphaned (no frames will use them any more); these orphaned funcs remain
 * in the funcTable. It also creates the oldFuncToNewFuncsMap.
 *
 * Re-symbolication only re-runs phases II through V. At the beginning of
 * re-symbolication, the frameTable, funcTable and nativeSymbols are in the
 * state that the previous symbolication left them in. If the previous
 * symbolication merged functions based on an incomplete symbol table, and
 * re-symbolication has a more detailed symbol table with finer-grained function
 * symbols to work with, then re-symbolication needs to split funcs up again.
 * Splitting up funcs means that a collection of frames which were all using the
 * same func before re-symbolication will be assigned to multiple funcs after
 * re-symbolication.
 * This is different to initial symbolication, which usually only needs to
 * *merge* funcs, not split them. That's because the initial profile mosty
 * starts out with a unique func for every frame, except for frames whose
 * address was observed both as a return address and as an instruction pointer
 * value; for those frame addresses there will be two different frames (one with
 * the original address and one with that address minus one byte) which share
 * the same func. Nevertheless, "splitting funcs" is very uncommon during
 * initial symbolication.
 *
 * When funcs are merged, oldFuncToNewFuncsMap lets us update other parts of the
 * redux state that refer to func indexes. But when funcs are split, this is not
 * possible. But since function splitting is the rare case, we accept this
 * imperfection.
 *
 * Example for oldFuncToNewFuncsMap:
 *
 * Let's say we have a frameTable [0, 1, 2, 3, 4, 5, 6, 7, 8] and all frames are
 * from the same lib. Profile processing creates an initial funcTable with one
 * func per frame: [A, B, C, D, E, F, G, H, I].
 * Now let's say we have two samples with the following frame stacks:
 * 0-1-2-3-4 and 0-1-2-3-7. At the beginning, these are the call paths
 * A-B-C-D-E and A-B-C-D-H. ("Call paths" are stacks that, rather than being
 * made of frames, are made of the frames' corresponding funcs.)
 * The user selects the call node with the call path A-B-C-D-H in the call tree.
 * Now we look up symbols for all frame addresses, and frames 4 and 7 turn out
 * to belong to the same function. We choose function E as the shared function.
 * We update the thread with an oldFuncToNewFuncsMap that contains an entry H -> E.
 * This collapses both call paths into the call path A-B-C-D-E, and A-B-C-D-E
 * becomes the selected call node.
 * Now, let's say initial symbolication used an incomplete symbol table that
 * mapped the addresses for frames 0,1,2,3 to one function and 4,5,6,7,8 to
 * another function, so our samples' call paths both become A-A-A-A-E. We update
 * the thread and the selected call path, which is now A-A-A-A-E.
 * Luckily, bad symbols leave the frame addresses intact: Our samples still have
 * the frame stacks 0-1-2-3-4 and 0-1-2-3-7, it's only their corresponding call
 * paths which are A-A-A-A-E.
 * Now we re-symbolicate the profile with a good symbol table, and frames 0 to 3
 * are assigned to different functions again; this time we happened to pick the
 * assignment 0 -> A, 1 -> D, 2 -> B, 3 -> C. So now our samples' call paths
 * become A-D-B-C-E.
 * There is no way to choose oldFuncToNewFuncsMap so that the selected call path
 * A-A-A-A-E can become A-D-B-C-E. So in the case of splitting functions we
 * accept that the current selection is lost and that some expanded call nodes
 * will close.
 */

type LibKey = string; // of the form ${debugName}/${breakpadId}

export type SymbolicationStepCallback = (
  symbolicationStepInfo: SymbolicationStepInfo
) => void;

type ProfileLibSymbolicationInfo = {
  // The resource to give to funcs which are newly created for this lib, or -1
  // if this lib's frames have no resource. Multiple libs can share a resource.
  resourceIndex: IndexIntoResourceTable | -1;
  // The libIndex for this lib in this thread.
  libIndex: IndexIntoLibs;
  // The set of funcs for this lib in this thread.
  allFuncsForThisLib: Set<IndexIntoFuncTable>;
  // The set of native symbols for this lib in this thread.
  allNativeSymbolsForThisLib: Set<IndexIntoNativeSymbolTable>;
  // All frames for this lib in this thread.
  allFramesForThisLib: Array<IndexIntoFrameTable>;
  // All addresses for frames for this lib in this thread, as lib-relative offsets.
  frameAddresses: Array<Address>;
};

// This type exists because we symbolicate the profile in steps in order to
// provide a profile to the user faster. This type represents a single step.
export type SymbolicationStepInfo = {
  libSymbolicationInfo: ProfileLibSymbolicationInfo;
  resultsForLib: Map<Address, AddressResult>;
};

export type FuncToFuncsMap = Map<IndexIntoFuncTable, IndexIntoFuncTable[]>;

// The mutable tables which the symbolication steps of one batch operate on.
// These are created once per batch and mutated in place by each step.
type SymbolicationTables = {
  frameTable: RawFrameTableBuilder;
  funcTable: FuncTable;
  nativeSymbols: RawNativeSymbolTableBuilder;
  sources: SourceTable;
  // Maps a filename string index to the index of the native (id === null)
  // source entry for that filename, so that we don't have to scan the sources
  // table for every new func.
  sourceIndexForNativeFilename: Map<IndexIntoStringTable, IndexIntoSourceTable>;
  stringTable: StringTable;
};

type ProfileSymbolicationInfo = Map<LibKey, ProfileLibSymbolicationInfo>;

/**
 * Like `new Map(iterableOfEntryPairs)`: Creates a map from an iterable of
 * [key, value] pairs. The difference to new Map(...) is what happens if the
 * same key is present multiple times: makeConsensusMap will only contain an
 * entry for a key if the key has the same value in all its uses.
 * In other words, "divergent" entries are removed from the map.
 * Examples:
 *   makeConsensusMap([[1, "hello"], [2, "world"]]) -> 2 entries
 *   makeConsensusMap([[1, "hello"], [2, "world"], [1, "hello"]]) -> 2 entries
 *   makeConsensusMap([[1, "hello"], [2, "world"], [1, "bye"]]) -> 1 entry
 */
function makeConsensusMap<K, V>(
  iterableOfEntryPairs: Iterable<[K, V]>
): Map<K, V> {
  const consensusMap = new Map<K, V>();
  const divergentKeys = new Set<K>();
  for (const [key, value] of iterableOfEntryPairs) {
    if (divergentKeys.has(key)) {
      continue;
    }
    const previousValue = consensusMap.get(key);
    if (previousValue === undefined) {
      consensusMap.set(key, value);
      continue;
    }
    if (previousValue !== value) {
      consensusMap.delete(key);
      divergentKeys.add(key);
    }
  }
  return consensusMap;
}

/**
 * Gather the symbols needed in this thread, and some auxiliary information that
 * allows the symbol substitation step at the end to work efficiently.
 * Returns a map with one entry for each library that has frames in the profile.
 */
function getSymbolicationInfo(
  shared: RawProfileSharedData,
  libs: Lib[]
): ProfileSymbolicationInfo {
  const { frameTable, funcTable, nativeSymbols } = shared;

  // Pass 1 over the frames: group frames (and their addresses) by library, and
  // work out which library each func belongs to.
  //
  // A func can be referenced by frames from more than one library, for example
  // when two builds of the same library share a resource and symbolication has
  // resolved frames from both builds to the same name. Such a func must not be
  // recycled by either library, so we mark it with FUNC_LIB_SHARED.
  const FUNC_LIB_NONE = -1;
  const FUNC_LIB_SHARED = -2;
  const libForFunc = new Int32Array(funcTable.length).fill(FUNC_LIB_NONE);
  const framesByLib = new Map<
    IndexIntoLibs,
    { frames: IndexIntoFrameTable[]; addresses: Address[] }
  >();
  for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
    if ((frameTable.flags[frameIndex] & FrameFlag.HasAddress) === 0) {
      continue;
    }
    const libIndex = frameTable.lib[frameIndex];
    let entry = framesByLib.get(libIndex);
    if (entry === undefined) {
      entry = { frames: [], addresses: [] };
      framesByLib.set(libIndex, entry);
    }
    entry.frames.push(frameIndex);
    entry.addresses.push(frameTable.address[frameIndex]);

    const funcIndex = frameTable.func[frameIndex];
    const knownLib = libForFunc[funcIndex];
    if (knownLib === FUNC_LIB_NONE) {
      libForFunc[funcIndex] = libIndex;
    } else if (knownLib !== libIndex) {
      libForFunc[funcIndex] = FUNC_LIB_SHARED;
    }
  }

  // Pass over the funcs: assign each func to the library that gets to recycle
  // it, and remember one resource per library for the funcs we create later.
  const funcsByLib = new Map<IndexIntoLibs, Set<IndexIntoFuncTable>>();
  const resourceForLib = new Map<IndexIntoLibs, IndexIntoResourceTable>();
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    const libIndex = libForFunc[funcIndex];
    if (libIndex < 0) {
      continue;
    }
    let funcs = funcsByLib.get(libIndex);
    if (funcs === undefined) {
      funcs = new Set();
      funcsByLib.set(libIndex, funcs);
    }
    funcs.add(funcIndex);
    if (!resourceForLib.has(libIndex)) {
      const resourceIndex = funcTable.resource[funcIndex];
      if (resourceIndex !== -1) {
        resourceForLib.set(libIndex, resourceIndex);
      }
    }
  }

  // Pass over the native symbols: group them by library.
  const nativeSymbolsByLib = new Map<
    IndexIntoLibs,
    Set<IndexIntoNativeSymbolTable>
  >();
  for (
    let nativeSymbolIndex = 0;
    nativeSymbolIndex < nativeSymbols.length;
    nativeSymbolIndex++
  ) {
    const libIndex = nativeSymbols.libIndex[nativeSymbolIndex];
    let symbols = nativeSymbolsByLib.get(libIndex);
    if (symbols === undefined) {
      symbols = new Set();
      nativeSymbolsByLib.set(libIndex, symbols);
    }
    symbols.add(nativeSymbolIndex);
  }

  const map = new Map<string, ProfileLibSymbolicationInfo>();
  for (const [libIndex, { frames, addresses }] of framesByLib) {
    const lib = libs[libIndex];
    if (lib === undefined) {
      throw new Error('Did not find a lib.');
    }

    const libKey = `${lib.debugName}/${lib.breakpadId}`;
    map.set(libKey, {
      libIndex,
      resourceIndex: resourceForLib.get(libIndex) ?? -1,
      allFuncsForThisLib: funcsByLib.get(libIndex) ?? new Set(),
      allNativeSymbolsForThisLib: nativeSymbolsByLib.get(libIndex) ?? new Set(),
      allFramesForThisLib: frames,
      frameAddresses: addresses,
    });
  }
  return map;
}

// Go through all the threads to gather up the addresses we need to symbolicate
// for each library.
function buildLibSymbolicationRequestsForAllThreads(
  symbolicationInfo: ProfileSymbolicationInfo
): LibSymbolicationRequest[] {
  const libKeyToAddressesMap = new Map<string, Set<number>>();
  for (const [libKey, { frameAddresses }] of symbolicationInfo) {
    let addressSet = libKeyToAddressesMap.get(libKey);
    if (addressSet === undefined) {
      addressSet = new Set();
      libKeyToAddressesMap.set(libKey, addressSet);
    }
    for (const frameAddress of frameAddresses) {
      addressSet.add(frameAddress);
    }
  }
  return Array.from(libKeyToAddressesMap).map(([libKey, addresses]) => {
    const [debugName, breakpadId] = libKey.split('/');
    const lib = { debugName, breakpadId };
    return { lib, addresses };
  });
}

// With the symbolication results for the library given by libKey, call
// symbolicationStepCallback for each thread. Those calls will
// ensure that the symbolication information eventually makes it into the thread.
// This function leaves all the actual work to applySymbolicationSteps.
function finishSymbolicationForLib(
  symbolicationInfo: ProfileSymbolicationInfo,
  resultsForLib: Map<Address, AddressResult>,
  libKey: string,
  symbolicationStepCallback: SymbolicationStepCallback
): void {
  const libSymbolicationInfo = symbolicationInfo.get(libKey);
  if (libSymbolicationInfo === undefined) {
    return;
  }
  const symbolicationStep = { libSymbolicationInfo, resultsForLib };
  symbolicationStepCallback(symbolicationStep);
}

// Create a new stack table where all stack nodes with frames in
// frameIndexToInlineExpansionFrames have been replaced by a straight path
// of stack nodes for that frame's new inline frames.
// In addition, old stacks with frames for which shouldStacksWithThisOldFrameBeRemoved
// is not zero will be removed, i.e. merged away so that their children are
// reparented to the merged-away stack's parent.
//
// Example:
//  stack table:
//  - stack A with frame 0
//    - stack B with frame 1
//      - stack C with frame 2
//    - stack D with frame 3
//      - stack E with frame 4
//      - stack F with frame 5
//
//  frameIndexToInlineExpansionFrames:
//  1 => [1, 6, 7]
//  4 => [4, 8]
//
//  result:
//  - stack A with frame 0
//    - stack B with frame 1
//      - stack B' with frame 6
//        - stack B'' with frame 7
//          - stack C with frame 2
//    - stack D with frame 3
//      - stack E with frame 4
//        - stack E' with frame 8
//      - stack F with frame 5
function _computeStackTableWithAddedExpansionStacks(
  stackTable: RawStackTable,
  shouldStacksWithThisOldFrameBeRemoved: Uint8Array,
  frameIndexToInlineExpansionFrames: Map<
    IndexIntoFrameTable,
    IndexIntoFrameTable[]
  >
): { newStackTable: RawStackTable; oldStackToNewStack: Int32Array } | null {
  if (frameIndexToInlineExpansionFrames.size === 0) {
    return null;
  }
  const newStackTable = getRawStackTableBuilder();
  const oldStackToNewStack = new Int32Array(stackTable.length);
  for (let stack = 0; stack < stackTable.length; stack++) {
    const oldFrame = stackTable.frame[stack];
    const oldPrefixOffset = stackTable.prefixOffset[stack];
    const newPrefixOrMinusOne =
      oldPrefixOffset === 0 ? -1 : oldStackToNewStack[stack - oldPrefixOffset];
    if (shouldStacksWithThisOldFrameBeRemoved[oldFrame] !== 0) {
      // Don't add this stack node to the new stack table. Instead, make it
      // so that this node's children use our prefix as their prefix.
      oldStackToNewStack[stack] = newPrefixOrMinusOne;
      continue;
    }
    let expansionFrames = frameIndexToInlineExpansionFrames.get(oldFrame);
    if (expansionFrames === undefined) {
      expansionFrames = [oldFrame];
    }
    let prefix = newPrefixOrMinusOne !== -1 ? newPrefixOrMinusOne : null;
    for (
      let inlineDepth = 0;
      inlineDepth < expansionFrames.length;
      inlineDepth++
    ) {
      const frame = expansionFrames[inlineDepth];
      const newStack = newStackTable.length;
      newStackTable.frame.push(frame);
      newStackTable.prefix.push(prefix);
      newStackTable.length++;
      prefix = newStack;
    }
    oldStackToNewStack[stack] = prefix ?? -1;
  }
  return {
    newStackTable: finishRawStackTableBuilder(newStackTable),
    oldStackToNewStack,
  };
}

/**
 * This implements step V, Profile substitution. The information from
 * symbolicationSteps is used to create a new thread with the new symbols.
 */
export function applySymbolicationSteps(
  oldThreads: RawThread[],
  oldShared: RawProfileSharedData,
  symbolicationSteps: SymbolicationStepInfo[]
): {
  threads: RawThread[];
  shared: RawProfileSharedData;
  oldFuncToNewFuncsMap: FuncToFuncsMap;
} {
  const oldFuncToNewFuncsMap: FuncToFuncsMap = new Map();
  const frameCount = oldShared.frameTable.length;
  const shouldStacksWithThisFrameBeRemoved = new Uint8Array(frameCount);
  const frameIndexToInlineExpansionFrames = new Map<
    IndexIntoFrameTable,
    IndexIntoFrameTable[]
  >();

  // Create the mutable copies of the shared tables once, and let every
  // symbolication step mutate them in place. Copying the frameTable in and out
  // of its builder form is expensive (it converts multiple typed array columns
  // to regular arrays and back), so doing it once per batch rather than once
  // per step is a big win when many libraries are symbolicated at the same time.
  const frameTable = getRawFrameTableBuilderWithExistingContents(
    oldShared.frameTable
  );
  const funcTable = shallowCloneFuncTable(oldShared.funcTable);
  const nativeSymbols = getRawNativeSymbolTableBuilderWithExistingContents(
    oldShared.nativeSymbols
  );
  const { sources, stringArray } = oldShared;
  const stringTable = StringTable.withBackingArray(stringArray);
  const sourceIndexForNativeFilename = new Map<
    IndexIntoStringTable,
    IndexIntoSourceTable
  >();
  for (let i = 0; i < sources.length; i++) {
    if (sources.id[i] === null) {
      sourceIndexForNativeFilename.set(sources.filename[i], i);
    }
  }
  const tables: SymbolicationTables = {
    frameTable,
    funcTable,
    nativeSymbols,
    sources,
    sourceIndexForNativeFilename,
    stringTable,
  };

  for (const symbolicationStep of symbolicationSteps) {
    _partiallyApplySymbolicationStep(
      tables,
      symbolicationStep,
      oldFuncToNewFuncsMap,
      shouldStacksWithThisFrameBeRemoved,
      frameIndexToInlineExpansionFrames
    );
  }

  let shared: RawProfileSharedData = {
    ...oldShared,
    frameTable: finishRawFrameTableBuilder(frameTable),
    funcTable,
    nativeSymbols: finishRawNativeSymbolTableBuilder(nativeSymbols),
  };

  const newStackInfo = _computeStackTableWithAddedExpansionStacks(
    shared.stackTable,
    shouldStacksWithThisFrameBeRemoved,
    frameIndexToInlineExpansionFrames
  );

  if (newStackInfo === null) {
    return { threads: oldThreads, shared, oldFuncToNewFuncsMap };
  }

  const { newStackTable, oldStackToNewStack } = newStackInfo;
  shared = {
    ...shared,
    stackTable: newStackTable,
  };

  const threads = updateRawThreadStacks(oldThreads, (oldStack) => {
    if (oldStack === null) {
      return null;
    }
    const newStack = oldStackToNewStack[oldStack];
    return newStack !== -1 ? newStack : null;
  });

  return { threads, shared, oldFuncToNewFuncsMap };
}

/**
 * Apply symbolication to the thread, based on the information that was prepared
 * in symbolicationStepInfo. This involves updating the funcTable to contain the
 * right symbol string and funcAddress, and updating the frameTable to assign
 * frames to the right funcs. When multiple frames are merged into one func,
 * some funcs can become orphaned; they remain in the funcTable.
 * oldFuncToNewFuncsMap is mutated to include the new mappings that result from
 * this symbolication step. oldFuncToNewFuncsMap is allowed to contain existing
 * content; the existing entries are assumed to be for other libs, i.e. they're
 * expected to have no overlap with allFuncsForThisLib.
 *
 * What this function doesn't do is update the stackTable to point to the new
 * frames and funcs; after this function returns, the stackTable still points to
 * old frames which may have been repurposed into different frames. To fully
 * conclude symbolication of this thread, the caller needs to apply the
 * modifications written down in shouldStacksWithThisFrameBeRemoved and in
 * frameIndexToInlineExpansionFrames to the stackTable. Those two parameters are
 * mutated in this function. Just like oldFuncToNewFuncsMap, these parameters
 * may contain existing mappings from the symbolication of other libraries in
 * this thread.
 *
 * Creating a new stackTable can be very expensive; doing it in the caller allows
 * the caller to delay the creation of the new stackTable until the symbolication
 * steps from multiple libraries have been processed. This can be much faster.
 *
 * The tables in `tables` are mutated in place, and are shared between all the
 * symbolication steps of a batch. Each step only touches the frames, funcs and
 * native symbols which belong to its own library, so the steps don't interfere
 * with each other.
 */
function _partiallyApplySymbolicationStep(
  tables: SymbolicationTables,
  symbolicationStepInfo: SymbolicationStepInfo,
  oldFuncToNewFuncsMap: FuncToFuncsMap,
  shouldStacksWithThisFrameBeRemoved: Uint8Array,
  frameIndexToInlineExpansionFrames: Map<
    IndexIntoFrameTable,
    IndexIntoFrameTable[]
  >
): void {
  const {
    frameTable,
    funcTable,
    nativeSymbols,
    sources,
    sourceIndexForNativeFilename,
    stringTable,
  } = tables;
  const { libSymbolicationInfo, resultsForLib } = symbolicationStepInfo;
  const {
    resourceIndex,
    allFramesForThisLib,
    allFuncsForThisLib,
    allNativeSymbolsForThisLib,
    libIndex,
  } = libSymbolicationInfo;

  const availableFuncs: Set<IndexIntoFuncTable> = new Set(allFuncsForThisLib);
  const availableNativeSymbols: Set<IndexIntoFuncTable> = new Set(
    allNativeSymbolsForThisLib
  );
  const frameToSymbolAddressMap: Map<IndexIntoFrameTable, Address> = new Map();
  const symbolAddressToInfoMap: Map<Address, AddressResult> = new Map();
  const symbolAddressToCanonicalSymbolIndexMap: Map<
    Address,
    IndexIntoNativeSymbolTable
  > = new Map();

  // If this profile was symbolicated before, we may have frames for inlined functions
  // in the profile. Partition those out because their frame addresses are also present
  // in non-inlined frames. Then remove any stack nodes for inline frames from the stack
  // table, because and having a "clean" stack table with no inline frames makes the
  // rest of symbolication easier.
  const inlinedFrames = [];
  const nonInlinedFrames = [];
  for (const frameIndex of allFramesForThisLib) {
    if ((frameTable.flags[frameIndex] & FrameFlag.IsInlined) !== 0) {
      inlinedFrames.push(frameIndex);
      shouldStacksWithThisFrameBeRemoved[frameIndex] = 1;
    } else {
      nonInlinedFrames.push(frameIndex);
    }
  }

  // We want to group frames into nativeSymbols, and give each nativeSymbol a name.
  // We group frames to the same nativeSymbol if the addresses for these frames resolve
  // to the same symbolAddress.
  // We obtain the funcAddress from the symbolication information in resultsForLib:
  // resultsForLib does not only contain the name of the function; it also contains,
  // for each address, the symbolAddress.
  // All frames with the same symbolAddress are grouped into the same nativeSymbol.
  // Afterwards, we create funcs for symbols with the same name, and then group frames
  // into funcs.
  for (const frameIndex of nonInlinedFrames) {
    const oldFrameHasSymbol =
      (frameTable.flags[frameIndex] & FrameFlag.HasNativeSymbol) !== 0;
    const oldFrameSymbol = frameTable.nativeSymbol[frameIndex];
    const address = frameTable.address[frameIndex];
    let addressResult: AddressResult | void = resultsForLib.get(address);
    if (addressResult === undefined) {
      if (oldFrameHasSymbol) {
        const oldSymbolName = stringTable.getString(
          nativeSymbols.name[oldFrameSymbol]
        );
        addressResult = {
          symbolAddress: nativeSymbols.address[oldFrameSymbol],
          name: oldSymbolName,
        };
      } else {
        addressResult = {
          symbolAddress: address,
          name: `0x${address.toString(16)}`,
        };
      }
    }

    // |address| is the original frame address that we found during
    // stackwalking, as a library-relative offset.
    // |symbolAddress| is the start of the function, as a library-relative
    // offset.
    const symbolAddress = addressResult.symbolAddress;
    frameToSymbolAddressMap.set(frameIndex, symbolAddress);
    symbolAddressToInfoMap.set(symbolAddress, addressResult);

    if (oldFrameHasSymbol) {
      // Opportunistically match up symbolAddress with oldFrameSymbol.
      if (!symbolAddressToCanonicalSymbolIndexMap.has(symbolAddress)) {
        if (availableNativeSymbols.has(oldFrameSymbol)) {
          // Use the frame's old symbol as the canonical symbol for this symbolAddress.
          const newFrameSymbol = oldFrameSymbol;
          availableNativeSymbols.delete(newFrameSymbol);
          symbolAddressToCanonicalSymbolIndexMap.set(
            symbolAddress,
            newFrameSymbol
          );
        } else {
          // oldFrameSymbol has already been used as the canonical symbol for a
          // different symbolAddress. This can happen during re-symbolication.
          // For now, symbolAddressToCanonicalSymbolIndexMap will not contain an
          // entry for this symbolAddress.
          // But that state will be resolved eventually:
          // Either in the course of the rest of this loop (when another frame
          // will donate its oldFrameSymbol), or further down in this function.
        }
      }
    }
  }

  // We now have the symbolAddress for every frame, in frameToSymbolAddressMap.
  // We have also assigned a subset of symbolAddresses to canonical symbols.
  // These symbols have been removed from availableNativeSymbols; availableNativeSymbols
  // contains the subset of existing symbols in the thread that do not have a
  // symbolAddress yet.
  // If this is the initial symbolication, no symbol address will have a canonical
  // symbol because the nativeSymbols table starts out empty.
  // If this is a re-symbolication, then some symbolAddresses may not have
  // a canonical symbol yet, because oldFrameSymbol might already have become
  // the canonical symbol for a different symbolAddress.
  //
  // We need to do the following:
  //  - Find a canonical symbol for every symbolAddress
  //  - give symbols the new name and address
  //  - assign frames to new symbols

  // Find a canonical symbolIndex for any symbolAddress that doesn't have one yet,
  // and give the canonical symbol the right address and symbol.
  const availableNativeSymbolIterator = availableNativeSymbols.values();
  for (const [symbolAddress, addressResult] of symbolAddressToInfoMap) {
    const symbolStringIndex = stringTable.indexForString(addressResult.name);
    let symbolIndex = symbolAddressToCanonicalSymbolIndexMap.get(symbolAddress);
    if (symbolIndex === undefined) {
      // Repurpose a symbol from availableNativeSymbols as the canonical symbol for this
      // symbolAddress.
      symbolIndex = availableNativeSymbolIterator.next().value;
      if (symbolIndex === undefined) {
        // No existing symbols left. Add a new symbol with the right properties.
        symbolIndex = nativeSymbols.length;
        nativeSymbols.libIndex[symbolIndex] = libIndex;
        // The two other fields willl be filled below.
        nativeSymbols.length++;
      }
      symbolAddressToCanonicalSymbolIndexMap.set(symbolAddress, symbolIndex);
    }
    // Update the symbol properties.
    nativeSymbols.address[symbolIndex] = symbolAddress;
    nativeSymbols.name[symbolIndex] = symbolStringIndex;
    nativeSymbols.functionSize[symbolIndex] = addressResult.functionSize ?? -1;
  }

  // Now we have a canonical symbol for every symbolAddress.
  // Update the frameTable with the new nativeSymbol assignments.
  for (const [frameIndex, symbolAddress] of frameToSymbolAddressMap) {
    const symbolIndex =
      symbolAddressToCanonicalSymbolIndexMap.get(symbolAddress);
    if (symbolIndex === undefined) {
      throw new Error(
        'Impossible, all symbolAddresses have a canonical symbol at this point.'
      );
    }
    frameTable.nativeSymbol[frameIndex] = symbolIndex;
    frameTable.flags[frameIndex] |= FrameFlag.HasNativeSymbol;
  }

  // Now it is time to look at funcs.
  // For funcs belonging to a native library, we group frames into funcs based
  // on the function name string and the file name. (We don't expect there to
  // be multiple functions with the same name in the same file. If there are,
  // then they'll be treated as the same function.)
  const availableFuncIter = availableFuncs.values();

  // funcKey -> funcIndex, where funcKey = `${nameStringIndex}:${fileStringIndex}`
  const funcKeyToFuncMap = new Map<string, IndexIntoFuncTable>();

  const availableFrameIter = inlinedFrames.values();
  const oldFuncToNewFuncsEntries: Array<[IndexIntoFuncTable, string]> = [];

  for (const frameIndex of nonInlinedFrames) {
    const oldFunc = frameTable.func[frameIndex];
    const nativeSymbolIndex = frameTable.nativeSymbol[frameIndex];
    const address = frameTable.address[frameIndex];
    let addressResult = resultsForLib.get(address);
    if (addressResult === undefined) {
      const symbolName = nativeSymbols.name[nativeSymbolIndex];
      let fileNameIndex = null;
      const sourceIndex = funcTable.source[oldFunc];
      if (sourceIndex !== null) {
        fileNameIndex = sources.filename[sourceIndex];
      }
      addressResult = {
        symbolAddress: nativeSymbols.address[nativeSymbolIndex],
        name: stringTable.getString(symbolName),
        file:
          fileNameIndex !== null
            ? stringTable.getString(fileNameIndex)
            : undefined,
        line:
          (frameTable.flags[frameIndex] & FrameFlag.HasLine) !== 0
            ? frameTable.line[frameIndex]
            : undefined,
      };
    }
    // Make a combined list which contains both the outer function and the inlines.
    const framesAtThisAddress = addressResult.inlines
      ? addressResult.inlines.slice()
      : [];
    framesAtThisAddress.push({
      name: addressResult.name,
      file: addressResult.file,
      line: addressResult.line,
    });
    framesAtThisAddress.reverse(); // Now the frames are from outside to inside.

    const inlineExpansionFrames = [];
    const inlineExpansionFuncIndexes = [];
    for (
      let inlineDepth = 0;
      inlineDepth < framesAtThisAddress.length;
      inlineDepth++
    ) {
      const frameInfo = framesAtThisAddress[inlineDepth];
      const functionStringIndex = stringTable.indexForString(frameInfo.name);
      const fileNameStringIndex =
        frameInfo.file !== undefined
          ? stringTable.indexForString(frameInfo.file)
          : null;
      // Group frames into the same function if the have the same function name
      // and the same file.
      const funcKey = `${functionStringIndex}:${fileNameStringIndex ?? ''}`;
      let funcIndex = funcKeyToFuncMap.get(funcKey);
      if (funcIndex === undefined) {
        funcIndex = availableFuncIter.next().value;
        if (funcIndex === undefined) {
          // Need a new func.
          funcIndex = funcTable.length;
          funcTable.isJS[funcIndex] = funcTable.isJS[oldFunc];
          funcTable.relevantForJS[funcIndex] = funcTable.relevantForJS[oldFunc];
          funcTable.resource[funcIndex] = resourceIndex;
          funcTable.source[funcIndex] = null;
          funcTable.lineNumber[funcIndex] = null;
          funcTable.columnNumber[funcIndex] = null;
          funcTable.originalLocation[funcIndex] = null;
          // The name field will be filled below.
          funcTable.length++;
        }
        funcTable.name[funcIndex] = functionStringIndex;
        // Store filename in sources table if we have one
        if (fileNameStringIndex !== null) {
          // Find or create the native source entry for this filename.
          let sourceIndex =
            sourceIndexForNativeFilename.get(fileNameStringIndex);
          if (sourceIndex === undefined) {
            sourceIndex = sources.filename.length;
            sources.filename.push(fileNameStringIndex);
            sources.id.push(null);
            sources.startLine.push(1);
            sources.startColumn.push(1);
            sources.sourceMapURL.push(null);
            sources.content.push(null);
            sources.length++;
            sourceIndexForNativeFilename.set(fileNameStringIndex, sourceIndex);
          }
          funcTable.source[funcIndex] = sourceIndex;
        } else {
          funcTable.source[funcIndex] = null;
        }
        funcKeyToFuncMap.set(funcKey, funcIndex);
      }
      inlineExpansionFuncIndexes.push(funcIndex);
      let expansionFrameIndex;
      if (inlineDepth === 0) {
        // This is an outer frame.
        expansionFrameIndex = frameIndex;
      } else {
        // This is an inline frame.
        // Add a frame at this depth. Try to use an unused existing frame, or
        // create a completely new frame if no frames are available.
        expansionFrameIndex = availableFrameIter.next().value;
        if (expansionFrameIndex === undefined) {
          expansionFrameIndex = frameTable.length;
          frameTable.length++;
        }

        // Copy most fields over from the outer frame, unchanged.
        const outerFlagsMask =
          FrameFlag.HasAddress |
          FrameFlag.HasCategory |
          FrameFlag.HasNativeSymbol;
        frameTable.flags[expansionFrameIndex] =
          frameTable.flags[frameIndex] & outerFlagsMask;
        frameTable.category[expansionFrameIndex] =
          frameTable.category[frameIndex];
        frameTable.subcategory[expansionFrameIndex] =
          frameTable.subcategory[frameIndex];
        frameTable.innerWindowID[expansionFrameIndex] =
          frameTable.innerWindowID[frameIndex];
        frameTable.address[expansionFrameIndex] = address;
        frameTable.lib[expansionFrameIndex] = libIndex;
        frameTable.nativeSymbol[expansionFrameIndex] = nativeSymbolIndex;
        frameTable.originalLocation[expansionFrameIndex] = 0;

        // These remaining fields are filled below.
      }
      let flags = frameTable.flags[expansionFrameIndex];
      if (inlineDepth === 0) {
        flags &= ~FrameFlag.IsInlined;
      } else {
        flags |= FrameFlag.IsInlined;
      }
      if (frameInfo.line !== undefined) {
        flags |= FrameFlag.HasLine;
        frameTable.line[expansionFrameIndex] = frameInfo.line;
      } else {
        flags &= ~FrameFlag.HasLine;
        frameTable.line[expansionFrameIndex] = 0;
      }
      flags &= ~FrameFlag.HasColumn;
      frameTable.flags[expansionFrameIndex] = flags;
      frameTable.func[expansionFrameIndex] = funcIndex;
      frameTable.column[expansionFrameIndex] = 0;
      inlineExpansionFrames.push(expansionFrameIndex);
    }
    if (inlineExpansionFrames.length > 1) {
      frameIndexToInlineExpansionFrames.set(frameIndex, inlineExpansionFrames);
    }
    oldFuncToNewFuncsEntries.push([
      oldFunc,
      inlineExpansionFuncIndexes.join('#'),
    ]);
  }

  // Build oldFuncToNewFuncsMapForThisLib.
  // If (oldFunc, newFuncs) is in oldFuncToNewFuncsMapForThisLib, this means
  // that all frames that used to belong to oldFunc have been resolved to
  // the same sequence of funcs newFuncs.
  const oldFuncToNewFuncsMapForThisLib = makeConsensusMap(
    oldFuncToNewFuncsEntries
  );
  for (const [oldFunc, newFuncs] of oldFuncToNewFuncsMapForThisLib) {
    oldFuncToNewFuncsMap.set(
      oldFunc,
      newFuncs.split('#').map((strFuncIndex) => +strFuncIndex)
    );
  }

  // The tables have been updated in place. The caller finishes the frameTable
  // and builds the new stackTable once all steps of the batch are done.
}

/**
 * Symbolicates the profile. Symbols are obtained from the symbolStore.
 * This function performs steps II-IV (see the comment at the beginning of
 * this file); step V is outsourced to symbolicationStepCallback
 * which can call applySymbolicationSteps to complete step V.
 */
export async function symbolicateProfile(
  profile: Profile,
  symbolStore: AbstractSymbolStore,
  symbolicationStepCallback: SymbolicationStepCallback,
  ignoreCache?: boolean
): Promise<void> {
  const symbolicationInfo = getSymbolicationInfo(profile.shared, profile.libs);
  const libSymbolicationRequests =
    buildLibSymbolicationRequestsForAllThreads(symbolicationInfo);
  await symbolStore.getSymbols(
    libSymbolicationRequests,
    (lib, results) => {
      const { debugName, breakpadId } = lib;
      const libKey = `${debugName}/${breakpadId}`;
      finishSymbolicationForLib(
        symbolicationInfo,
        results,
        libKey,
        symbolicationStepCallback
      );
    },
    (_request, error: Error) => {
      if (!(error instanceof SymbolsNotFoundError)) {
        // rethrow JavaScript programming error
        throw error;
      }
      // We could not find symbols for this library.
      console.warn(error);
    },
    ignoreCache
  );
}

// Create a new call path, where each func in the old call path is
// replaced with one or more funcs from the FuncToFuncsMap.
// This is used during symbolication, where some previously separate
// funcs can be mapped onto the same new func, or a previously "flat"
// func can expand into a path of new funcs (from inlined functions).
// Any func that is not present as a key in the map stays unchanged.
//
// Example:
// path: [1, 2, 3]
// oldFuncToNewFuncsMap: (1 => [1, 4], 2 => [1])
// result: [1, 4, 1, 3]
export function applyFuncSubstitutionToCallPath(
  oldFuncToNewFuncsMap: FuncToFuncsMap,
  path: CallNodePath
): CallNodePath {
  return path.reduce<CallNodePath>((accum, oldFunc) => {
    const newFuncs = oldFuncToNewFuncsMap.get(oldFunc);
    return newFuncs === undefined
      ? [...accum, oldFunc]
      : [...accum, ...newFuncs];
  }, []);
}

// This function is used for the path set of expanded call nodes in the call tree
// when symbolication is applied. We want to keep all open ("expanded") tree nodes open.
// The tree nodes are represented as a set of call paths, each call path is an array
// of funcs. Symbolication substitutes funcs.
export function applyFuncSubstitutionToPathSetAndIncludeNewAncestors(
  oldFuncToNewFuncsMap: FuncToFuncsMap,
  pathSet: PathSet
): PathSet {
  const newPathSet = [];
  for (const callPath of pathSet) {
    // Apply substitution to this path and add it.
    const newCallPath = applyFuncSubstitutionToCallPath(
      oldFuncToNewFuncsMap,
      callPath
    );
    newPathSet.push(newCallPath);

    // Additionally, we want to make sure that all new ancestors of the substituted call path
    // are in the new path set. Example:
    //
    // callPath = [1, 2, 3, 4] and map = (4 => [5, 6, 7])
    // newCallPath = [1, 2, 3, 5, 6, 7]
    //
    // We need to add these three new call paths:
    //
    //  1. [1, 2, 3, 5, 6, 7] (this one is already done)
    //  2. [1, 2, 3, 5, 6]
    //  3. [1, 2, 3, 5]

    const oldLeaf = callPath[callPath.length - 1];
    const mappedOldLeaf = applyFuncSubstitutionToCallPath(
      oldFuncToNewFuncsMap,
      [oldLeaf]
    );
    const mappedOldLeafSubpathLen = mappedOldLeaf.length;
    // "assert(newCallPath.endsWith(mappedOldLeaf))"
    if (mappedOldLeafSubpathLen > 1) {
      // The leaf has been replaced by multiple funcs.
      for (let i = 1; i < mappedOldLeafSubpathLen; i++) {
        newPathSet.push(newCallPath.slice(0, newCallPath.length - i));
      }
    }
  }

  return new PathSet(newPathSet);
}
