/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Milliseconds, StartEndRange, Address, Bytes } from './units';
import { MarkerPayload, MarkerSchema } from './markers';
import {
  ThreadIndex,
  Pid,
  IndexIntoFuncTable,
  IndexIntoJsTracerEvents,
  IndexIntoCategoryList,
  IndexIntoResourceTable,
  IndexIntoLibs,
  CounterIndex,
  GraphColor,
  IndexIntoRawMarkerTable,
  IndexIntoStringTable,
  TabID,
  Tid,
  ProcessType,
  PausedRange,
  JsAllocationsTable,
  NativeAllocationsTable,
  RawMarkerTable,
  FrameTable,
  FuncTable,
  ResourceTable,
  NativeSymbolTable,
  JsTracerTable,
  IndexIntoStackTable,
  WeightType,
  IndexIntoFrameTable,
  IndexIntoSubcategoryListForCategory,
} from './profile';
import { IndexedArray } from './utils';
import { StackTiming } from '../profile-logic/stack-timing';
import { StringTable } from '../utils/string-table';
export type IndexIntoCallNodeTable = number;

/**
 * The derived Thread type.
 *
 * This type is more ergonomic than the RawThread type:
 *
 * - `RawThread` represents the data as it is stored in the profile file format,
 *   so it needs to be JSON-compatible, and it is encouraged to use more compact
 *   data representations, e.g. no duplication of shared data on each thread.
 * - `Thread` is computed at runtime by selectors, and can store data in a way
 *   that's most convenient for users of the derived state.
 *
 * The fields that differ from RawThread are collected at the end of this type
 * definition.
 */
export type Thread = {
  processType: ProcessType;
  processStartupTime: Milliseconds;
  processShutdownTime: Milliseconds | null;
  registerTime: Milliseconds;
  unregisterTime: Milliseconds | null;
  pausedRanges: PausedRange[];
  showMarkersInTimeline?: boolean;
  name: string;
  isMainThread: boolean;
  // The eTLD+1 of the isolated content process if provided by the back-end.
  // It will be undefined if:
  // - Fission is not enabled.
  // - It's not an isolated content process.
  // - It's a sanitized profile.
  // - It's a profile from an older Firefox which doesn't include this field (introduced in Firefox 80).
  'eTLD+1'?: string;
  processName?: string;
  isJsTracer?: boolean;
  pid: Pid;
  tid: Tid;
  jsAllocations?: JsAllocationsTable;
  nativeAllocations?: NativeAllocationsTable;
  markers: RawMarkerTable;
  stackTable: StackTable;
  frameTable: FrameTable;
  funcTable: FuncTable;
  resourceTable: ResourceTable;
  nativeSymbols: NativeSymbolTable;
  jsTracer?: JsTracerTable;
  // If present and true, this thread was launched for a private browsing session only.
  // When false, it can still contain private browsing data if the profile was
  // captured in a non-fission browser.
  // It's absent in Firefox 97 and before, or in Firefox 98+ when this thread
  // had no extra attribute at all.
  isPrivateBrowsing?: boolean;
  // If present and non-0, the number represents the container this thread was loaded in.
  // It's absent in Firefox 97 and before, or in Firefox 98+ when this thread
  // had no extra attribute at all.
  userContextId?: number;

  // The fields below this comment are derived data, and not present on the RawThread
  // in the same form.

  // Strings for profiles are collected into a single table, and are referred to by
  // their index by other tables.
  stringTable: StringTable;
  // The stack samples collected for this thread. This field is different from
  // RawThread in that the `time` column is always present.
  samples: SamplesTable;
};

/**
 * The derived samples table.
 */
export type SamplesTable = {
  // Responsiveness is the older version of eventDelay. It injects events every 16ms.
  // This is optional because newer profiles don't have that field anymore.
  responsiveness?: Array<Milliseconds | null>;
  // Event delay is the newer version of responsiveness. It allow us to get a finer-grained
  // view of jank by inferring what would be the delay of a hypothetical input event at
  // any point in time. It requires a pre-processing to be able to visualize properly.
  // This is optional because older profiles didn't have that field.
  eventDelay?: Array<Milliseconds | null>;
  stack: Array<IndexIntoStackTable | null>;
  time: Milliseconds[];
  // An optional weight array. If not present, then the weight is assumed to be 1.
  // See the WeightType type for more information.
  weight: null | number[];
  weightType: WeightType;
  // The CPU ratio, between 0 and 1, over the time between the previous sample
  // and this sample.
  threadCPURatio?: Float64Array | undefined;
  // This property isn't present in normal threads. However it's present for
  // merged threads, so that we know the origin thread for these samples.
  threadId?: Tid[];
  length: number;
};

