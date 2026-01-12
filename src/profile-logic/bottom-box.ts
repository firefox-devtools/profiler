/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { resourceTypes } from './data-structures';

import type {
  Thread,
  IndexIntoStackTable,
  IndexIntoCallNodeTable,
  BottomBoxInfo,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from './call-node-info';
import {
  getNativeSymbolInfo,
  getNativeSymbolsForCallNode,
} from './profile-data';

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
  thread: Thread
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
  const nativeSymbolsForCallNode = getNativeSymbolsForCallNode(
    callNodeIndex,
    callNodeInfo,
    stackTable,
    frameTable
  );
  const nativeSymbolInfosForCallNode = nativeSymbolsForCallNode.map(
    (nativeSymbolIndex) =>
      getNativeSymbolInfo(
        nativeSymbolIndex,
        nativeSymbols,
        frameTable,
        stringTable
      )
  );

  return {
    libIndex,
    sourceIndex,
    nativeSymbols: nativeSymbolInfosForCallNode,
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

  // Extract line number from the frame
  const lineNumber = frameTable.line[frameIndex] ?? undefined;

  return {
    libIndex,
    sourceIndex,
    nativeSymbols: nativeSymbolInfos,
    scrollToLineNumber: lineNumber,
    highlightLineNumber: lineNumber,
  };
}
