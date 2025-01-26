/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Milliseconds, Address, Microseconds, Bytes } from './units';
import type { MarkerPayload, MarkerSchema, MarkerFormatType } from './markers';
import type { MarkerPhase, ProfilingLog } from './gecko-profile';

export type IndexIntoStackTable = number;
export type IndexIntoSamplesTable = number;
export type IndexIntoRawMarkerTable = number;
export type IndexIntoFrameTable = number;
export type IndexIntoStringTable = number;
export type IndexIntoFuncTable = number;
export type IndexIntoResourceTable = number;
export type IndexIntoLibs = number;
export type IndexIntoNativeSymbolTable = number;
export type IndexIntoCategoryList = number;
export type IndexIntoSubcategoryListForCategory = number;
export type resourceTypeEnum = number;
export type ThreadIndex = number;
// The Tid is most often a number. However in some cases such as merged profiles
// we could generate a string.
export type Tid = number | string;
export type IndexIntoJsTracerEvents = number;
export type CounterIndex = number;
export type TabID = number;
export type InnerWindowID = number;

/**
 * Pids are strings, often stringified numbers. Strings allow creating unique
 * values when multiple processes with the same pid exist in the same profile,
 * such as during profile merging or diffing.
 */
export type Pid = string;

/**
 * The stack table stores the tree of stack nodes of a thread.
 * The shape of the tree is encoded in the prefix column: Root stack nodes have
 * null as their prefix, and every non-root stack has the stack index of its
 * "caller" / "parent" as its prefix.
 * Every stack node also has a frame and a category.
 * A "call stack" is a list of frames. Every stack index in the stack table
 * represents such a call stack; the "list of frames" is obtained by walking
 * the path in the tree from the root to the given stack node.
 *
 * Stacks are used in the thread's samples; each sample refers to a stack index.
 * Stacks can be shared between samples.
 *
 * With this representation, every sample only needs to store a single integer
 * to identify the sample's stack.
 * We take advantage of the fact that many call stacks in the profile have a
 * shared prefix; storing these stacks as a tree saves a lot of space compared
 * to storing them as actual lists of frames.
 */
export type RawStackTable = {|
  frame: IndexIntoFrameTable[],
  prefix: Array<IndexIntoStackTable | null>,
  length: number,
|};

/**
 * Profile samples can come in a variety of forms and represent different information.
 * The Gecko Profiler by default uses sample counts, as it samples on a fixed interval.
 * These samples are all weighted equally by default, with a weight of one. However in
 * comparison profiles, some weights are negative, creating a "diff" profile.
 *
 * In addition, tracing formats can fit into the sample-based format by reporting
 * the "self time" of the profile. Each of these "self time" samples would then
 * provide the weight, in duration. Currently, the tracing format assumes that
 * the timing comes in milliseconds (see 'tracing-ms') but if needed, microseconds
 * or nanoseconds support could be added.
 *
 * e.g. The following tracing data could be represented as samples:
 *
 *     0 1 2 3 4 5 6 7 8 9 10
 *     | | | | | | | | | | |
 *     - - - - - - - - - - -
 *     A A A A A A A A A A A
 *         B B D D D D
 *         C C E E E E
 *                                     .
 * This chart represents the self time.
 *
 *     0 1 2 3 4 5 6 7 8 9 10
 *     | | | | | | | | | | |
 *     A A C C E E E E A A A
 *
 * And finally this is what the samples table would look like.
 *
 *     SamplesTable = {
 *       time:   [0,   2,   4, 8],
 *       stack:  [A, ABC, ADE, A],
 *       weight: [2,   2,   4, 3],
 *     }
 */
export type WeightType = 'samples' | 'tracing-ms' | 'bytes';

/**
 * The Gecko Profiler records samples of what function was currently being executed, and
 * the callstack that is associated with it. This is done at a fixed but configurable
 * rate, e.g. every 1 millisecond. This table represents the minimal amount of
 * information that is needed to represent that sampled function. Most of the entries
 * are indices into other tables.
 */
export type RawSamplesTable = {|
  // Responsiveness is the older version of eventDelay. It injects events every 16ms.
  // This is optional because newer profiles don't have that field anymore.
  responsiveness?: Array<?Milliseconds>,
  // Event delay is the newer version of responsiveness. It allow us to get a finer-grained
  // view of jank by inferring what would be the delay of a hypothetical input event at
  // any point in time. It requires a pre-processing to be able to visualize properly.
  // This is optional because older profiles didn't have that field.
  eventDelay?: Array<?Milliseconds>,
  stack: Array<IndexIntoStackTable | null>,
  time?: Milliseconds[],
  // If the `time` column is not present, then the `timeDeltas` column must be present.
  timeDeltas?: Milliseconds[],
  // An optional weight array. If not present, then the weight is assumed to be 1.
  // See the WeightType type for more information.
  weight: null | number[],
  weightType: WeightType,
  // CPU usage value of the current thread. Its values are null only if the back-end
  // fails to get the CPU usage from operating system.
  // It's landed in Firefox 86, and it is optional because older profile
  // versions may not have it or that feature could be disabled. No upgrader was
  // written for this change because it's a completely new data source.
  // The first value is ignored - it's not meaningful because there is no previous
  // sample.
  threadCPUDelta?: Array<number | null>,
  // This property isn't present in normal threads. However it's present for
  // merged threads, so that we know the origin thread for these samples.
  threadId?: Tid[],
  length: number,
|};