type SamplesLikeTableShape = {
  stack: Array<IndexIntoStackTable | null>;
  time: Milliseconds[];
  // An optional weight array. If not present, then the weight is assumed to be 1.
  // See the WeightType type for more information.
  weight: null | number[];
  weightType: WeightType;
  length: number;
};

export type SamplesLikeTable =
  | SamplesLikeTableShape
  | SamplesTable
  | NativeAllocationsTable
  | JsAllocationsTable;

export type CounterSamplesTable = {
  time: Milliseconds[];
  // The number of times the Counter's "number" was changed since the previous sample.
  // This property was mandatory until the format version 42, it was made optional in 43.
  number?: number[];
  // The count of the data, for instance for memory this would be bytes.
  count: number[];
  length: number;
};

export type Counter = {
  name: string;
  category: string;
  description: string;
  color?: GraphColor;
  pid: Pid;
  mainThreadIndex: ThreadIndex;
  samples: CounterSamplesTable;
};

/**
 * The `StackTable` type of the derived thread.
 *
 * The only difference from the `RawStackTable` is that the `StackTable` has a
 * `category` and a `subcategory` column.
 *
 * The category of a stack node is always non-null and is derived from a stack's
 * frame and its prefix. Frames can have null categories, stacks cannot. If a
 * stack's frame has a null category, the stack inherits the category of its
 * prefix stack. Root stacks whose frame has a null stack have their category
 * set to the "default category". (The default category is currently defined as
 * the category in the profile's category list whose color is "grey", and such
 * a category is required to be present.)
 *
 * We compute the category information at the start of the thread transform
 * pipeline, not at the end. This allows us to preserve categories more accurately
 * when transforms are applied. Example:
 *
 * In the call path
 *   someJSFunction [JS] -> Node.insertBefore [DOM] -> nsAttrAndChildArray::InsertChildAt,
 * the stack node for nsAttrAndChildArray::InsertChildAt should inherit the
 * category DOM from its "Node.insertBefore" prefix stack. And it should keep
 * the DOM category even if you apply the "Merge node into calling function"
 * transform to Node.insertBefore. This transform removes the stack node
 * "Node.insertBefore" from the stackTable, so the information about the DOM
 * category would be lost if it wasn't inherited into the
 * nsAttrAndChildArray::InsertChildAt stack before transforms are applied.
 */
export type StackTable = {
  // Same as in RawStackTable
  frame: IndexIntoFrameTable[];
  prefix: Array<IndexIntoStackTable | null>;
  length: number;

  // Derived from RawStackTable + FrameTable
  category: IndexIntoCategoryList[];
  subcategory: IndexIntoSubcategoryListForCategory[];
};

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
 *
 * # Call node ordering
 *
 * Call nodes are ordered in depth-first traversal order. This makes it super fast
 * to check whether node A is a descendant of node B, because all subtrees are
 * a contiguous range of call node indexes.
 *
 * More details about the ordering:
 *
 *  - The node at index 0 is the first root node.
 *  - If a node A has children, then A + 1 is its first child.
 *  - If a node A has no children, then A + 1 is its next sibling, or the closest
 *    next sibling of an ancestor node if A doesn't have a next sibling.
 *  - For every node A, there's a single "index range" which contains this node
 *    and all its descendants: [A, callNodeTable.subtreeRangeEnd[A]).
 *  - This "tree of ranges" is well-nested.
 *  - The ordering of siblings doesn't have any meaning, i.e. it doesn't matter
 *    if a node is the first or the third child of its parent (they're not
 *    ordered by func or anything).
 *
 * Example:
 *
 * ```
 *  - 0 funcG
 *    - 1 funcH
 *      - 2 funcI
 *      - 3 funcG
 *    - 4 funcJ
 *    - 5 funcI
 *  - 6 funcK
 *    - 7 funcG
 *      - 8 funcL
 *  - 9 funcH
 * ```
 *
 * In this example, the index range of the subtree of node 0 is [0, 6).
 * The index range of the subtree of node 3 is [3, 4), i.e. the half-open range
 * which only contains node 3.
 */
