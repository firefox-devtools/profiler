/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { resourceTypes } from './data-structures';

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
  const sourceIndex = funcTable.source[funcIndex];
  const resource = funcTable.resource[funcIndex];
  const libIndex =
    resource !== -1 && resourceTable.type[resource] === resourceTypes.library
      ? resourceTable.lib[resource]
      : null;
  const callNodeFramePerStack = getCallNodeFramePerStack(
    callNodeIndex,
    callNodeInfo,
    stackTable
  );
  const nativeSymbolsForCallNode = getNativeSymbolsForCallNode(
    callNodeFramePerStack,
    frameTable
  );
  const nativeSymbolsForCallNodeArr = [...nativeSymbolsForCallNode];

  // If we have at least one native symbol to show assembly for, pick
  // the first one arbitrarily.
  // TODO: If we have more than one native symbol, pick the one
  // with the highest total sample count.
  const initialNativeSymbol =
    nativeSymbolsForCallNodeArr.length !== 0 ? 0 : null;

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
  // source and assembly view to scroll those into view.
  const funcLine = funcTable.lineNumber[funcIndex];
  const lineTimings = getTotalLineTimingsForCallNode(
    samples,
    callNodeFramePerStack,
    frameTable,
    funcLine
  );
  const hottestLine = mapGetKeyWithMaxValue(lineTimings);
  const addressTimings = getTotalAddressTimingsForCallNode(
    samples,
    callNodeFramePerStack,
    frameTable,
    initialNativeSymbol !== null
      ? nativeSymbolsForCallNode[initialNativeSymbol]
      : null
  );
  const hottestInstructionAddress = mapGetKeyWithMaxValue(addressTimings);

  return {
    libIndex,
    sourceIndex,
    nativeSymbols: nativeSymbolInfosForCallNode,
    initialNativeSymbol,
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
  const sourceIndex = funcTable.source[funcIndex];
  const resource = funcTable.resource[funcIndex];
  const libIndex =
    resource !== -1 && resourceTable.type[resource] === resourceTypes.library
      ? resourceTable.lib[resource]
      : null;

  // Get native symbol for this frame
  const nativeSymbol = frameTable.nativeSymbol[frameIndex];
  const nativeSymbolInfos =
    nativeSymbol !== null
      ? [
          getNativeSymbolInfo(
            nativeSymbol,
            nativeSymbols,
            frameTable,
            stringTable
          ),
        ]
      : [];

  const instructionAddress =
    nativeSymbol !== null ? frameTable.address[frameIndex] : -1;

  // Extract line number from the frame
  const lineNumber = frameTable.line[frameIndex];

  return {
    libIndex,
    sourceIndex,
    nativeSymbols: nativeSymbolInfos,
    initialNativeSymbol: 0,
    scrollToLineNumber: lineNumber ?? undefined,
    highlightedLineNumber: lineNumber,
    scrollToInstructionAddress:
      instructionAddress !== -1 ? instructionAddress : undefined,
    highlightedInstructionAddress:
      instructionAddress !== -1 ? instructionAddress : null,
  };
}