/**
 * JS allocations are recorded as a marker payload, but in profile processing they
 * are moved to the Thread. This allows them to be part of the stack processing pipeline.
 */
export type JsAllocationsTable = {|
  time: Milliseconds[],
  className: string[],
  typeName: string[], // Currently only 'JSObject'
  coarseType: string[], // Currently only 'Object',
  // "weight" is used here rather than "bytes", so that this type will match the
  // SamplesLikeTableShape.
  weight: Bytes[],
  weightType: 'bytes',
  inNursery: boolean[],
  stack: Array<IndexIntoStackTable | null>,
  length: number,
|};

/**
 * This variant is the original version of the table, before the memory address
 * and threadId were added.
 */
export type UnbalancedNativeAllocationsTable = {|
  time: Milliseconds[],
  // "weight" is used here rather than "bytes", so that this type will match the
  // SamplesLikeTableShape.
  weight: Bytes[],
  weightType: 'bytes',
  stack: Array<IndexIntoStackTable | null>,
  length: number,
|};

/**
 * The memory address and thread ID were added later.
 */
export type BalancedNativeAllocationsTable = {|
  ...UnbalancedNativeAllocationsTable,
  memoryAddress: number[],
  threadId: number[],
|};

/**
 * Native allocations are recorded as a marker payload, but in profile processing they
 * are moved to the Thread. This allows them to be part of the stack processing pipeline.
 * Currently they include native allocations and deallocations. However, both
 * of them are sampled independently, so they will be unbalanced if summed togther.
 */
export type NativeAllocationsTable =
  | UnbalancedNativeAllocationsTable
  | BalancedNativeAllocationsTable;

/**
 * Markers represent arbitrary events that happen within the browser. They have a
 * name, time, and potentially a JSON data payload. These can come from all over the
 * system. For instance Paint markers instrument the rendering and layout process.
 * Engineers can easily add arbitrary markers to their code without coordinating with
 * profiler.firefox.com to instrument their code.
 *
 * In the profile, these markers are raw and unprocessed. In the marker selectors, we
 * can run them through a processing pipeline to match up start and end markers to
 * create markers with durations, or even take a string-only marker and parse
 * it into a structured marker.
 */
export type RawMarkerTable = {|
  data: Array<MarkerPayload | null>,
  name: IndexIntoStringTable[],
  startTime: Array<number | null>,
  endTime: Array<number | null>,
  phase: MarkerPhase[],
  category: IndexIntoCategoryList[],
  // This property isn't present in normal threads. However it's present for
  // merged threads, so that we know the origin thread for these markers.
  threadId?: Tid[],
  length: number,
|};

/**
 * Frames contain the context information about the function execution at the moment in
 * time. The caller/callee relationship between frames is defined by the StackTable.
 */