export type CallNodeTable = {
  // The index of the parent call node, or -1 for root nodes.
  prefix: Int32Array; // IndexIntoCallNodeTable -> IndexIntoCallNodeTable | -1

  // The index of this node's next sibling, or -1 if this node is the last child / last root.
  nextSibling: Int32Array; // IndexIntoCallNodeTable -> IndexIntoCallNodeTable | -1

  // The index after this node's last descendant. If this node has a next sibling,
  // subtreeRangeEnd is equal to nextSibling. Otherwise, this is the index
  // of the next sibling of the closest ancestor node which has a next sibling.
  // The last node has subtreeRangeEnd set to callNodeTable.length.
  //
  // The nodes in the range range [A, subtreeRangeEnd[A]) form A's subtree.
  subtreeRangeEnd: Uint32Array; // IndexIntoCallNodeTable -> IndexIntoCallNodeTable

  func: Int32Array; // IndexIntoCallNodeTable -> IndexIntoFuncTable
  category: Int32Array; // IndexIntoCallNodeTable -> IndexIntoCategoryList
  subcategory: Int32Array; // IndexIntoCallNodeTable -> IndexIntoSubcategoryListForCategory
  innerWindowID: Float64Array; // IndexIntoCallNodeTable -> InnerWindowID
  // IndexIntoNativeSymbolTable: all frames that collapsed into this call node inlined into the same native symbol
  // -1: divergent: not all frames that collapsed into this call node were inlined, or they are from different symbols
  // -2: no inlining
  sourceFramesInlinedIntoSymbol: Int32Array;
  // The depth of the call node. Roots have depth 0.
  depth: Int32Array;
  // The maximum value in the depth column, or -1 if this table is empty.
  maxDepth: number;
  // The number of call nodes. All columns in this table have this length.
  length: number;
};

export type LineNumber = number;

// Stores the line numbers which are hit by each stack, for one specific source
// file.
// Used to compute LineTimings in combination with a SamplesLikeTable.
//
// StackLineInfo can be computed once for a filtered thread. Then it is reused
// for the computation of different LineTimings as the preview selection changes.
//
// The order of these arrays is the same as the order of thread.stackTable;
// the array index is a stackIndex. Not all stacks are guaranteed to have a useful
// value; only stacks which are used as "self" stacks, i.e. stacks which are used
// in thread.samples.stack or in marker stacks / allocation stacks, are required
// to have their values computed - only these values will be accessed during the
// LineTimings computation.
//
// For stacks which are only used as prefix stack nodes, selfLine and
// stackLine may be null. This is fine because their values are not accessed
// during the LineTimings computation.
export type StackLineInfo = {
  // An array that contains, for each "self" stack, the line number that this stack
  // spends its self time in, in this file, or null if the self time of the
  // stack is in a different file or if the line number is not known.
  // For non-"self" stacks, i.e. stacks which are only used as prefix stacks and
  // never referred to from a SamplesLikeTable, the value may be null.
  selfLine: Array<LineNumber | null>;
  // An array that contains, for each "self" stack, all the lines that the frames in
  // this stack hit in this file, or null if this stack does not hit any line
  // in the given file.
  // For non-"self" stacks, i.e. stacks which are only used as prefix stacks and
  // never referred to from a SamplesLikeTable, the value may be null.
  stackLines: Array<Set<LineNumber> | null>;
};

// Stores, for all lines of one specific file, how many times each line is hit
// by samples in a thread. The maps only contain non-zero values.
// So map.get(line) === undefined should be treated as zero.
export type LineTimings = {
  totalLineHits: Map<LineNumber, number>;
  selfLineHits: Map<LineNumber, number>;
};

// Stores the addresses which are hit by each stack, for addresses belonging to
// one specific native symbol.
// Used to compute AddressTimings in combination with a SamplesLikeTable.
//
// StackAddressInfo can be computed once for a filtered thread. Then it is reused
// for the computation of different AddressTimings as the preview selection changes.
//
// The order of these arrays is the same as the order of thread.stackTable;
// the array index is a stackIndex. Not all stacks are guaranteed to have a useful
// value; only stacks which are used as "self" stacks, i.e. stacks which are used
// in thread.samples.stack or in marker stacks / allocation stacks, are required
// to have their values computed - only these values will be accessed during the
// AddressTimings computation.
//
// For stacks which are only used as prefix stack nodes, selfAddress and
// stackAddress may be null. This is fine because their values are not accessed
// during the AddressTimings computation.
export type StackAddressInfo = {
  // An array that contains, for each "self" stack, the address that this stack
  // spends its self time in, in this native symbol, or null if the self time of
  // the stack is in a different native symbol or if the address is not known.
  // For non-"self" stacks, i.e. stacks which are only used as prefix stacks and
  // never referred to from a SamplesLikeTable, the value may be null.
  selfAddress: Array<Address | null>;
  // An array that contains, for each "self" stack, all the addresses that the
  // frames in this stack hit in this native symbol, or null if this stack does
  // not hit any address in the given native symbol.
  // For non-"self" stacks, i.e. stacks which are only used as prefix stacks and
  // never referred to from a SamplesLikeTable, the value may be null.
  stackAddresses: Array<Set<Address> | null>;
};

