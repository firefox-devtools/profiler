/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * In this file, "address" always means "instruction address", expressed as a
 * byte offset into a given library ("relative address").
 *
 * The functions in this file (address-timings.js) behave very similarly to the
 * ones in line-timings.js.
 * line-timings.js is for the source view, and address-timings.js is for the
 * assembly view.
 *
 * The assembly view displays the instructions for one "native symbol", i.e. for
 * a function that the compiler created, and which the compiler didn't inline
 * away entirely. Every such function has a start address (the symbol address)
 * and a size in bytes. This defines an address range.
 *
 * Since the assembly view only displays the assembly code for a single function
 * at a time, address-timings.js always computes information only for a single
 * native symbol. It would also be reasonable to compute information for a
 * single library; we'll see over time what makes more sense. The computed
 * result for a single native symbol is small, but needs to be recomputed any
 * time a different native symbol is selected. The computed result for an entire
 * library would be quite large (e.g. all address hits for libxul.so), but it
 * would not need to be recomputed when a different function is selected.
 */

/**
 * Quick recap of the relationship between addresses, frames, funcs, and native
 * symbols for native code:
 *  - There is one native symbol per "outer" (i.e. non-inlined) function.
 *  - There is one func per function name + file name pair. Funcs are used for
 *    both inlined and non-inlined calls.
 *  - Each frame has at least the following properties:
 *    address, nativeSymbol, func, inlineDepth
 *  - As a result, there is a different frame for each sampled instruction address.
 *  - Multiple frames can share the same func.
 *  - Multiple frames can share the same native symbol.
 *
 * When there's inlining at a given address, then we create a multiple frames
 * for that address with different func and inlineDepth values, and all these
 * frames share the same address and native symbol.
 *
 * Here's an example "stack" tree.
 *
 * Before symbolication:
 *
 *  - address:0x123
 *    - address:0x250
 *      - address:0x307
 *    - address:0x427
 *      - address:0x129
 *    - address:0x435
 *
 * After symbolication:
 *
 *  - func:A nativeSymbol:A address:0x123
 *    - func:B nativeSymbol:B address:0x250
 *      - func:C nativeSymbol:B address:0x250 (inlineDepth:1)
 *        - func:D nativeSymbol:B address:0x250 (inlineDepth:2)
 *          - func:E nativeSymbol:E address:0x307
 *    - func:F nativeSymbol:F address:0x427
 *      - func:A nativeSymbol:A address:0x129
 *        - func:G nativeSymbol:A address:0x129 (inlineDepth:1)
 *    - func:F nativeSymbol:F address:0x435
 *      - func:D nativeSymbol:F address:0x435 (inlineDepth:1)
 */

import type {
  FrameTable,
  FuncTable,
  StackTable,
  SamplesLikeTable,
  IndexIntoNativeSymbolTable,
  StackAddressInfo,
  AddressTimings,
  Address,
  IndexIntoAddressSetTable,
} from 'firefox-profiler/types';
import { SetCollectionBuilder } from 'firefox-profiler/utils/set-collection';

/**
 * For each stack in `stackTable`, and one specific native symbol, compute the
 * sets of addresses for frames belonging to that native symbol that are hit by
 * the stack.
 *
 * For each stack we answer the following question:
 *  - "Does this stack contribute to address X's self time?"
 *       Answer: result.selfAddress[stack] === X
 *  - "Does this stack contribute to address X's total time?"
 *       Answer: result.stackAddresses[stack].has(X)
 *
 * Compute the sets of instruction addresses for the given native symbol that
 * are hit by each stack.
 * For each stack in the stack table and each address for the native symbol, we
 * answer the questions "Does this stack contribute to address X's self time?
 * Does it contribute to address X's total time?"
 * Each stack can only contribute to one address's self time: the address of the
 * stack's own frame.
 * But each stack can contribute to the total time of multiple addresses for a
 * single native symbol, if there's recursion and the same native symbol (outer
 * function) is present in multiple places in the stack.
 * E.g if function A calls into B which calls into A, the call path [A, B, A]
 * will contribute to the total time of 2 addresses:
 *   1. The address in function A which has the call instruction to B,
 *   2. The address in function A that is being executed at that stack (stack.frame.address).
 * And if the call to B has been inlined into A, then it'll still just be two
 * addresses, because the inlined frame has the same address as its parent frame.
 * But with more complicated recursion you could have more than two addresses
 * from the same native symbol in the same stack.
 *
 * This last address in a stack is the stack's "self address".
 * If there is recursion, and the same address is present in multiple frames in
 * the same stack, the address is only counted once - the addresses are stored
 * in a set.
 */