export type FrameTable = {|
  // If this is a frame for native code, the address is the address of the frame's
  // assembly instruction,  relative to the native library that contains it.
  //
  // For frames obtained from stack walking, the address points into the call instruction.
  // It is not a return address, it is a "nudged" return address (i.e. return address
  // minus one byte). This is different from the Gecko profile format. The conversion
  // is performed at the end of profile processing. See the big comment above
  // nudgeReturnAddresses for more details.
  //
  // The library which this address is relative to is given by the frame's nativeSymbol:
  // frame -> nativeSymbol -> lib.
  address: Array<Address | -1>,

  // The inline depth for this frame. If there is an inline stack at an address,
  // we create multiple frames with the same address, one for each depth.
  // The outermost frame always has depth 0.
  //
  // Example:
  // If the raw stack is 0x10 -> 0x20 -> 0x30, and symbolication adds two inline frames
  // for 0x10, no inline frame for 0x20, and one inline frame for 0x30, then the
  // symbolicated stack will be the following:
  //
  // func:        outer1 -> inline1a -> inline1b -> outer2 -> outer3 -> inline3a
  // address:     0x10   -> 0x10     -> 0x10     -> 0x20   -> 0x30   -> 0x30
  // inlineDepth:    0   ->    1     ->    2     ->    0   ->    0   ->    1
  //
  // Background:
  // When a compiler performs an inlining optimization, it removes a call to a function
  // and instead generates the code for the called function directly into the outer
  // function. But it remembers which instructions were the result of this inlining,
  // so that information about the inlined function can be recovered from the debug
  // information during symbolication, based on the instruction address.
  // The compiler can choose to do inlining multiple levels deep: An instruction can
  // be the result of a whole "inline stack" of functions.
  // Before symbolication, all frames have depth 0. During symbolication, we resolve
  // addresses to inline stacks, and create extra frames with non-zero depths as needed.
  //
  // The frames of an inline stack at an address all have the same address and the same
  // nativeSymbol, but each has a different func and line.
  inlineDepth: number[],

  // The category of the frame. This is used to calculate the category of the stack nodes
  // which use this frame:
  // - If the frame has a null category, the stack node inherits its parent node's category
  //   and subcategory. If there is no parent node, we use the "default category" (see ProfileMeta.categories).
  // - If the frame has a non-null category, this category and subcategory is used for the stack node.
  category: (IndexIntoCategoryList | null)[],

  // The subcategory of a frame. This is used to calculate the subcategory of the stack nodes
  // which use this frame.
  // Must be non-null if the frame's category is non-null.
  // Ignored if the frame's category is null.
  // 0 is always a valid value and refers to the "Other" subcategory (see Category.subcategories).
  subcategory: (IndexIntoSubcategoryListForCategory | null)[],

  // The frame's function.
  func: IndexIntoFuncTable[],

  // The symbol index (referring into this thread's nativeSymbols table) corresponding
  // to symbol that covers the frame address of this frame. Only non-null for native
  // frames (e.g. C / C++ / Rust code). Null before symbolication.
  nativeSymbol: (IndexIntoNativeSymbolTable | null)[],

  // Inner window ID of JS frames. JS frames can be correlated to a Page through this value.
  // It's used to determine which JS frame belongs to which web page so we can display
  // that information and filter for single tab profiling.
  // `0` for non-JS frames and the JS frames that failed to get the ID. `0` means "null value"
  // because that's what Firefox platform DOM side assigns when it fails to get the ID or
  // something bad happens during that process. It's not `null` or `-1` because that information
  // is being stored as `uint64_t` there.
  innerWindowID: (InnerWindowID | null)[],

  line: (number | null)[],
  column: (number | null)[],
  length: number,
|};

/**
 * The funcTable stores the functions that were called in the profile.
 * These can be native functions (e.g. C / C++ / rust), JavaScript functions, or
 * "label" functions. Multiple frames can have the same function: The frame
 * represents which part of a function was being executed at a given moment, and
 * the function groups all frames that occurred inside that function.
 * Concretely, for native code, each encountered instruction address is a separate
 * frame, and the function groups all instruction addresses which were symbolicated
 * with the same function name.
 * For JS code, each encountered line/column in a JS file is a separate frame, and
 * the function represents an entire JS function which can span multiple lines.
 *
 * Funcs that are orphaned, i.e. funcs that no frame refers to, do not have
 * meaningful values in their fields. Symbolication will cause many funcs that
 * were created upfront to become orphaned, as the frames that originally referred
 * to them get reassigned to the canonical func for their actual function.
 */
export type FuncTable = {|
  // The function name.
  name: Array<IndexIntoStringTable>,

  // isJS and relevantForJS describe the function type. Non-JavaScript functions
  // can be marked as "relevant for JS" so that for example DOM API label functions
  // will show up in any JavaScript stack views.
  // It may be worth combining these two fields into one:
  // https://github.com/firefox-devtools/profiler/issues/2543
  isJS: Array<boolean>,
  relevantForJS: Array<boolean>,

  // The resource describes "Which bag of code did this function come from?".
  // For JS functions, the resource is of type addon, webhost, otherhost, or url.
  // For native functions, the resource is of type library.
  // For labels and for other unidentified functions, we set the resource to -1.
  resource: Array<IndexIntoResourceTable | -1>,

  // These are non-null for JS functions only. The line and column describe the
  // location of the *start* of the JS function. As for the information about which
  // which lines / columns inside the function were actually hit during execution,
  // that information is stored in the frameTable, not in the funcTable.
  fileName: Array<IndexIntoStringTable | null>,
  lineNumber: Array<number | null>,
  columnNumber: Array<number | null>,

  length: number,
|};

/**
 * The nativeSymbols table stores the addresses and symbol names for all symbols
 * that were encountered by frame addresses in this thread. This table can
 * contain symbols from multiple libraries, and the symbols are in arbitrary
 * order.
 * Note: Despite the similarity in name, this table is not what's usually
 * considered a "symbol table" - normally, a "symbol table" is something that
 * contains *all* symbols of a given library. But this table only contains a
 * subset of those symbols, and mixes symbols from multiple libraries.
 */
