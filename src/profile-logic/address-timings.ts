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
  IndexIntoCallNodeTable,
  IndexIntoNativeSymbolTable,
  StackAddressInfo,
  AddressTimings,
  Address,
} from 'firefox-profiler/types';

import { getMatchingAncestorStackForInvertedCallNode } from './profile-data';
import type { CallNodeInfo, CallNodeInfoInverted } from './call-node-info';

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
 *
 * The returned StackAddressInfo is computed as follows:
 *   selfAddress[stack]:
 *     For stacks whose stack.frame.nativeSymbol is the given native symbol,
 *     this is stack.frame.address.
 *     For all other stacks this is null.
 *   stackAddresses[stack]:
 *     For stacks whose stack.frame.nativeSymbol is the given native symbol,
 *     this is the stackAddresses of its prefix stack, plus stack.frame.address
 *     added to the set.
 *     For all other stacks this is the same as the stackAddresses set of the
 *     stack's prefix.
 */
export function getStackAddressInfo(
  stackTable: StackTable,
  frameTable: FrameTable,
  _funcTable: FuncTable,
  nativeSymbol: IndexIntoNativeSymbolTable
): StackAddressInfo {
  // "self address" == "the address which a stack's self time is contributed to"
  const selfAddressForAllStacks = [];
  // "total addresses" == "the set of addresses whose total time this stack contributes to"
  const totalAddressesForAllStacks: Array<Set<Address> | null> = [];

  // This loop takes advantage of the fact that the stack table is topologically ordered:
  // Prefix stacks are always visited before their descendants.
  // Each stack inherits the "total" addresses from its parent stack, and then adds its
  // self address to that set. If the stack doesn't have a self address in the library, we just
  // re-use the prefix's set object without copying it.
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const frame = stackTable.frame[stackIndex];
    const prefixStack = stackTable.prefix[stackIndex];
    const nativeSymbolOfThisStack = frameTable.nativeSymbol[frame];

    let selfAddress: Address | null = null;
    let totalAddresses: Set<Address> | null =
      prefixStack !== null ? totalAddressesForAllStacks[prefixStack] : null;

    if (nativeSymbolOfThisStack === nativeSymbol) {
      selfAddress = frameTable.address[frame];
      if (selfAddress !== -1) {
        // Add this stack's address to this stack's totalAddresses. The rest of this stack's
        // totalAddresses is the same as for the parent stack.
        // We avoid creating new Set objects unless the new set is actually
        // different.
        if (totalAddresses === null) {
          // None of the ancestor stack nodes have hit a address in the given library.
          totalAddresses = new Set([selfAddress]);
        } else if (!totalAddresses.has(selfAddress)) {
          totalAddresses = new Set(totalAddresses);
          totalAddresses.add(selfAddress);
        }
      }
    }

    selfAddressForAllStacks.push(selfAddress);
    totalAddressesForAllStacks.push(totalAddresses);
  }
  return {
    selfAddress: selfAddressForAllStacks,
    stackAddresses: totalAddressesForAllStacks,
  };
}

/**
 * Gathers the addresses which are hit by a given call node.
 * This is different from `getStackAddressInfo`: `getStackAddressInfo` counts
 * address hits anywhere in the stack, and this function only counts hits *in
 * the given call node*.
 *
 * This is useful when opening the assembly view from a call node: We can
 * directly jump to the place in the assembly where *this particular call node*
 * spends its time.
 *
 * Returns a StackAddressInfo object for the given stackTable and for the library
 * which contains the call node's func.
 */
export function getStackAddressInfoForCallNode(
  stackTable: StackTable,
  frameTable: FrameTable,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  nativeSymbol: IndexIntoNativeSymbolTable
): StackAddressInfo {
  const callNodeInfoInverted = callNodeInfo.asInverted();
  return callNodeInfoInverted !== null
    ? getStackAddressInfoForCallNodeInverted(
        stackTable,
        frameTable,
        callNodeIndex,
        callNodeInfoInverted,
        nativeSymbol
      )
    : getStackAddressInfoForCallNodeNonInverted(
        stackTable,
        frameTable,
        callNodeIndex,
        callNodeInfo,
        nativeSymbol
      );
}

