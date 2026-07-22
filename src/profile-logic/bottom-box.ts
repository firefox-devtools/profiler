/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ResourceType, FrameFlag } from 'firefox-profiler/types';

import type {
  Thread,
  IndexIntoStackTable,
  IndexIntoCallNodeTable,
  BottomBoxInfo,
  SamplesLikeTable,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from './call-node-info';
import {
  getCallNodeFramePerStack,
  getNativeSymbolInfo,
  getNativeSymbolsForCallNode,
  getOriginalPositionForFrame,
  getTotalNativeSymbolTimingsForCallNode,
} from './profile-data';
import { mapGetKeyWithMaxValue } from 'firefox-profiler/utils';
import { getTotalLineTimingsForCallNode } from './line-timings';
import { getTotalAddressTimingsForCallNode } from './address-timings';

/**
 * Calculate the BottomBoxInfo for a call node, i.e. information about which
 * things should be shown in the profiler UI's "bottom box" when this call node
 * is double-clicked.
 *
 * We always want to update all panes in the bottom box when a new call node is
 * double-clicked, so that we don't show inconsistent information side-by-side.
 */
export function getBottomBoxInfoForCallNode(
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  thread: Thread,
  samples: SamplesLikeTable
): BottomBoxInfo {
  const {
    stackTable,
    frameTable,
    funcTable,
    stringTable,
    resourceTable,
    nativeSymbols,
  } = thread;

  const funcIndex = callNodeInfo.funcForNode(callNodeIndex);
  const { source: sourceIndex, line: funcLine } = getOriginalPositionForFrame(
    null,
    funcIndex,
    frameTable,
    funcTable,
    thread.sourceLocationTable
  );
  const resource = funcTable.resource[funcIndex];
  const libIndex =
    resource !== -1 && resourceTable.type[resource] === ResourceType.Library
      ? resourceTable.lib[resource]
      : null;
  const callNodeFramePerStack = getCallNodeFramePerStack(
    callNodeIndex,
    callNodeInfo,
    stackTable
  );

  // If we have at least one native symbol to show assembly for, pick
  // the one with the highest total. But first, create the full list of
  // native symbols for this call node, including even those symbols
  // that aren't hit by any samples in the current view, so that the
  // list is stable regardless of the current preview selection.
  const nativeSymbolsForCallNode = getNativeSymbolsForCallNode(
    callNodeFramePerStack,
    frameTable
  );
  let initialNativeSymbol = null;
  const nativeSymbolTimings = getTotalNativeSymbolTimingsForCallNode(
    samples,
    callNodeFramePerStack,
    frameTable
  );
  const hottestNativeSymbol = mapGetKeyWithMaxValue(nativeSymbolTimings);
  if (hottestNativeSymbol !== undefined) {
    nativeSymbolsForCallNode.add(hottestNativeSymbol);
    initialNativeSymbol = hottestNativeSymbol;
  }
  const nativeSymbolsForCallNodeArr = [...nativeSymbolsForCallNode];
  nativeSymbolsForCallNodeArr.sort((a, b) => a - b);
  if (
    nativeSymbolsForCallNodeArr.length !== 0 &&
    initialNativeSymbol === null
  ) {
    initialNativeSymbol = nativeSymbolsForCallNodeArr[0];
  }

  const nativeSymbolInfosForCallNode = nativeSymbolsForCallNodeArr.map(
    (nativeSymbolIndex) =>
      getNativeSymbolInfo(
        nativeSymbolIndex,
        nativeSymbols,
        frameTable,
        stringTable
      )
  );

  // Compute the hottest line and instruction address, so we can ask the
  // source and assembly view to scroll those into view. funcLine and the per-sample
  // frame lines come from getOriginalPositionForFrame, so the scroll target lines
  // up with the (original) source view's line numbering when symbolicated.
  const lineTimings = getTotalLineTimingsForCallNode(
    samples,
    callNodeFramePerStack,
    frameTable,
    funcTable,
    funcLine,
    thread.sourceLocationTable
  );
  const hottestLine = mapGetKeyWithMaxValue(lineTimings);
  const addressTimings = getTotalAddressTimingsForCallNode(
    samples,
    callNodeFramePerStack,
    frameTable,
    initialNativeSymbol
  );
  const hottestInstructionAddress = mapGetKeyWithMaxValue(addressTimings);

  return {
    libIndex,
    sourceIndex,
    nativeSymbols: nativeSymbolInfosForCallNode,
    initialNativeSymbol:
      initialNativeSymbol !== null
        ? nativeSymbolsForCallNodeArr.indexOf(initialNativeSymbol)
        : null,
    scrollToLineNumber: hottestLine,
    scrollToInstructionAddress: hottestInstructionAddress,
    highlightedLineNumber: null,
    highlightedInstructionAddress: null,
  };
}

/**
 * Get bottom box info for a stack frame. This is similar to
 * getBottomBoxInfoForCallNode but works directly with stack indexes.
 */
export function getBottomBoxInfoForStackFrame(
  stackIndex: IndexIntoStackTable,
  thread: Thread
): BottomBoxInfo {
  const {
    stackTable,
    frameTable,
    funcTable,
    resourceTable,
    nativeSymbols,
    stringTable,
  } = thread;

  const frameIndex = stackTable.frame[stackIndex];
  const funcIndex = frameTable.func[frameIndex];
  const { source: sourceIndex, line: lineNumber } = getOriginalPositionForFrame(
    frameIndex,
    funcIndex,
    frameTable,
    funcTable,
    thread.sourceLocationTable
  );
  const resource = funcTable.resource[funcIndex];
  const libIndex =
    resource !== -1 && resourceTable.type[resource] === ResourceType.Library
      ? resourceTable.lib[resource]
      : null;

  // Get native symbol for this frame
  const frameFlags = frameTable.flags[frameIndex];
  const hasNativeSymbol = (frameFlags & FrameFlag.HasNativeSymbol) !== 0;
  const nativeSymbolInfos = hasNativeSymbol
    ? [
        getNativeSymbolInfo(
          frameTable.nativeSymbol[frameIndex],
          nativeSymbols,
          frameTable,
          stringTable
        ),
      ]
    : [];

  const hasAddress =
    hasNativeSymbol && (frameFlags & FrameFlag.HasAddress) !== 0;
  const instructionAddress = hasAddress ? frameTable.address[frameIndex] : -1;

  return {
    libIndex,
    sourceIndex,
    nativeSymbols: nativeSymbolInfos,
    initialNativeSymbol: 0,
    scrollToLineNumber: lineNumber ?? undefined,
    highlightedLineNumber: lineNumber,
    scrollToInstructionAddress: hasAddress ? instructionAddress : undefined,
    highlightedInstructionAddress: hasAddress ? instructionAddress : null,
  };
}