export type NativeSymbolTable = {|
  // The library that this native symbol is in.
  libIndex: Array<IndexIntoLibs>,
  // The library-relative offset of this symbol.
  address: Array<Address>,
  // The symbol name, demangled.
  name: Array<IndexIntoStringTable>,
  // The size of the function's machine code (if known), in bytes.
  functionSize: Array<Bytes | null>,

  length: number,
|};

/**
 * The ResourceTable holds additional information about functions. It tends to contain
 * sparse arrays. Multiple functions can point to the same resource.
 */
export type ResourceTable = {|
  length: number,
  lib: Array<IndexIntoLibs | null>,
  name: Array<IndexIntoStringTable>,
  host: Array<IndexIntoStringTable | null>,
  type: resourceTypeEnum[],
|};

/**
 * Information about the shared libraries that were loaded into the processes in
 * the profile. This information is needed during symbolication. Most importantly,
 * the symbolication API requires a debugName + breakpadId for each set of
 * unsymbolicated addresses, to know where to obtain symbols for those addresses.
 */
export type Lib = {|
  arch: string, // e.g. "x86_64"
  name: string, // e.g. "firefox"
  path: string, // e.g. "/Applications/FirefoxNightly.app/Contents/MacOS/firefox"
  debugName: string, // e.g. "firefox", or "firefox.pdb" on Windows
  debugPath: string, // e.g. "/Applications/FirefoxNightly.app/Contents/MacOS/firefox"
  breakpadId: string, // e.g. "E54D3AF274383256B9F6144F83F3F7510"

  // The codeId is currently always null.
  // In the future, it will have the following values:
  //  - On macOS, it will still be null.
  //  - On Linux / Android, it will have the full GNU build id. (The breakpadId
  //    is also based on the build id, but truncates some information.)
  //    This lets us obtain unstripped system libraries on Linux distributions
  //    which have a "debuginfod" server, and we can use those unstripped binaries
  //    for symbolication.
  //  - On Windows, it will be the codeId for the binary (.exe / .dll), as used
  //    by Windows symbol servers. This will allow us to get assembly code for
  //    Windows system libraries for profiles which were captured on another machine.
  codeId: string | null, // e.g. "6132B96B70fd000"
|};

// The list of available category colors.
//
// We don't accept just any CSS color so that the front-end has more freedom about
// picking colors, for example to ensure contrast or to adjust to light/dark modes.
export type CategoryColor =
  | 'transparent' // used for "idle" frames / stacks
  | 'purple'
  | 'green'
  | 'orange'
  | 'yellow'
  | 'lightblue'
  | 'blue'
  | 'brown'
  | 'magenta'
  | 'red'
  | 'lightred'
  | 'darkgrey'
  | 'grey'; // <-- "grey" marks the default category

// A category in profile.meta.categories, used for stack frames and call nodes.
export type Category = {|
  // The category name.
  name: string,

  // The category color. Must be picked from the CategoryColor list. At least one
  // category with color "grey" must be present in the category list.
  color: CategoryColor,

  // The list of subcategories. Must always have at least one element; subcategory
  // zero must be the "Other" subcategory and is used to refer to the category itself.
  subcategories: string[],
|};

export type CategoryList = Array<Category>;

/**
 * A Page describes the page the browser profiled. In Firefox, TabIDs represent the
 * ID that is shared between multiple frames in a single tab. The Inner Window IDs
 * represent JS `window` objects in each Document. And they are unique for each frame.
 * That's why it's enough to keep only inner Window IDs inside marker payloads.
 * 0 means null(no embedder) for Embedder Window ID.
 *
 * The unique field for a page is innerWindowID.
 */
export type Page = {|
  // Tab ID of the page. This ID is the same for all the pages inside a tab's
  // session history.
  tabID: TabID,
  // ID of the JS `window` object in a `Document`. It's unique for every page.
  innerWindowID: InnerWindowID,
  // Url of this page.
  url: string,
  // Each page describes a frame in websites. A frame can either be the top-most
  // one or inside of another one. For the children frames, `embedderInnerWindowID`
  // points to the innerWindowID of the parent (embedder). It's `0` if there is
  // no embedder, which means that it's the top-most frame. That way all pages
  // can create a tree of pages that can be navigated.
  embedderInnerWindowID: number,
  // If true, this page has been opened in a private browsing window.
  // It's optional because it appeared in Firefox 98, and is absent before when
  // capturing was disabled when a private browsing window was open.
  // The property is always present in Firefox 98+.
  isPrivateBrowsing?: boolean,
  // Favicon data of the page if it was successfully retrieved from Firefox.
  // It's a base64 encoded URI string when available.
  // It's null when Firefox can't get the favicon.
  // This is added in Firefox 134, earlier profiles will not have it.
  favicon?: string | null,
|};

export type PageList = Array<Page>;

/**
 * Information about a period of time during which no samples were collected.
 */