/**
 * This function handles the non-inverted case of getStackAddressInfoForCallNode.
 *
 * Gathers the addresses which are hit by a given call node in a given native
 * symbol.
 *
 * This is best explained with an example. We first start with a case that does
 * not have any inlining, because this is already complicated enough.
 *
 * Let the call node be the node for the call path [A, B, C].
 * Let the native symbol be C.
 * Let every frame have inlineDepth:0.
 * Let there be a native symbol for every func, with the same name as the func.
 * Let this be the stack tree:
 *
 *  - stack 1, func A
 *    - stack 2, func B
 *      - stack 3, func C, address 0x30
 *      - stack 4, func C, address 0x40
 *    - stack 5, func B
 *      - stack 6, func C, address 0x60
 *      - stack 7, func C, address 0x70
 *        - stack 8, func D
 *      - stack 9, func E
 *    - stack 10, func F
 *
 * This maps to the following call tree:
 *
 *  - call node 1, func A
 *    - call node 2, func B
 *      - call node 3, func C
 *        - call node 4, func D
 *      - call node 5, func E
 *   - call node 6, func F
 *
 * The call path [A, B, C] uniquely identifies call node 3.
 * The following stacks all "collapse into" ("map to") call node 3:
 * stack 3, 4, 6 and 7.
 * Stack 8 maps to call node 4, which is a child of call node 3.
 * Stacks 1, 2, 5, 9 and 10 are outside the call path [A, B, C].
 *
 * In this function, we only compute "address hits" that are contributed to
 * the given call node.
 * Stacks 3, 4, 6 and 7 all contribute their time both as "self time"
 * and as "total time" to call node 3, at the addresses 0x30, 0x40, 0x60,
 * and 0x70, respectively.
 * Stack 8 also hits call node 3 at address 0x70, but does not contribute to
 * call node 3's "self time", it only contributes to its "total time".
 * Stacks 1, 2, 5, 9 and 10 don't contribute to call node 3's self or total time.
 *
 * Now here's an example *with* inlining.
 *
 * Let the call node be the node for the call path [A, B, C].
 * Let the native symbol be B.
 * Let this be the stack tree:
 *
 *  - stack 1, func A, nativeSymbol A
 *    - stack 2, func B, nativeSymbol B, address 0x40
 *      - stack 3, func C, nativeSymbol B, address 0x40, inlineDepth 1
 *    - stack 4, func B, nativeSymbol B, address 0x45
 *      - stack 5, func C, nativeSymbol B, address 0x45, inlineDepth 1
 *        - stack 6, func D, nativeSymbol D
 *    - stack 7, func E, nativeSymbol E
 *  - stack 8, func A, nativeSymbol A, address 0x30
 *    - stack 9, func B, nativeSymbol A, address 0x30, inlineDepth 1
 *      - stack 10, func C, nativeSymbol A, address 0x30, inlineDepth 2
 *
 * This maps to the following call tree:
 *
 *  - call node 1, func A
 *    - call node 2, func B
 *      - call node 3, func C
 *        - call node 4, func D
 *    - call node 5, func E
 *
 * The funky part here is that call node 3 has frames from two different native
 * symbols: Two from native symbol B, and one from native symbol A. That's
 * because B is present both as its own native symbol (separate outer function)
 * and as an inlined call from A. In other words, C has been inlined both into
 * a standalone B and also into another copy of B which was inlined into A.
 *
 * This means that, if the user double clicks call node 3, there are two
 * different symbols for which we may want to display the assembly code. And
 * depending on whether the assembly for A or for B is displayed, we want to
 * call this function for a different native symbol.
 *
 * In this example, we call this function for native symbol B.
 *
 * The call path [A, B, C] uniquely identifies call node 3.
 * The following stacks all "collapse into" ("map to") call node 3:
 * stack 3, 5 and 10. However, only stacks 3 and 5 belong to native symbol B;
 * stack 10 belongs to native symbol A.
 * Stack 6 maps to call node 4, which is a child of call node 3.
 * Stacks 1, 2, 4, 7, 8 and 9 are outside the call path [A, B, C].
 *
 * Stacks 3 and 5 both contribute their time both as "self time" and as "total
 * time" to call node 3 and native symbol B, at the addresses 0x40 and 0x45,
 * respectively. Stack 10 has the right call node but the wrong native symbol,
 * so it contributes to neither self nor total time.
 * Stack 6 also hits call node 3 at address 0x45, but does not contribute to
 * call node 3's "self time", it only contributes to its "total time".
 * Stacks 1, 2, 4, 7, 8 and 9 don't contribute to call node 3's self or total time.
 *
 * ---
 *
 * All stacks can contribute no more than one address in the given call node.
 * This is different from the getStackAddressInfo function above, where each
 * stack can hit many addresses of the same native symbol, because all of the ancestor
 * stacks are taken into account, rather than just one of them. Concretely,
 * this means that in the returned StackAddressInfo, each stackAddresses[stack]
 * set will only contain at most one element.
 *
 * The returned StackAddressInfo is computed as follows:
 *   selfAddress[stack]:
 *     For stacks that map to the given call node and whose nativeSymbol is the
 *     given native symbol, this is stack.frame.address.
 *     For all other stacks this is null.
 *   stackAddresses[stack]:
 *     For stacks that map to the given call node or one of its descendant
 *     call nodes, and whose nativeSymbol is the given native symbol, this is a
 *     set containing one element, which is ancestorStack.frame.address, where
 *     ancestorStack maps to the given call node.
 *     For all other stacks, this is null.
 */
