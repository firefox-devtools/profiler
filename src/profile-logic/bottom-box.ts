/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { resourceTypes } from './data-structures';

import type {
  Thread,
  IndexIntoStackTable,
  IndexIntoCallNodeTable,
  SamplesLikeTable,
  BottomBoxInfo,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from './call-node-info';
import { getLineTimings, getStackLineInfoForCallNode } from './line-timings';
import {
  getNativeSymbolInfo,
  getNativeSymbolsForCallNode,
} from './profile-data';
import { mapGetKeyWithMaxValue } from 'firefox-profiler/utils';
import {
  getAddressTimings,
  getStackAddressInfoForCallNode,
} from './address-timings';

function _findIndexOfMaxValue(arr: number[]): number {
  if (arr.length === 0) {
    return -1;
  }

  let indexOfMaxValue = 0;
  let maxValue = arr[0];
  for (let i = 1; i < arr.length; i++) {
    const val = arr[i];
    if (val > maxValue) {
      indexOfMaxValue = i;
      maxValue = val;
    }
  }
  return indexOfMaxValue;
}

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
  const { stackTable, frameTable, funcTable, stringTable, resourceTable } =
    thread;

  const funcIndex = callNodeInfo.funcForNode(callNodeIndex);
  const sourceIndex = funcTable.source[funcIndex];
  const resource = funcTable.resource[funcIndex];
  const libIndex =
    resource !== -1 && resourceTable.type[resource] === resourceTypes.library
      ? resourceTable.lib[resource]
      : null;
  const nativeSymbolsWithWeight = getNativeSymbolsForCallNode(
    callNodeIndex,
    callNodeInfo,
    stackTable,
    frameTable,
    samples
  );

  // const nativeSymbols = [...getNativeSymbolsForFunc(funcIndex, frameTable)];
  const nativeSymbols = [...nativeSymbolsWithWeight.keys()];

  nativeSymbols.sort((a, b) => a - b);
  const nativeSymbolWeights = nativeSymbols.map(
    (nativeSymbolIndex) => nativeSymbolsWithWeight.get(nativeSymbolIndex) ?? 0
  );

  const initialNativeSymbol =
    nativeSymbolWeights.length !== 0
      ? _findIndexOfMaxValue(nativeSymbolWeights)
      : null;

  const nativeSymbolInfos = nativeSymbols.map((nativeSymbolIndex) =>
    getNativeSymbolInfo(
      nativeSymbolIndex,
      thread.nativeSymbols,
      frameTable,
      stringTable
    )
  );

  // Compute the hottest line, so we can ask the source view to scroll to it.
  const stackLineInfo = getStackLineInfoForCallNode(
    stackTable,
    frameTable,
    funcTable,
    callNodeIndex,
    callNodeInfo
  );
  const callNodeLineTimings = getLineTimings(stackLineInfo, samples);
  const hottestLine = mapGetKeyWithMaxValue(callNodeLineTimings.totalLineHits);

  // Compute the hottest instruction, so we can ask the assembly view to scroll to it.
  let hottestInstructionAddress;
  if (initialNativeSymbol !== null) {
    const stackAddressInfo = getStackAddressInfoForCallNode(
      stackTable,
      frameTable,
      callNodeIndex,
      callNodeInfo,
      nativeSymbols[initialNativeSymbol]
    );
    const callNodeAddressTimings = getAddressTimings(stackAddressInfo, samples);
    hottestInstructionAddress = mapGetKeyWithMaxValue(
      callNodeAddressTimings.totalAddressHits
    );
  }

  return {
    libIndex,
    sourceIndex,
    nativeSymbols: nativeSymbolInfos,
    initialNativeSymbol,
    scrollToLineNumber: hottestLine,
    scrollToInstructionAddress: hottestInstructionAddress,
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
    nativeSymbol !== null ? frameTable.address[frameIndex] : undefined;

  // Extract line number from the frame
  const lineNumber = frameTable.line[frameIndex] ?? undefined;

  return {
    libIndex,
    sourceIndex,
    nativeSymbols: nativeSymbolInfos,
    initialNativeSymbol: nativeSymbol,
    scrollToLineNumber: lineNumber,
    highlightLineNumber: lineNumber,
    scrollToInstructionAddress: instructionAddress,
    highlightInstructionAddress: instructionAddress,
  };
}