export type PausedRange = {|
  // null if the profiler was already paused at the beginning of the period of
  // time that was present in the profile buffer
  startTime: Milliseconds | null,
  // null if the profiler was still paused when the profile was captured
  endTime: Milliseconds | null,
  reason: 'profiler-paused' | 'collecting',
|};

export type JsTracerTable = {|
  events: Array<IndexIntoStringTable>,
  timestamps: Array<Microseconds>,
  durations: Array<Microseconds | null>,
  line: Array<number | null>, // Line number.
  column: Array<number | null>, // Column number.
  length: number,
|};

export type RawCounterSamplesTable = {|
  time?: Milliseconds[],
  timeDeltas?: Milliseconds[],
  // The number of times the Counter's "number" was changed since the previous sample.
  // This property was mandatory until the format version 42, it was made optional in 43.
  number?: number[],
  // The count of the data, for instance for memory this would be bytes.
  count: number[],
  length: number,
|};

export type GraphColor =
  | 'blue'
  | 'green'
  | 'grey'
  | 'ink'
  | 'magenta'
  | 'orange'
  | 'purple'
  | 'red'
  | 'teal'
  | 'yellow';

export type RawCounter = {|
  name: string,
  category: string,
  description: string,
  color?: GraphColor,
  pid: Pid,
  mainThreadIndex: ThreadIndex,
  samples: RawCounterSamplesTable,
|};

/**
 * The statistics about profiler overhead. It includes max/min/mean values of
 * individual and overall overhead timings.
 */
export type ProfilerOverheadStats = {|
  maxCleaning: Microseconds,
  maxCounter: Microseconds,
  maxInterval: Microseconds,
  maxLockings: Microseconds,
  maxOverhead: Microseconds,
  maxThread: Microseconds,
  meanCleaning: Microseconds,
  meanCounter: Microseconds,
  meanInterval: Microseconds,
  meanLockings: Microseconds,
  meanOverhead: Microseconds,
  meanThread: Microseconds,
  minCleaning: Microseconds,
  minCounter: Microseconds,
  minInterval: Microseconds,
  minLockings: Microseconds,
  minOverhead: Microseconds,
  minThread: Microseconds,
  overheadDurations: Microseconds,
  overheadPercentage: Microseconds,
  profiledDuration: Microseconds,
  samplingCount: Microseconds,
|};

/**
 * This object represents the configuration of the profiler when the profile was recorded.
 */
export type ProfilerConfiguration = {|
  threads: string[],
  features: string[],
  capacity: Bytes,
  duration?: number,
  // Optional because that field is introduced in Firefox 72.
  // Active Tab ID indicates a Firefox tab. That field allows us to
  // create an "active tab view".
  // `0` means null value. Firefox only outputs `0` and not null, that's why we
  // should take care of this case while we are consuming it. If it's `0`, we
  // should revert back to the full view since there isn't enough data to show
  // the active tab view.
  activeTabID?: TabID,
|};

/**
 * Gecko Profiler records profiler overhead samples of specific tasks that take time.
 * counters: Time spent during collecting counter samples.
 * expiredMarkerCleaning: Time spent during expired marker cleanup
 * lockings: Time spent during acquiring locks.
 * threads: Time spent during threads sampling and marker collection.
 */
export type ProfilerOverheadSamplesTable = {|
  counters: Array<Microseconds>,
  expiredMarkerCleaning: Array<Microseconds>,
  locking: Array<Microseconds>,
  threads: Array<Microseconds>,
  time: Array<Milliseconds>,
  length: number,
|};

/**
 * Information about profiler overhead. It includes overhead timings for
 * counters, expired marker cleanings, mutex locking and threads. Also it
 * includes statistics about those individual and overall overhead.
 */
export type ProfilerOverhead = {|
  samples: ProfilerOverheadSamplesTable,
  // There is no statistics object if there is no sample.
  statistics?: ProfilerOverheadStats,
  pid: Pid,
  mainThreadIndex: ThreadIndex,
|};

// This list of process types is defined here:
// https://searchfox.org/mozilla-central/rev/819cd31a93fd50b7167979607371878c4d6f18e8/xpcom/build/nsXULAppAPI.h#383
export type ProcessType =
  | 'default'
  | 'plugin'
  | 'tab'
  | 'ipdlunittest'
  | 'geckomediaplugin'
  | 'gpu'
  | 'pdfium'
  | 'vr'
  // Unknown process type:
  // https://searchfox.org/mozilla-central/rev/819cd31a93fd50b7167979607371878c4d6f18e8/toolkit/xre/nsEmbedFunctions.cpp#232
  | 'invalid'
  | string;

/**
 * The thread type. Threads are stored in an array in profile.threads.
 *
 * If a profile contains threads from different OS-level processes, all threads
 * are flattened into the single threads array, and per-process information is
 * duplicated on each thread. In the UI, we recover the process separation based
 * on thread.pid.
 *
 * There is also a derived `Thread` type, see profile-derived.js.
 */