export function getStackAddressInfoForCallNodeNonInverted(
  stackTable: StackTable,
  frameTable: FrameTable,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  nativeSymbol: IndexIntoNativeSymbolTable
): StackAddressInfo {
  const stackIndexToCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();

  // "self address" == "the address which a stack's self time is contributed to"
  const callNodeSelfAddressForAllStacks = [];
  // "total addresses" == "the set of addresses whose total time this stack contributes to"
  // Either null or a single-element set.
  const callNodeTotalAddressesForAllStacks: Array<Set<Address> | null> = [];

  // This loop takes advantage of the fact that the stack table is topologically ordered:
  // Prefix stacks are always visited before their descendants.
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    let selfAddress: Address | null = null;
    let totalAddresses: Set<Address> | null = null;
    const frame = stackTable.frame[stackIndex];

    if (
      stackIndexToCallNodeIndex[stackIndex] === callNodeIndex &&
      frameTable.nativeSymbol[frame] === nativeSymbol
    ) {
      // This stack contributes to the call node's self time for the right
      // native symbol. We needed to check both, because multiple stacks for the
      // same call node can have different native symbols.
      selfAddress = frameTable.address[frame];
      if (selfAddress !== -1) {
        totalAddresses = new Set([selfAddress]);
      }
    } else {
      // This stack does not map to the given call node or has the wrong native
      // symbol. So this stack contributes no self time to the call node for the
      // requested native symbol, and we leave selfAddress at null.
      // As for totalTime, this stack contributes to the same address's totalTime
      // as its parent stack: If it is a descendant of a stack X which maps to
      // the given call node, then it contributes to stack X's address's totalTime,
      // otherwise it contributes to no address's totalTime.
      // In the example above, this is how stack 8 contributes to call node 3's
      // totalTime.
      const prefixStack = stackTable.prefix[stackIndex];
      totalAddresses =
        prefixStack !== null
          ? callNodeTotalAddressesForAllStacks[prefixStack]
          : null;
    }

    callNodeSelfAddressForAllStacks.push(selfAddress);
    callNodeTotalAddressesForAllStacks.push(totalAddresses);
  }
  return {
    selfAddress: callNodeSelfAddressForAllStacks,
    stackAddresses: callNodeTotalAddressesForAllStacks,
  };
}