export function getStackAddressInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  _funcTable: FuncTable,
  nativeSymbol: IndexIntoNativeSymbolTable
): StackAddressInfo {
  const builder = new SetCollectionBuilder<number>();
  const stackIndexToAddressSetIndex = new Int32Array(stackTable.length);

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const prefixStack = stackTable.prefix[stackIndex];
    const prefixAddressSet: IndexIntoAddressSetTable | -1 =
      prefixStack !== null ? stackIndexToAddressSetIndex[prefixStack] : -1;

    const frame = stackTable.frame[stackIndex];
    const nativeSymbolOfThisStack = frameTable.nativeSymbol[frame];
    const matchesNativeSymbol = nativeSymbolOfThisStack === nativeSymbol;
    if (prefixAddressSet === -1 && !matchesNativeSymbol) {
      stackIndexToAddressSetIndex[stackIndex] = -1;
    } else {
      const selfAddress = matchesNativeSymbol ? frameTable.address[frame] : -1;

      stackIndexToAddressSetIndex[stackIndex] = builder.extend(
        prefixAddressSet !== -1 ? prefixAddressSet : null,
        selfAddress
      );
    }
  }
  return {
    stackIndexToAddressSetIndex,
    addressSetTable: builder.finish(),
  };
}

// An AddressTimings instance without any hits.
export const emptyAddressTimings: AddressTimings = {
  totalAddressHits: new Map(),
  selfAddressHits: new Map(),
};

// Compute the AddressTimings for the supplied samples with the help of StackAddressInfo.
// This is fast and can be done whenever the preview selection changes.
// The slow part was the computation of the StackAddressInfo, which is already done.
export function getAddressTimings(
  stackAddressInfo: StackAddressInfo | null,
  samples: SamplesLikeTable
): AddressTimings {
  if (stackAddressInfo === null) {
    return emptyAddressTimings;
  }

  const { stackIndexToAddressSetIndex, addressSetTable } = stackAddressInfo;

  // We do two passes to compute the timings:
  // 1. One pass over the samples to accumulate the sample weight onto the
  //    nodes in the addressSetTable.
  // 2. One pass (from back to front) over the addressSetTable, propagating
  //    values up the tree and, at the same time, accumulating per-address
  //    totals.

  // First, do the pass over the samples to compute the weight per address set.
  const selfPerAddressSet = new Float64Array(addressSetTable.length);
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex === null) {
      continue;
    }
    const addressSetIndex = stackIndexToAddressSetIndex[stackIndex];
    if (addressSetIndex !== -1) {
      const weight = samples.weight ? samples.weight[sampleIndex] : 1;
      selfPerAddressSet[addressSetIndex] += weight;
    }
  }

  // Now, do a pass over the addressSetTable, from back to front.
  // This is a similar idea to what we do for the call tree or the function
  // list. The upwards propagation of a sample's weight will not contribute
  // to the same address multiple times thanks to the guarantees of the
  // addressSetTable - there are no duplicate values on a node's path to the
  // root.
  const totalAddressHits: Map<Address, number> = new Map();
  const selfAddressHits: Map<Address, number> = new Map();
  const selfSumOfAddressSetDescendants = new Float64Array(
    addressSetTable.length
  );
  for (
    let addressSetIndex = addressSetTable.length - 1;
    addressSetIndex >= 0;
    addressSetIndex--
  ) {
    const selfWeight = selfPerAddressSet[addressSetIndex];
    if (selfWeight !== 0) {
      const selfAddress = addressSetTable.self[addressSetIndex];
      if (selfAddress !== -1) {
        const oldHitCount = selfAddressHits.get(selfAddress) ?? 0;
        selfAddressHits.set(selfAddress, oldHitCount + selfWeight);
      }
    }

    const selfSumOfThisAddressSetDescendants =
      selfSumOfAddressSetDescendants[addressSetIndex];
    const thisAddressSetWeight =
      selfWeight + selfSumOfThisAddressSetDescendants;
    const addressSetParent = addressSetTable.parent[addressSetIndex];
    if (addressSetParent !== null) {
      selfSumOfAddressSetDescendants[addressSetParent] += thisAddressSetWeight;
    }

    if (thisAddressSetWeight !== 0) {
      const address = addressSetTable.value[addressSetIndex];
      if (address !== -1) {
        const oldHitCount = totalAddressHits.get(address) ?? 0;
        totalAddressHits.set(address, oldHitCount + thisAddressSetWeight);
      }
    }
  }
  return { totalAddressHits, selfAddressHits };
}

// Returns the addresses which are hit within the specified native
// symbol in a specific call node, along with the total of the
// sample weights per address.
// callNodeFramePerStack needs to be a mapping from stackIndex to the
// corresponding frame in the call node of interest.
export function getTotalAddressTimingsForCallNode(
  samples: SamplesLikeTable,
  callNodeFramePerStack: Int32Array,
  frameTable: FrameTable,
  nativeSymbol: IndexIntoNativeSymbolTable | null
): Map<Address, number> {
  if (nativeSymbol === null) {
    return new Map<Address, number>();
  }

  const totalPerAddress = new Map<Address, number>();
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stack = samples.stack[sampleIndex];
    if (stack === null) {
      continue;
    }
    const callNodeFrame = callNodeFramePerStack[stack];
    if (callNodeFrame === -1) {
      // This sample does not contribute to the call node's total. Ignore.
      continue;
    }

    if (frameTable.nativeSymbol[callNodeFrame] !== nativeSymbol) {
      continue;
    }

    const address = frameTable.address[callNodeFrame];
    if (address === -1) {
      continue;
    }

    const sampleWeight =
      samples.weight !== null ? samples.weight[sampleIndex] : 1;
    totalPerAddress.set(
      address,
      (totalPerAddress.get(address) ?? 0) + sampleWeight
    );
  }

  return totalPerAddress;
}