export type RawThread = {|
  processType: ProcessType,
  processStartupTime: Milliseconds,
  processShutdownTime: Milliseconds | null,
  registerTime: Milliseconds,
  unregisterTime: Milliseconds | null,
  pausedRanges: PausedRange[],
  showMarkersInTimeline?: boolean,
  name: string,
  isMainThread: boolean,
  // The eTLD+1 of the isolated content process if provided by the back-end.
  // It will be undefined if:
  // - Fission is not enabled.
  // - It's not an isolated content process.
  // - It's a sanitized profile.
  // - It's a profile from an older Firefox which doesn't include this field (introduced in Firefox 80).
  'eTLD+1'?: string,
  processName?: string,
  isJsTracer?: boolean,
  pid: Pid,
  tid: Tid,
  samples: RawSamplesTable,
  jsAllocations?: JsAllocationsTable,
  nativeAllocations?: NativeAllocationsTable,
  markers: RawMarkerTable,
  stackTable: RawStackTable,
  frameTable: FrameTable,
  funcTable: FuncTable,
  resourceTable: ResourceTable,
  nativeSymbols: NativeSymbolTable,
  jsTracer?: JsTracerTable,
  // If present and true, this thread was launched for a private browsing session only.
  // When false, it can still contain private browsing data if the profile was
  // captured in a non-fission browser.
  // It's absent in Firefox 97 and before, or in Firefox 98+ when this thread
  // had no extra attribute at all.
  isPrivateBrowsing?: boolean,
  // If present and non-0, the number represents the container this thread was loaded in.
  // It's absent in Firefox 97 and before, or in Firefox 98+ when this thread
  // had no extra attribute at all.
  userContextId?: number,
|};

export type ExtensionTable = {|
  baseURL: string[],
  id: string[],
  name: string[],
  length: number,
|};

/**
 * Visual progress describes the visual progression during page load. A sample is generated
 * everytime the visual completeness of the webpage changes.
 */
export type ProgressGraphData = {|
  // A percentage that describes the visual completeness of the webpage, ranging from 0% - 100%
  percent: number,
  // The time in milliseconds which the sample was taken.
  // This can be null due to https://github.com/sitespeedio/browsertime/issues/1746.
  timestamp: Milliseconds | null,
|};

/**
 * Visual metrics are performance metrics that measure above-the-fold webpage visual performance,
 * and more accurately describe how human end-users perceive the speed of webpage loading. These
 * metrics serves as additional metrics to the typical page-level metrics such as onLoad. Visual
 * metrics contains key metrics such as Speed Index, Perceptual Speed Index, and ContentfulSpeedIndex,
 * along with their visual progression. These properties find their way into the gecko profile through running
 * browsertime, which is a tool that lets you collect performance metrics of your website.
 * Browsertime provides the option of generating a gecko profile, which then embeds these visual metrics
 * into the geckoprofile. More information about browsertime can be found through https://github.com/sitespeedio/browsertime.
 * These values are generated only when browsertime is run with --visualMetrics.
 *
 * Most values from this object are generated by the python script https://github.com/sitespeedio/browsertime/blob/6e88284930c1d3ded8d9d95252d2e13c252d361c/browsertime/visualmetrics.py
 * Especially look at the function calculate_visual_metrics.
 * Then the script is called and the result processed from the JS files in https://github.com/sitespeedio/browsertime/tree/6e88284930c1d3ded8d9d95252d2e13c252d361c/lib/video/postprocessing/visualmetrics
 * and https://github.com/sitespeedio/browsertime/blob/6e88284930c1d3ded8d9d95252d2e13c252d361c/lib/core/engine/iteration.js#L261-L264.
 * Finally they're inserted into the JSON profile in https://github.com/sitespeedio/browsertime/blob/6e88284930c1d3ded8d9d95252d2e13c252d361c/lib/firefox/webdriver/firefox.js#L215-L230
 */
export type VisualMetrics = {|
  FirstVisualChange: number,
  LastVisualChange: number,
  SpeedIndex: number,
  VisualProgress: ProgressGraphData[],
  // Contentful and Perceptual values may be missing. They're generated only if
  // the user specifies the options --visualMetricsContentful and
  // --visualMetricsPerceptual in addition to --visualMetrics.
  ContentfulSpeedIndex?: number,
  ContentfulSpeedIndexProgress?: ProgressGraphData[],
  PerceptualSpeedIndex?: number,
  PerceptualSpeedIndexProgress?: ProgressGraphData[],
  // VisualReadiness and VisualCompleteXX values are generated in
  // https://github.com/sitespeedio/browsertime/blob/main/lib/video/postprocessing/visualmetrics/extraMetrics.js
  VisualReadiness: number,
  VisualComplete85: number,
  VisualComplete95: number,
  VisualComplete99: number,
|};