/**
 * This handles the inverted case of getStackAddressInfoForCallNode.
 *
 * The returned StackAddressInfo is computed as follows:
 *   selfAddress[stack]:
 *     For (inverted thread) root stack nodes that map to the given call node
 *     and whose stack.frame.nativeSymbol is the given symbol, this is stack.frame.address.
 *     For (inverted thread) root stack nodes whose frame with a different symbol,
 *     or which don't map to the given call node, this is null.
 *     For (inverted thread) *non-root* stack nodes, this is the same as the selfAddress
 *     of the stack's prefix. This way, the selfAddress is always inherited from the
 *     subtree root.
 *   stackAddresses[stack]:
 *     For stacks that map to the given call node or one of its (inverted tree)
 *     descendant call nodes, this is a set containing one element, which is
 *     ancestorStack.frame.address, where ancestorStack maps to the given call
 *     node.
 *     For all other stacks, this is null.
 */
export function getStackAddressInfoForCallNodeInverted(
  stackTable: StackTable,
  frameTable: FrameTable,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfoInverted,
  nativeSymbol: IndexIntoNativeSymbolTable
): StackAddressInfo {
  const depth = callNodeInfo.depthForNode(callNodeIndex);
  const [rangeStart, rangeEnd] =
    callNodeInfo.getSuffixOrderIndexRangeForCallNode(callNodeIndex);
  const callNodeIsRootOfInvertedTree = callNodeInfo.isRoot(callNodeIndex);
  const stackIndexToCallNodeIndex =
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex();
  const stackTablePrefixCol = stackTable.prefix;
  const suffixOrderIndexes = callNodeInfo.getSuffixOrderIndexes();

  // "self address" == "the address which a stack's self time is contributed to"
  const callNodeSelfAddressForAllStacks = [];
  // "total addresses" == "the set of addresses whose total time this stack contributes to"
  // Either null or a single-element set.
  const callNodeTotalAddressesForAllStacks = [];

  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    let selfAddress: Address | null = null;
    let totalAddresses: Set<Address> | null = null;

    const stackForCallNode = getMatchingAncestorStackForInvertedCallNode(
      stackIndex,
      rangeStart,
      rangeEnd,
      suffixOrderIndexes,
      depth,
      stackIndexToCallNodeIndex,
      stackTablePrefixCol
    );
    if (stackForCallNode !== null) {
      const frameForCallNode = stackTable.frame[stackForCallNode];
      if (frameTable.nativeSymbol[frameForCallNode] === nativeSymbol) {
        // This stack contributes to the call node's total time for the right
        // native symbol. We needed to check both, because multiple stacks for the
        // same call node can have different native symbols.
        const address = frameTable.address[frameForCallNode];
        if (address !== -1) {
          totalAddresses = new Set([address]);
          if (callNodeIsRootOfInvertedTree) {
            // This is a root of the inverted tree, and it is the given
            // call node. That means that we have a self address.
            selfAddress = address;
          } else {
            // This is not a root stack node, so no self time is spent
            // in the given call node for this stack node.
          }
        }
      }
    }

    callNodeSelfAddressForAllStacks.push(selfAddress);
    callNodeTotalAddressesForAllStacks.push(totalAddresses);
  }
  return {
    selfAddress: callNodeSelfAddressForAllStacks,
    stackAddresses: callNodeTotalAddressesForAllStacks,
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
  const { selfAddress, stackAddresses } = stackAddressInfo;
  const totalAddressHits: Map<Address, number> = new Map();
  const selfAddressHits: Map<Address, number> = new Map();

  // Iterate over all the samples, and aggregate the sample's weight into the
  // addresses which are hit by the sample's stack.
  // TODO: Maybe aggregate sample count per stack first, and then visit each stack only once?
  for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex === null) {
      continue;
    }
    const weight = samples.weight ? samples.weight[sampleIndex] : 1;
    const setOfHitAddresses = stackAddresses[stackIndex];
    if (setOfHitAddresses !== null) {
      for (const address of setOfHitAddresses) {
        const oldHitCount = totalAddressHits.get(address) ?? 0;
        totalAddressHits.set(address, oldHitCount + weight);
      }
    }
    const address = selfAddress[stackIndex];
    if (address !== null) {
      const oldHitCount = selfAddressHits.get(address) ?? 0;
      selfAddressHits.set(address, oldHitCount + weight);
    }
  }
  return { totalAddressHits, selfAddressHits };
}