// Stores, for all addresses of one specific library, how many times each
// address is hit by samples in a thread. The maps only contain non-zero values.
// So map.get(address) === undefined should be treated as zero.
export type AddressTimings = {
  totalAddressHits: Map<Address, number>;
  selfAddressHits: Map<Address, number>;
};

// Stores the information that's needed to prove to the symbolication API that
// we are authorized to request the source code for a specific file.
// This "address proof" makes it easy for the browser (or local symbol server)
// to limit file access to only the set of files which are referenced by trusted
// symbol information, without forcing the browser (or local symbol server) to
// build a full list of such files upfront. Building a full list would take a
// long time - up to a minute. Checking individual addresses is much faster.
//
// By allowing access to only the files referenced by symbol information, we
// avoid giving malicious actors the ability to read arbitrary files.
// Specifically, this restriction protects against the following threats:
//  - If source code is requested from the browser via the WebChannel, the check
//    avoids exposing arbitrary files to a compromised profiler.firefox.com web
//    page or to a compromised profiler.firefox.com content process. So the
//    check only makes a difference in cases where the browser can no longer
//    trust the profiler WebChannel.
//  - If source code is requested from a local symbol server via an HTTP
//    request, the check avoids exposing arbitrary files to a compromised
//    profiler.firefox.com page, or to other web pages or outside actors who
//    have guessed the correct URL to request source code from. Symbol servers
//    will usually put a randomized token into the URL in order to make it even
//    harder to guess the right URL. The address proof check is an extra layer
//    of protection on top of that, in case the secret URL somehow leaks.
export type AddressProof = {
  // The debugName of a library whose symbol information refers to the requested
  // file.
  debugName: string;
  // The breakpadId of that library.
  breakpadId: string;
  // The address in that library for which the symbolicated frames refer to the
  // requested file.
  address: Address;
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

/**
 * This type contains the first derived `Marker[]` information, plus an IndexedArray
 * to get back to the RawMarkerTable.
 */
export type DerivedMarkerInfo = {
  markers: Marker[];
  markerIndexToRawMarkerIndexes: IndexedArray<
    MarkerIndex,
    IndexIntoRawMarkerTable[]
  >;
};

export type Marker = {
  start: Milliseconds;
  end: Milliseconds | null;
  name: string;
  category: IndexIntoCategoryList;
  threadId: Tid | null;
  data: MarkerPayload | null;
  incomplete?: boolean;
};

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
  funcName: string;
  total: number;
  totalRelative: number;
  self: number;
  selfRelative: number;
};

export type ExtraBadgeInfo = {
  name: string;
  localizationId: string;
  vars: unknown;
  titleFallback: string;
  contentFallback: string;
};

export type CallNodeDisplayData = Readonly<{
  total: string;
  totalWithUnit: string;
  totalPercent: string;
  self: string;
  selfWithUnit: string;
  name: string;
  lib: string;
  isFrameLabel: boolean;
  categoryName: string;
  categoryColor: string;
  iconSrc: string | null;
  badge?: ExtraBadgeInfo;
  icon: string | null;
  ariaLabel: string;
}>;

export type ThreadWithReservedFunctions = {
  thread: Thread;
  reservedFunctionsForResources: Map<
    IndexIntoResourceTable,
    IndexIntoFuncTable
  >;
};

/**
 * The marker timing contains the necessary information to draw markers very quickly
 * in the marker chart. It represents a single row of markers in the chart.
 */
export type MarkerTiming = {
  // Start time in milliseconds.
  start: number[];
  // End time in milliseconds. It will equals start for instant markers.
  end: number[];
  index: MarkerIndex[];
  name: string;
  bucket: string;
  // True if this marker timing contains only instant markers.
  instantOnly: boolean;
  length: number;
};