// Units of ThreadCPUDelta values for different platforms.
export type ThreadCPUDeltaUnit = 'ns' | 'µs' | 'variable CPU cycles';

// Unit of the values in the timeline. Used to differentiate size-profiles.
export type TimelineUnit = 'ms' | 'bytes';

// Object that holds the units of samples table values. Some of the values can be
// different depending on the platform, e.g. threadCPUDelta.
// See https://searchfox.org/mozilla-central/rev/851bbbd9d9a38c2785a24c13b6412751be8d3253/tools/profiler/core/platform.cpp#2601-2606
export type SampleUnits = {|
  +time: TimelineUnit,
  +eventDelay: 'ms',
  +threadCPUDelta: ThreadCPUDeltaUnit,
|};

export type ExtraProfileInfoSection = {|
  // section label
  label: string,
  entries: Array<{|
    label: string,
    format: MarkerFormatType,
    // any value valid for the formatter
    value: any,
  |}>,
|};

/**
 * Meta information associated for the entire profile.
 */
export type ProfileMeta = {|
  // The interval at which the threads are sampled.
  interval: Milliseconds,
  // When the main process started. Timestamp expressed in milliseconds since
  // midnight January 1, 1970 GMT.
  startTime: Milliseconds,
  startTimeAsClockMonotonicNanosecondsSinceBoot?: number,
  startTimeAsMachAbsoluteTimeNanoseconds?: number,
  startTimeAsQueryPerformanceCounterValue?: number,
  // The number of milliseconds since midnight January 1, 1970 GMT.
  endTime?: Milliseconds,
  // When the recording started (in milliseconds after startTime).
  profilingStartTime?: Milliseconds,
  // When the recording ended (in milliseconds after startTime).
  profilingEndTime?: Milliseconds,
  // The process type where the Gecko profiler was started. This is the raw enum
  // numeric value as defined here:
  // https://searchfox.org/mozilla-central/rev/819cd31a93fd50b7167979607371878c4d6f18e8/xpcom/build/nsXULAppAPI.h#365
  processType: number,
  // The extensions property landed in Firefox 60, and is only optional because older
  // processed profile versions may not have it. No upgrader was written for this change.
  extensions?: ExtensionTable,
  // The list of categories used in this profile. If present, it must contain at least the
  // "default category" which is defined as the first category whose color is "grey" - this
  // category usually has the name "Other".
  // If meta.categories is not present, a default list is substituted.
  categories?: CategoryList,
  // The name of the product, most likely "Firefox".
  product: 'Firefox' | string,
  // This value represents a boolean, but for some reason is written out as an int value.
  // It's 0 for the stack walking feature being turned off, and 1 for stackwalking being
  // turned on.
  stackwalk: 0 | 1,
  // A boolean flag indicating whether the profiled application is using a debug build.
  // It's false for opt builds, and true for debug builds.
  // This property is optional because older processed profiles don't have this but
  // this property was added to Firefox a long time ago. It should work on older Firefox
  // versions without any problem.
  debug?: boolean,
  // This is the Gecko profile format version (the unprocessed version received directly
  // from the browser.)
  version: number,
  // This is the processed profile format version.
  preprocessedProfileVersion: number,

  // The following fields are most likely included in Gecko profiles, but are marked
  // optional for imported or converted profiles.

  // The XPCOM ABI (Application Binary Interface) name, taking the form:
  // {CPU_ARCH}-{TARGET_COMPILER_ABI} e.g. "x86_64-gcc3"
  // See https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/XPCOM_ABI
  abi?: string,
  // The "misc" value of the browser's user agent, typically the revision of the browser.
  // e.g. "rv:63.0", which would be Firefox 63.0
  // See https://searchfox.org/mozilla-central/rev/819cd31a93fd50b7167979607371878c4d6f18e8/netwerk/protocol/http/nsHttpHandler.h#543
  misc?: string,
  // The OS and CPU. e.g. "Intel Mac OS X"
  oscpu?: string,
  // The size of the main memory in bytes
  mainMemory?: Bytes,
  // The current platform, as taken from the user agent string.
  // See https://searchfox.org/mozilla-central/rev/819cd31a93fd50b7167979607371878c4d6f18e8/netwerk/protocol/http/nsHttpHandler.cpp#992
  platform?:
    | 'Android' // It usually has the version embedded in the string
    | 'Windows'
    | 'Macintosh'
    // X11 is used for historic reasons, but this value means that it is a Unix platform.
    | 'X11'
    | string,
  // The widget toolkit used for GUI rendering.
  // Older versions of Firefox for Linux had the 2 flavors gtk2/gtk3, and so
  // we could find the value "gtk3".
  toolkit?: 'gtk' | 'gtk3' | 'windows' | 'cocoa' | 'android' | string,

  // The appBuildID, sourceURL, physicalCPUs and logicalCPUs properties landed
  // in Firefox 62, and are optional because older processed profile
  // versions may not have them. No upgrader was written for this change.
  // The CPUName property landed in Firefox 108.

  // The build ID/date of the application.
  appBuildID?: string,
  // Arguments to the program (currently only used for imported profiles)
  arguments?: string,
  // The URL to the source revision for this build of the application.
  sourceURL?: string,
  // The physical number of CPU cores for the machine.
  physicalCPUs?: number,
  // The amount of logically available CPU cores for the program.
  logicalCPUs?: number,
  // The name of the CPU (typically a string of up to 48 characters).
  CPUName?: string,
  // A boolean flag indicating whether we symbolicated this profile. If this is
  // false we'll start a symbolication process when the profile is loaded.
  // A missing property means that it's an older profile, it stands for an
  // "unknown" state.  For now we don't do much with it but we may want to
  // propose a manual symbolication in the future.
  symbolicated?: boolean,
  // A boolean flag indicating that symbolication is not supported
  // Used for imported profiles that cannot be symbolicated
  symbolicationNotSupported?: boolean,
  // The Update channel for this build of the application.
  // This property is landed in Firefox 67, and is optional because older
  // processed profile versions may not have them. No upgrader was necessary.
  updateChannel?:
    | 'default' // Local builds
    | 'nightly'
    | 'nightly-try' // Nightly try builds for QA
    | 'aurora' // Developer Edition channel
    | 'beta'
    | 'release'
    | 'esr' // Extended Support Release channel
    | string,
  // Visual metrics contains additional performance metrics such as Speed Index,
  // Perceptual Speed Index, and ContentfulSpeedIndex. This is optional because only
  // profiles generated by browsertime will have this property. Source code for
  // browsertime can be found at https://github.com/sitespeedio/browsertime.
  visualMetrics?: VisualMetrics,
  // The configuration of the profiler at the time of recording. Optional since older
  // versions of Firefox did not include it.
  configuration?: ProfilerConfiguration,
  // Markers are displayed in the UI according to a schema definition. See the
  // MarkerSchema type for more information.
  markerSchema: MarkerSchema[],
  // Units of samples table values.
  // The sampleUnits property landed in Firefox 86, and is only optional because
  // older profile versions may not have it. No upgrader was written for this change.
  sampleUnits?: SampleUnits,
  // Information of the device that profile is captured from.
  // Currently it's only present for Android devices and it includes brand and
  // model names of that device.
  // It's optional because profiles from non-Android devices and from older
  // Firefox versions may not have it.
  // This property landed in Firefox 88.
  device?: string,
  // Profile importers can optionally add information about where they are imported from.
  // They also use the "product" field in the meta information, but this is somewhat
  // ambiguous. This field, if present, is unambiguous that it was imported.
  importedFrom?: string,

  // The following are settings that are used to configure the views for
  // imported profiles, as some features do not make sense for them

  // Do not distinguish between different stack types?
  usesOnlyOneStackType?: boolean,
  // Hide the "Look up the function name on Searchfox" menu entry?
  sourceCodeIsNotOnSearchfox?: boolean,
  // Extra information about the profile, not shown in the "Profile Info" panel,
  // but in the more info panel
  extra?: ExtraProfileInfoSection[],
  // Indexes of the threads that are initially visible in the UI.
  // This is useful for imported profiles for which the internal visibility score
  // ranking does not make sense.
  initialVisibleThreads?: ThreadIndex[],
  // Indexes of the threads that are initially selected in the UI.
  // This is also most useful for imported profiles where just using the first thread
  // of each process might not make sense.
  initialSelectedThreads?: ThreadIndex[],
  // Keep the defined thread order
  keepProfileThreadOrder?: boolean,

  // Grams of CO2 equivalent per kWh. Used to display power track tooltips.
  // Will fallback to the global average if this is missing.
  gramsOfCO2ePerKWh?: number,
|};

export type RawProfileSharedData = {|
  // Strings for profiles are collected into a single table, and are referred to by
  // their index by other tables.
  stringArray: string[],
|};

/**
 * All of the data for a processed profile.
 */
export type Profile = {|
  meta: ProfileMeta,
  libs: Lib[],
  pages?: PageList,
  // The counters list is optional only because old profilers may not have them.
  // An upgrader could be written to make this non-optional.
  counters?: RawCounter[],
  // The profilerOverhead list is optional only because old profilers may not
  // have them. An upgrader could be written to make this non-optional.
  // This is list because there is a profiler overhead per process.
  profilerOverhead?: ProfilerOverhead[],
  shared: RawProfileSharedData,
  threads: RawThread[],
  profilingLog?: ProfilingLog,
  profileGatheringLog?: ProfilingLog,
|};
