/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Milliseconds, StartEndRange } from './units';
import type { MarkerPayload } from './markers';
import type {
  IndexIntoFuncTable,
  ThreadIndex,
  Pid,
  IndexIntoJsTracerEvents,
  CounterIndex,
} from './profile';
export type IndexIntoCallNodeTable = number;

/**
 * Contains a table of function call information that represents the stacks of what
 * functions were called, as opposed to stacks based on frames. There can be multiple
 * frames for a single function call. Using stacks as opposed to a computed tree of
 * CallNodes can cause duplicated functions in the call tree.
 *
 * For example:
 *
 *            stack1 (funcA)                             callNode1 (funcA)
 *                 |                                            |
 *                 v                                            v
 *            stack2 (funcB)         StackTable to       callNode2 (funcB)
 *                 |                 CallNodeTable              |
 *                 v                      ->                    v
 *            stack3 (funcC)                             callNode3 (funcC)
 *            /            \                                    |
 *           V              V                                   v
 *    stack4 (funcD)     stack5 (funcD)                  callNode4 (funcD)
 *         |                  |                          /               \
 *         v                  V                         V                 V
 *    stack6 (funcE)     stack7 (funcF)       callNode5 (funcE)     callNode6 (funcF)
 *
 * For a detailed explanation of callNodes see `docs-developer/call-tree.md` and
 * `docs-developer/call-nodes-in-cpp.md`.
 */
export type CallNodeTable = {
  prefix: Int32Array, // IndexIntoCallNodeTable -> IndexIntoCallNodeTable | -1
  func: Int32Array, // IndexIntoCallNodeTable -> IndexIntoFuncTable
  category: Int32Array, // IndexIntoCallNodeTable -> IndexIntoCategoryList
  subcategory: Int32Array, // IndexIntoCallNodeTable -> IndexIntoSubcategoryListForCategory
  depth: number[],
  length: number,
};

/**
 * Both the callNodeTable and a map that converts an IndexIntoStackTable
 * into an IndexIntoCallNodeTable.
 */
export type CallNodeInfo = {
  callNodeTable: CallNodeTable,
  // IndexIntoStackTable -> IndexIntoCallNodeTable
  stackIndexToCallNodeIndex: Uint32Array,
};

/**
 * When working with call trees, individual nodes in the tree are not stable across
 * different types of transformations and filtering operations. In order to refer
 * to some place in the call tree we use a list of functions that either go from
 * root to tip for normal call trees, or from tip to root for inverted call trees.
 * These paths are then stored along with the implementation filter, and the whether
 * or not the tree is inverted for a stable reference into a call tree.
 *
 * In some parts of the code the term prefix path is used to refer to a CallNodePath that
 * goes from root to tip, and the term postfix path is used to refer to a CallNodePath
 * that goes from tip to root.
 */
export type CallNodePath = IndexIntoFuncTable[];

export type Marker = {|
  start: Milliseconds,
  dur: Milliseconds,
  name: string,
  title: string | null,
  data: MarkerPayload,
  incomplete?: boolean,
|};

/**
 * A value with this type uniquely identifies a marker. This is the index of a
 * marker in the full marker list (as returned by the selector `getFullMarkerList`),
 * and the marker object is returned using the function `getMarker` as returned
 * by the selector `getMarkerGetter`:
 *
 *   const getMarker = selectedThreadSelectors.getMarkerGetter(state);
 *   const marker = getMarker(markerIndex);
 */
export type MarkerIndex = number;

export type CallNodeData = {
  funcName: string,
  totalTime: number,
  totalTimeRelative: number,
  selfTime: number,
  selfTimeRelative: number,
};

export type CallNodeDisplayData = $Exact<
  $ReadOnly<{
    totalTime: string,
    totalTimeWithUnit: string,
    totalTimePercent: string,
    selfTime: string,
    selfTimeWithUnit: string,
    name: string,
    lib: string,
    dim: boolean,
    categoryName: string,
    categoryColor: string,
    icon: string | null,
  }>
>;

export type MarkerTiming = {
  // Start time in milliseconds.
  start: number[],
  // End time in milliseconds.
  end: number[],
  index: MarkerIndex[],
  label: string[],
  name: string,
  length: number,
};
export type MarkerTimingRows = Array<MarkerTiming>;

export type JsTracerTiming = {
  // Start time in milliseconds.
  start: number[],
  // End time in milliseconds.
  end: number[],
  index: IndexIntoJsTracerEvents[],
  label: string[],
  name: string,
  length: number,
};

/**
 * The memory counter contains relative offsets of memory. This type provides a data
 * structure that can be used to see the total range of change over all the samples.
 */
export type AccumulatedCounterSamples = {|
  +minCount: number,
  +maxCount: number,
  +countRange: number,
  // This value holds the accumulation of all the previous counts in the Counter samples.
  // For a memory counter, this gives the relative offset of bytes in that range
  // selection. The array will share the indexes of the range filtered counter samples.
  +accumulatedCounts: number[],
|};

export type StackType = 'js' | 'native' | 'unsymbolicated';

export type GlobalTrack =
  | {| +type: 'process', +pid: Pid, +mainThreadIndex: ThreadIndex | null |}
  | {| +type: 'screenshots', +id: string, +threadIndex: ThreadIndex |};

export type LocalTrack =
  | {| +type: 'thread', +threadIndex: ThreadIndex |}
  | {| +type: 'network', +threadIndex: ThreadIndex |}
  | {| +type: 'memory', +counterIndex: CounterIndex |}
  | {|
      +type: 'overhead',
      +overheadIndex: CounterIndex,
      +overheadType: string,
    |};

export type Track = GlobalTrack | LocalTrack;
export type TrackIndex = number;

/**
 * Type that holds the values of personally identifiable information that user
 * wants to remove.
 */
export type RemoveProfileInformation = {
  // Remove the given hidden threads if they are provided.
  shouldRemoveThreads: Set<ThreadIndex>,
  // Remove the screenshots if they are provided.
  shouldRemoveThreadsWithScreenshots: Set<ThreadIndex>,
  // Remove the full time range if StartEndRange is provided.
  shouldFilterToCommittedRange: StartEndRange | null,
  // Remove all the URLs if it's true.
  shouldRemoveUrls: boolean,
  // Remove the extension list if it's true.
  shouldRemoveExtensions: boolean,
};

/**
 * This type is used to decide how to highlight and stripe areas in the
 * timeline.
 */
export type SelectedState =
  // Samples can be filtered through various operations, like searching, or
  // call tree transforms.
  | 'FILTERED_OUT'
  // This sample is selected because either the tip or an ancestor call node matches
  // the currently selected call node.
  | 'SELECTED'
  // This call node is not selected, and the stacks are ordered before the selected
  // call node as sorted by the getTreeOrderComparator.
  | 'UNSELECTED_ORDERED_BEFORE_SELECTED'
  // This call node is not selected, and the stacks are ordered after the selected
  // call node as sorted by the getTreeOrderComparator.
  | 'UNSELECTED_ORDERED_AFTER_SELECTED';