export type MarkerTimingRows = Array<MarkerTiming>;

/**
 * Combined timing can be used in the Stack Chart. When this happens, the chart will
 * either take both marker timing and stack timing, or just the stack timing information.
 * This way, UserTiming markers can be shown together with the stack information.
 */
export type CombinedTimingRows =
  | Array<MarkerTiming | StackTiming>
  | Array<StackTiming>;

/**
 * This type contains the necessary information to fully draw the marker chart. Each
 * entry in the array represents a single fixed height row in the chart. The MarkerTiming
 * represents the markers, and a bare string represents a marker "bucket". It is drawn
 * as a single row in the marker chart, and serves as a separator between different
 * areas. This flat array structure was chosen because it makes it really easy to
 * loop through each row, and only draw the current subset on the screen.
 */
export type MarkerTimingAndBuckets = Array<MarkerTiming | string>;

export type JsTracerTiming = {
  // Start time in milliseconds.
  start: number[];
  // End time in milliseconds.
  end: number[];
  index: IndexIntoJsTracerEvents[];
  label: string[];
  name: string;
  func: Array<IndexIntoFuncTable | null>;
  length: number;
};

/**
 * The memory counter contains relative offsets of memory. This type provides a data
 * structure that can be used to see the total range of change over all the samples.
 */
export type AccumulatedCounterSamples = {
  readonly minCount: number;
  readonly maxCount: number;
  readonly countRange: number;
  // This value holds the accumulation of all the previous counts in the Counter samples.
  // For a memory counter, this gives the relative offset of bytes in that range
  // selection. The array will share the indexes of the range filtered counter samples.
  readonly accumulatedCounts: number[];
};

/**
 * A collection of the data for all configured lines for a given marker
 */
export type CollectedCustomMarkerSamples = {
  readonly minNumber: number;
  readonly maxNumber: number;
  // This value holds the number per configured line
  // selection. The array will share the indexes of the range filtered marker samples.
  readonly numbersPerLine: number[][];
  readonly markerIndexes: MarkerIndex[];
};

export type StackType = 'js' | 'native' | 'unsymbolicated';

export type GlobalTrack =
  // mainThreadIndex is null when this is a fake global process added to contain
  // real threads.
  | {
      readonly type: 'process';
      readonly pid: Pid;
      readonly mainThreadIndex: ThreadIndex | null;
    }
  | {
      readonly type: 'screenshots';
      readonly id: string;
      readonly threadIndex: ThreadIndex;
    }
  | { readonly type: 'visual-progress' }
  | { readonly type: 'perceptual-visual-progress' }
  | { readonly type: 'contentful-visual-progress' };

export type LocalTrack =
  | { readonly type: 'thread'; readonly threadIndex: ThreadIndex }
  | { readonly type: 'network'; readonly threadIndex: ThreadIndex }
  | { readonly type: 'memory'; readonly counterIndex: CounterIndex }
  | { readonly type: 'bandwidth'; readonly counterIndex: CounterIndex }
  | { readonly type: 'ipc'; readonly threadIndex: ThreadIndex }
  | { readonly type: 'event-delay'; readonly threadIndex: ThreadIndex }
  | { readonly type: 'process-cpu'; readonly counterIndex: CounterIndex }
  | { readonly type: 'power'; readonly counterIndex: CounterIndex }
  | {
      readonly type: 'marker';
      readonly threadIndex: ThreadIndex;
      readonly markerSchema: MarkerSchema;
      readonly markerName: IndexIntoStringTable;
    };

export type Track = GlobalTrack | LocalTrack;

// A track index doesn't always represent uniquely a track: it's merely an index inside
// a specific structure:
// - for global tracks, this is the index in the global tracks array
// - for local tracks, this is the index in the local tracks array for a specific pid.
export type TrackIndex = number;

/**
 * Type that holds the values of personally identifiable information that user
 * wants to remove.
 */
export type RemoveProfileInformation = {
  // Remove the given hidden threads if they are provided.
  readonly shouldRemoveThreads: Set<ThreadIndex>;
  // Remove the given counters if they are provided.
  readonly shouldRemoveCounters: Set<CounterIndex>;
  // Remove the screenshots if they are provided.
  readonly shouldRemoveThreadsWithScreenshots: Set<ThreadIndex>;
  // Remove the full time range if StartEndRange is provided.
  readonly shouldFilterToCommittedRange: StartEndRange | null;
  // Remove all the URLs if it's true.
  readonly shouldRemoveUrls: boolean;
  // Remove the extension list if it's true.
  readonly shouldRemoveExtensions: boolean;
  // Remove the preference values if it's true.
  readonly shouldRemovePreferenceValues: boolean;
  // Remove the private browsing data if it's true.
  readonly shouldRemovePrivateBrowsingData: boolean;
};

/**
 * This type is used to decide how to highlight and stripe areas in the
 * timeline.
 */
export type SelectedState =
  // Samples can be filtered through various operations, like searching, or
  // call tree transforms.
  | 'FILTERED_OUT_BY_TRANSFORM'
  // This sample is selected because either the tip or an ancestor call node matches
  // the currently selected call node.
  | 'SELECTED'
  // This call node is not selected, and the stacks are ordered before the selected
  // call node as sorted by the getTreeOrderComparator.
  | 'UNSELECTED_ORDERED_BEFORE_SELECTED'
  // This call node is not selected, and the stacks are ordered after the selected
  // call node as sorted by the getTreeOrderComparator.
  | 'UNSELECTED_ORDERED_AFTER_SELECTED';

/**
 * It holds the initially selected track's HTMLElement. This allows the timeline
 * to scroll the initially selected track into view once the page is loaded.
 */
export type InitialSelectedTrackReference = HTMLElement;

/**
 * Page data for ProfileFilterNavigator component.
 */
export type ProfileFilterPageData = {
  origin: string;
  hostname: string;
  favicon: string;
};

/**
 * Information about the Tab selector state that is sorted by their tab activity
 * scores.
 */
export type SortedTabPageData = Array<{
  tabID: TabID;
  tabScore: number;
  pageData: ProfileFilterPageData;
}>;

export type CallNodeSelfAndSummary = {
  // This property stores the amount of unit (time, bytes, count, etc.) spent in
  // this call node and not in any of its descendant nodes.
  callNodeSelf: Float64Array;
  // The sum of absolute values in callNodeSelf.
  // This is used for computing the percentages displayed in the call tree.
  rootTotalSummary: number;
};

/**
 * The self and total time, usually for a single call node.
 * As with most places where the terms "self" and "total" are used, the meaning
 * of the numbers depends on the context:
 *  - When used for "traced" timing, the values are Milliseconds.
 *  - Otherwise, the values are in the same unit as the sample weight type. For
 *    example, they could be sample counts, weights, or bytes.
 */
export type SelfAndTotal = { self: number; total: number };

/*
 * Event delay table that holds the pre-processed event delay values and other
 * statistics about it.
 * Gecko sends the non processed event delay values to the front-end and we have
 * to make a calculation to find out their real values. Also see:
 * https://searchfox.org/mozilla-central/rev/3811b11b5773c1dccfe8228bfc7143b10a9a2a99/tools/profiler/core/platform.cpp#3000-3186
 */
export type EventDelayInfo = {
  readonly eventDelays: Float32Array;
  readonly minDelay: Milliseconds;
  readonly maxDelay: Milliseconds;
  readonly delayRange: Milliseconds;
};

/**
 * This is a unique key that can be used in an object cache that represents either
 * a single thread, or a selection of multiple threads. When it's a number, it's
 * the ThreadIndex. When there are multiple threads, the key is a string of sorted,
 * comma separated thread indexes, e.g. "5,7,10"
 */
export type ThreadsKey = string | number;

/**
 * A representation of a native symbol which is independent from a thread.
 * This is used for storing the global state of the assembly view, which needs
 * to be independent from the selected thread. An IndexIntoNativeSymbolTable
 * would only be meaningful within a thread.
 * This can be removed if the native symbol table ever becomes global.
 */
export type NativeSymbolInfo = {
  name: string;
  address: Address;
  // The number of bytes belonging to this function, starting at the symbol address.
  // If functionSizeIsKnown is false, then this is a minimum size.
  functionSize: Bytes;
  functionSizeIsKnown: boolean;
  libIndex: IndexIntoLibs;
};

/**
 * Information about the initiating call node when the bottom box (source view +
 * assembly view) is updated.
 */
export type BottomBoxInfo = {
  libIndex: IndexIntoLibs | null;
  sourceFile: string | null;
  nativeSymbols: NativeSymbolInfo[];
};

/**
 * Favicon data that is retrieved from the browser connection.
 */
export type FaviconData = {
  readonly data: ArrayBuffer;
  readonly mimeType: string;
};
