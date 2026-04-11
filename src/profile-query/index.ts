/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements a library for querying the contents of a profile.
 *
 * To use it it first needs to be built:
 *   yarn build-profile-query
 *
 * Then it can be used from an interactive node session:
 *
 * % node
 * > const { ProfileQuerier } = (await import('./dist/profile-query.js')).default;
 * undefined
 * > const p1 = await ProfileQuerier.load("/Users/mstange/Downloads/merged-profile.json.gz");
 * > const p2 = await ProfileQuerier.load("https://profiler.firefox.com/from-url/http%3A%2F%2Fexample.com%2Fprofile.json/");
 * > const p3 = await ProfileQuerier.load("https://share.firefox.dev/4oLEjCw");
 */

import {
  getProfile,
  getProfileRootRange,
} from 'firefox-profiler/selectors/profile';
import {
  getAllCommittedRanges,
  getSelectedThreadIndexes,
  getTransformStack,
  getCurrentSearchString,
} from 'firefox-profiler/selectors/url-state';
import {
  commitRange,
  popCommittedRanges,
  changeSelectedThreads,
  addTransformToStack,
  changeCallTreeSearchString,
} from '../actions/profile-view';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { TimestampManager } from './timestamps';
import { ThreadMap } from './thread-map';
import { parseFunctionHandle } from './function-map';
import { MarkerMap } from './marker-map';
import { loadProfileFromFileOrUrl } from './loader';
import { collectProfileInfo } from './formatters/profile-info';
import {
  collectThreadInfo,
  collectThreadSamples,
  collectThreadSamplesTopDown,
  collectThreadSamplesBottomUp,
  collectThreadFunctions,
} from './formatters/thread-info';
import {
  collectThreadMarkers,
  collectMarkerStack,
  collectMarkerInfo,
} from './formatters/marker-info';
import { parseTimeValue } from './time-range-parser';
import { FilterStack, pushSpecTransforms } from './filter-stack';
import type {
  StatusResult,
  SessionContext,
  WithContext,
  FunctionExpandResult,
  FunctionInfoResult,
  ViewRangeResult,
  ThreadInfoResult,
  MarkerStackResult,
  MarkerInfoResult,
  ProfileInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  ThreadMarkersResult,
  ThreadFunctionsResult,
  MarkerFilterOptions,
  FunctionFilterOptions,
  SampleFilterSpec,
  FilterStackResult,
} from './types';
import type { CallTreeCollectionOptions } from './formatters/call-tree';

import { getThreadsKey } from 'firefox-profiler/profile-logic/profile-data';
import type { StartEndRange, ThreadIndex } from 'firefox-profiler/types';
import type { Store } from '../types/store';

export class ProfileQuerier {
  _store: Store;
  _processIndexMap: Map<string, number>;
  _timestampManager: TimestampManager;
  _threadMap: ThreadMap;
  _markerMap: MarkerMap;
  _filterStack: FilterStack;

  constructor(store: Store, rootRange: StartEndRange) {
    this._store = store;
    this._processIndexMap = new Map();
    this._timestampManager = new TimestampManager(rootRange);
    this._threadMap = new ThreadMap();
    this._filterStack = new FilterStack();

    // Build process index map
    const state = this._store.getState();
    const profile = getProfile(state);
    this._markerMap = new MarkerMap();
    const uniquePids = Array.from(new Set(profile.threads.map((t) => t.pid)));
    uniquePids.forEach((pid, index) => {
      this._processIndexMap.set(pid, index);
    });
  }

  static async load(filePathOrUrl: string): Promise<ProfileQuerier> {
    const { store, rootRange } = await loadProfileFromFileOrUrl(filePathOrUrl);
    return new ProfileQuerier(store, rootRange);
  }

  async profileInfo(
    showAll: boolean = false,
    search?: string
  ): Promise<WithContext<ProfileInfoResult>> {
    const result = await collectProfileInfo(
      this._store,
      this._timestampManager,
      this._threadMap,
      this._processIndexMap,
      showAll,
      search
    );
    return { ...result, context: this._getContext() };
  }

  async threadInfo(
    threadHandle?: string
  ): Promise<WithContext<ThreadInfoResult>> {
    const result = await collectThreadInfo(
      this._store,
      this._timestampManager,
      this._threadMap,
      threadHandle
    );
    return { ...result, context: this._getContext() };
  }

  async threadSamples(
    threadHandle?: string,
    includeIdle: boolean = false,
    search?: string,
    sampleFilters?: SampleFilterSpec[]
  ): Promise<WithContext<ThreadSamplesResult>> {
    const activeOnly = !includeIdle;
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const collect = () =>
      collectThreadSamples(this._store, this._threadMap, threadHandle);
    const withIdle = activeOnly
      ? () => this._withDroppedIdle(threadIndexes, collect)
      : collect;
    const withSearch = search
      ? () => this._withCallTreeSearch(search, withIdle)
      : withIdle;
    const result =
      sampleFilters && sampleFilters.length > 0
        ? this._withEphemeralFilters(threadIndexes, sampleFilters, withSearch)
        : withSearch();
    const activeFilters = this._filterStack.list(getThreadsKey(threadIndexes));
    return {
      ...result,
      activeOnly,
      search: search || undefined,
      activeFilters: activeFilters.length > 0 ? activeFilters : undefined,
      ephemeralFilters:
        sampleFilters && sampleFilters.length > 0 ? sampleFilters : undefined,
      context: this._getContext(),
    };
  }

  async threadSamplesTopDown(
    threadHandle?: string,
    callTreeOptions?: CallTreeCollectionOptions,
    includeIdle: boolean = false,
    search?: string,
    sampleFilters?: SampleFilterSpec[]
  ): Promise<WithContext<ThreadSamplesTopDownResult>> {
    const activeOnly = !includeIdle;
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const collect = () =>
      collectThreadSamplesTopDown(
        this._store,
        this._threadMap,
        threadHandle,
        callTreeOptions
      );
    const withIdle = activeOnly
      ? () => this._withDroppedIdle(threadIndexes, collect)
      : collect;
    const withSearch = search
      ? () => this._withCallTreeSearch(search, withIdle)
      : withIdle;
    const result =
      sampleFilters && sampleFilters.length > 0
        ? this._withEphemeralFilters(threadIndexes, sampleFilters, withSearch)
        : withSearch();
    const activeFilters = this._filterStack.list(getThreadsKey(threadIndexes));
    return {
      ...result,
      activeOnly,
      search: search || undefined,
      activeFilters: activeFilters.length > 0 ? activeFilters : undefined,
      ephemeralFilters:
        sampleFilters && sampleFilters.length > 0 ? sampleFilters : undefined,
      context: this._getContext(),
    };
  }

  async threadSamplesBottomUp(
    threadHandle?: string,
    callTreeOptions?: CallTreeCollectionOptions,
    includeIdle: boolean = false,
    search?: string,
    sampleFilters?: SampleFilterSpec[]
  ): Promise<WithContext<ThreadSamplesBottomUpResult>> {
    const activeOnly = !includeIdle;
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const collect = () =>
      collectThreadSamplesBottomUp(
        this._store,
        this._threadMap,
        threadHandle,
        callTreeOptions
      );
    const withIdle = activeOnly
      ? () => this._withDroppedIdle(threadIndexes, collect)
      : collect;
    const withSearch = search
      ? () => this._withCallTreeSearch(search, withIdle)
      : withIdle;
    const result =
      sampleFilters && sampleFilters.length > 0
        ? this._withEphemeralFilters(threadIndexes, sampleFilters, withSearch)
        : withSearch();
    const activeFilters = this._filterStack.list(getThreadsKey(threadIndexes));
    return {
      ...result,
      activeOnly,
      search: search || undefined,
      activeFilters: activeFilters.length > 0 ? activeFilters : undefined,
      ephemeralFilters:
        sampleFilters && sampleFilters.length > 0 ? sampleFilters : undefined,
      context: this._getContext(),
    };
  }

  /**
   * Push a view range selection (commit a range).
   * Supports multiple formats:
   * - Marker handle: "m-1" (uses marker's start/end times)
   * - Timestamp names: "ts-6,ts-7"
   * - Seconds: "2.7,3.1" (default if no suffix)
   * - Milliseconds: "2700ms,3100ms"
   * - Percentage: "10%,20%"
   */
  async pushViewRange(rangeName: string): Promise<ViewRangeResult> {
    const state = this._store.getState();
    const rootRange = getProfileRootRange(state);
    const zeroAt = rootRange.start;

    let startTimestamp: number;
    let endTimestamp: number;
    let markerInfo: ViewRangeResult['markerInfo'] = undefined;

    // Check if it's a marker handle (e.g., "m-1")
    if (rangeName.startsWith('m-') && !rangeName.includes(',')) {
      // Look up the marker
      const { threadIndexes, markerIndex } =
        this._markerMap.markerForHandle(rangeName);
      const threadSelectors = getThreadSelectors(threadIndexes);
      const fullMarkerList = threadSelectors.getFullMarkerList(state);
      const marker = fullMarkerList[markerIndex];

      if (!marker) {
        throw new Error(`Marker ${rangeName} not found`);
      }

      // Check if marker is an interval marker (has end time)
      if (marker.end === null) {
        throw new Error(
          `Marker ${rangeName} is an instant marker (no duration). Only interval markers can be used for zoom ranges.`
        );
      }

      startTimestamp = marker.start;
      endTimestamp = marker.end;

      // Store marker info for enhanced output
      const threadHandle =
        this._threadMap.handleForThreadIndexes(threadIndexes);
      const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
      markerInfo = {
        markerHandle: rangeName,
        markerName: marker.name,
        threadHandle,
        threadName: friendlyThreadName,
      };
    } else {
      // Split at comma for traditional range format
      const parts = rangeName.split(',').map((s) => s.trim());
      if (parts.length !== 2) {
        throw new Error(
          `Invalid range format: "${rangeName}". Expected a marker handle (e.g., "m-1") or two comma-separated values (e.g., "2.7,3.1" or "ts-6,ts-7")`
        );
      }

      // Parse start and end values (supports multiple formats)
      const parsedStart = parseTimeValue(parts[0], rootRange);
      const parsedEnd = parseTimeValue(parts[1], rootRange);

      // If parseTimeValue returns null, it's a timestamp name - look it up
      startTimestamp =
        parsedStart ??
        (() => {
          const ts = this._timestampManager.timestampForName(parts[0]);
          if (ts === null) {
            throw new Error(`Unknown timestamp name: "${parts[0]}"`);
          }
          return ts;
        })();

      endTimestamp =
        parsedEnd ??
        (() => {
          const ts = this._timestampManager.timestampForName(parts[1]);
          if (ts === null) {
            throw new Error(`Unknown timestamp name: "${parts[1]}"`);
          }
          return ts;
        })();
    }

    // Get or create timestamp names for display
    const startName = this._timestampManager.nameForTimestamp(startTimestamp);
    const endName = this._timestampManager.nameForTimestamp(endTimestamp);

    // Convert absolute timestamps to relative timestamps.
    // commitRange expects timestamps relative to the profile start (zeroAt),
    // but we have absolute timestamps. The getCommittedRange selector will
    // add zeroAt back to them.
    const relativeStart = startTimestamp - zeroAt;
    const relativeEnd = endTimestamp - zeroAt;

    // Dispatch the commitRange action with relative timestamps
    this._store.dispatch(commitRange(relativeStart, relativeEnd));

    // Get the zoom depth after pushing
    const newState = this._store.getState();
    const committedRanges = getAllCommittedRanges(newState);
    const zoomDepth = committedRanges.length;

    // Calculate duration
    const duration = endTimestamp - startTimestamp;

    const message = `Pushed view range: ${startName} (${this._timestampManager.timestampString(startTimestamp)}) to ${endName} (${this._timestampManager.timestampString(endTimestamp)})`;

    return {
      type: 'view-range',
      action: 'push',
      range: {
        start: startTimestamp,
        startName,
        end: endTimestamp,
        endName,
      },
      message,
      duration,
      zoomDepth,
      markerInfo,
    };
  }

  /**
   * Pop the most recent view range selection.
   */
  async popViewRange(): Promise<ViewRangeResult> {
    const state = this._store.getState();
    const committedRanges = getAllCommittedRanges(state);

    if (committedRanges.length === 0) {
      throw new Error('No view ranges to pop');
    }

    // Pop the last committed range (index = length - 1)
    const poppedIndex = committedRanges.length - 1;
    this._store.dispatch(popCommittedRanges(poppedIndex));

    const poppedRange = committedRanges[poppedIndex];

    // Convert relative timestamps back to absolute timestamps
    // committedRanges stores timestamps relative to the profile start (zeroAt)
    const rootRange = getProfileRootRange(state);
    const zeroAt = rootRange.start;
    const absoluteStart = poppedRange.start + zeroAt;
    const absoluteEnd = poppedRange.end + zeroAt;

    const startName = this._timestampManager.nameForTimestamp(absoluteStart);
    const endName = this._timestampManager.nameForTimestamp(absoluteEnd);

    const message = `Popped view range: ${startName} (${this._timestampManager.timestampString(absoluteStart)}) to ${endName} (${this._timestampManager.timestampString(absoluteEnd)})`;

    return {
      type: 'view-range',
      action: 'pop',
      range: {
        start: absoluteStart,
        startName,
        end: absoluteEnd,
        endName,
      },
      message,
    };
  }

  /**
   * Clear all view range selections (return to root view).
   */
  async clearViewRange(): Promise<ViewRangeResult> {
    const state = this._store.getState();
    const committedRanges = getAllCommittedRanges(state);

    if (committedRanges.length === 0) {
      throw new Error('No view ranges to clear');
    }

    // Pop all committed ranges (index 0 pops from the first one)
    this._store.dispatch(popCommittedRanges(0));

    const rootRange = getProfileRootRange(state);
    const startName = this._timestampManager.nameForTimestamp(rootRange.start);
    const endName = this._timestampManager.nameForTimestamp(rootRange.end);

    const message = `Cleared all view ranges, returned to full profile: ${startName} (${this._timestampManager.timestampString(rootRange.start)}) to ${endName} (${this._timestampManager.timestampString(rootRange.end)})`;

    return {
      type: 'view-range',
      action: 'pop',
      range: {
        start: rootRange.start,
        startName,
        end: rootRange.end,
        endName,
      },
      message,
    };
  }

  /**
   * Select one or more threads by handle (e.g., "t-0" or "t-0,t-1,t-2").
   */
  async threadSelect(threadHandle: string): Promise<string> {
    const threadIndexes = this._threadMap.threadIndexesForHandle(threadHandle);

    // Change the selected threads in the Redux store
    this._store.dispatch(changeSelectedThreads(threadIndexes));

    const state = this._store.getState();
    const profile = getProfile(state);

    if (threadIndexes.size === 1) {
      const threadIndex = Array.from(threadIndexes)[0];
      const thread = profile.threads[threadIndex];
      return `Selected thread: ${threadHandle} (${thread.name})`;
    }

    const names = Array.from(threadIndexes)
      .map((idx) => profile.threads[idx].name)
      .join(', ');
    return `Selected ${threadIndexes.size} threads: ${threadHandle} (${names})`;
  }

  /**
   * Push a new filter onto the current thread's filter stack.
   */
  filterPush(spec: SampleFilterSpec, threadHandle?: string): FilterStackResult {
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const threadsKey = getThreadsKey(threadIndexes);
    const actualHandle =
      threadHandle ?? this._threadMap.handleForThreadIndexes(threadIndexes);

    const entry = this._filterStack.push(this._store, threadsKey, spec);
    const filters = this._filterStack.list(threadsKey);

    return {
      type: 'filter-stack',
      threadHandle: actualHandle,
      filters,
      action: 'push',
      message: `Pushed filter ${entry.index}: ${entry.description}`,
    };
  }

  /**
   * Pop the last `count` filters from the current thread's filter stack.
   */
  filterPop(count: number = 1, threadHandle?: string): FilterStackResult {
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const threadsKey = getThreadsKey(threadIndexes);
    const actualHandle =
      threadHandle ?? this._threadMap.handleForThreadIndexes(threadIndexes);

    const removed = this._filterStack.pop(this._store, threadsKey, count);
    const filters = this._filterStack.list(threadsKey);

    let msg;
    if (removed.length === 0) {
      msg = 'No filters to pop';
    } else if (removed.length === 1) {
      msg = `Popped filter: ${removed[0].description}`;
    } else {
      msg = `Popped ${removed.length} filters`;
    }

    return {
      type: 'filter-stack',
      threadHandle: actualHandle,
      filters,
      action: 'pop',
      message: msg,
    };
  }

  /**
   * Clear all filters from the current thread's filter stack.
   */
  filterClear(threadHandle?: string): FilterStackResult {
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const threadsKey = getThreadsKey(threadIndexes);
    const actualHandle =
      threadHandle ?? this._threadMap.handleForThreadIndexes(threadIndexes);

    const removed = this._filterStack.clear(this._store, threadsKey);
    const msg =
      removed.length === 0
        ? 'No filters to clear'
        : `Cleared ${removed.length} filter(s)`;

    return {
      type: 'filter-stack',
      threadHandle: actualHandle,
      filters: [],
      action: 'clear',
      message: msg,
    };
  }

  /**
   * List all active filters for the current thread.
   */
  filterList(threadHandle?: string): FilterStackResult {
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const threadsKey = getThreadsKey(threadIndexes);
    const actualHandle =
      threadHandle ?? this._threadMap.handleForThreadIndexes(threadIndexes);

    const filters = this._filterStack.list(threadsKey);
    return {
      type: 'filter-stack',
      threadHandle: actualHandle,
      filters,
    };
  }

  /**
   * Temporarily push a list of sample filter specs as Redux transforms, run fn(),
   * then pop them. Used to apply ephemeral (one-shot) filters to a single command.
   */
  private _withEphemeralFilters<T>(
    threadIndexes: Set<ThreadIndex>,
    filters: SampleFilterSpec[],
    fn: () => T
  ): T {
    if (filters.length === 0) {
      return fn();
    }
    const threadsKey = getThreadsKey(threadIndexes);
    const stackLengthBefore = getTransformStack(
      this._store.getState(),
      threadsKey
    ).length;

    for (const spec of filters) {
      pushSpecTransforms(this._store, threadsKey, spec);
    }

    try {
      return fn();
    } finally {
      this._store.dispatch({
        type: 'POP_TRANSFORMS_FROM_STACK',
        threadsKey,
        firstPoppedFilterIndex: stackLengthBefore,
      });
    }
  }

  /**
   * Apply a drop-category transform for the Idle category around a computation,
   * then restore the transform stack to its previous state.
   * If the profile has no Idle category, fn() is called without changes.
   */
  private _withDroppedIdle<T>(threadIndexes: Set<ThreadIndex>, fn: () => T): T {
    const state = this._store.getState();
    const profile = getProfile(state);
    const idleCategoryIndex =
      profile.meta.categories?.findIndex((c) => c.name === 'Idle') ?? -1;

    if (idleCategoryIndex === -1) {
      return fn();
    }

    const threadsKey = getThreadsKey(threadIndexes);
    const stackLengthBefore = getTransformStack(state, threadsKey).length;

    this._store.dispatch(
      addTransformToStack(threadsKey, {
        type: 'drop-category',
        category: idleCategoryIndex,
      })
    );

    try {
      return fn();
    } finally {
      this._store.dispatch({
        type: 'POP_TRANSFORMS_FROM_STACK',
        threadsKey,
        firstPoppedFilterIndex: stackLengthBefore,
      });
    }
  }

  /**
   * Set the call tree search string around a computation, then restore the
   * previous search string.
   */
  private _withCallTreeSearch<T>(searchString: string, fn: () => T): T {
    const previousSearch = getCurrentSearchString(this._store.getState());
    this._store.dispatch(changeCallTreeSearchString(searchString));
    try {
      return fn();
    } finally {
      this._store.dispatch(changeCallTreeSearchString(previousSearch));
    }
  }

  /**
   * Get current session context for display in command outputs.
   * This is a lightweight version of getStatus() that includes only
   * the current view range (not the full stack).
   */
  private _getContext(): SessionContext {
    const state = this._store.getState();
    const profile = getProfile(state);
    const rootRange = getProfileRootRange(state);
    const committedRanges = getAllCommittedRanges(state);
    const selectedThreadIndexes = getSelectedThreadIndexes(state);

    // Get selected threads info
    const selectedThreadHandle =
      selectedThreadIndexes.size > 0
        ? this._threadMap.handleForThreadIndexes(selectedThreadIndexes)
        : null;

    const selectedThreads = Array.from(selectedThreadIndexes).map(
      (threadIndex) => ({
        threadIndex,
        name: profile.threads[threadIndex].name,
      })
    );

    // Get current (most recent) view range if any
    const zeroAt = rootRange.start;
    let currentViewRange = null;
    if (committedRanges.length > 0) {
      const range = committedRanges[committedRanges.length - 1];
      const absoluteStart = range.start + zeroAt;
      const absoluteEnd = range.end + zeroAt;
      const startName = this._timestampManager.nameForTimestamp(absoluteStart);
      const endName = this._timestampManager.nameForTimestamp(absoluteEnd);
      currentViewRange = {
        start: absoluteStart,
        startName,
        end: absoluteEnd,
        endName,
      };
    }

    return {
      selectedThreadHandle,
      selectedThreads,
      currentViewRange,
      rootRange: {
        start: rootRange.start,
        end: rootRange.end,
      },
    };
  }

  /**
   * Get current session status including selected threads and view ranges.
   */
  async getStatus(): Promise<StatusResult> {
    const state = this._store.getState();
    const profile = getProfile(state);
    const rootRange = getProfileRootRange(state);
    const committedRanges = getAllCommittedRanges(state);
    const selectedThreadIndexes = getSelectedThreadIndexes(state);

    // Get selected threads info
    const selectedThreadHandle =
      selectedThreadIndexes.size > 0
        ? this._threadMap.handleForThreadIndexes(selectedThreadIndexes)
        : null;

    const selectedThreads = Array.from(selectedThreadIndexes).map(
      (threadIndex) => ({
        threadIndex,
        name: profile.threads[threadIndex].name,
      })
    );

    // Collect view ranges
    const zeroAt = rootRange.start;
    const viewRanges = committedRanges.map((range) => {
      const absoluteStart = range.start + zeroAt;
      const absoluteEnd = range.end + zeroAt;
      const startName = this._timestampManager.nameForTimestamp(absoluteStart);
      const endName = this._timestampManager.nameForTimestamp(absoluteEnd);
      return {
        start: absoluteStart,
        startName,
        end: absoluteEnd,
        endName,
      };
    });

    // Collect active filter stacks
    const filterStacks = this._filterStack
      .activeThreadsKeys()
      .map((threadsKey) => ({
        threadsKey,
        threadHandle: this._threadMap.handleForKey(threadsKey),
        filters: this._filterStack.list(threadsKey),
      }));

    return {
      type: 'status',
      selectedThreadHandle,
      selectedThreads,
      viewRanges,
      rootRange: {
        start: rootRange.start,
        end: rootRange.end,
      },
      filterStacks,
    };
  }

  /**
   * Expand a function handle to show the full untruncated name.
   */
  async functionExpand(
    functionHandle: string
  ): Promise<WithContext<FunctionExpandResult>> {
    const state = this._store.getState();
    const profile = getProfile(state);
    const { funcTable, resourceTable, stringArray } = profile.shared;

    // Look up the function
    const funcIndex = parseFunctionHandle(functionHandle, funcTable.length);
    const funcName = stringArray[funcTable.name[funcIndex]];
    const resourceIndex = funcTable.resource[funcIndex];

    // Get library prefix if available
    let library: string | undefined;
    if (resourceIndex !== -1) {
      const libIndex = resourceTable.lib[resourceIndex];
      if (libIndex !== null && libIndex !== undefined && profile.libs) {
        const lib = profile.libs[libIndex];
        library = lib.name;
      }
    }

    const fullName = library ? `${library}!${funcName}` : funcName;

    return {
      type: 'function-expand',
      functionHandle,
      funcIndex,
      name: funcName,
      fullName,
      library,
      context: this._getContext(),
    };
  }

  /**
   * Show detailed information about a function.
   */
  async functionInfo(
    functionHandle: string
  ): Promise<WithContext<FunctionInfoResult>> {
    const state = this._store.getState();
    const profile = getProfile(state);
    const { funcTable, resourceTable, stringArray } = profile.shared;

    // Look up the function
    const funcIndex = parseFunctionHandle(functionHandle, funcTable.length);
    const funcName = stringArray[funcTable.name[funcIndex]];
    const resourceIndex = funcTable.resource[funcIndex];
    const isJS = funcTable.isJS[funcIndex];
    const relevantForJS = funcTable.relevantForJS[funcIndex];

    let resource: FunctionInfoResult['resource'];
    let library: FunctionInfoResult['library'];
    let libraryName: string | undefined;

    // Add resource info if available
    if (resourceIndex !== -1) {
      const resourceName = stringArray[resourceTable.name[resourceIndex]];
      resource = {
        name: resourceName,
        index: resourceIndex,
      };

      const libIndex = resourceTable.lib[resourceIndex];
      if (
        libIndex !== null &&
        libIndex !== undefined &&
        libIndex >= 0 &&
        profile.libs
      ) {
        const lib = profile.libs[libIndex];
        libraryName = lib.name;
        library = {
          name: lib.name,
          path: lib.path,
          debugName: lib.debugName,
          debugPath: lib.debugPath,
          breakpadId: lib.breakpadId,
        };
      }
    }

    const fullName = libraryName ? `${libraryName}!${funcName}` : funcName;

    return {
      type: 'function-info',
      functionHandle,
      funcIndex,
      name: funcName,
      fullName,
      isJS,
      relevantForJS,
      resource,
      library,
      context: this._getContext(),
    };
  }

  /**
   * List markers for a thread with aggregated statistics.
   */
  async threadMarkers(
    threadHandle?: string,
    filterOptions?: MarkerFilterOptions
  ): Promise<WithContext<ThreadMarkersResult>> {
    const result = await collectThreadMarkers(
      this._store,
      this._threadMap,
      this._markerMap,
      threadHandle,
      filterOptions
    );
    return { ...result, context: this._getContext() };
  }

  /**
   * List all functions for a thread with their CPU percentages.
   * Supports filtering by search string, minimum self time, and limit.
   */
  async threadFunctions(
    threadHandle?: string,
    filterOptions?: FunctionFilterOptions,
    includeIdle: boolean = false,
    sampleFilters?: SampleFilterSpec[]
  ): Promise<WithContext<ThreadFunctionsResult>> {
    const activeOnly = !includeIdle;
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const collect = () =>
      collectThreadFunctions(
        this._store,
        this._threadMap,
        threadHandle,
        filterOptions
      );
    const withIdle = activeOnly
      ? () => this._withDroppedIdle(threadIndexes, collect)
      : collect;
    const result =
      sampleFilters && sampleFilters.length > 0
        ? this._withEphemeralFilters(threadIndexes, sampleFilters, withIdle)
        : withIdle();
    const activeFilters = this._filterStack.list(getThreadsKey(threadIndexes));
    return {
      ...result,
      activeOnly,
      activeFilters: activeFilters.length > 0 ? activeFilters : undefined,
      ephemeralFilters:
        sampleFilters && sampleFilters.length > 0 ? sampleFilters : undefined,
      context: this._getContext(),
    };
  }

  /**
   * Show detailed information about a specific marker.
   */
  async markerInfo(
    markerHandle: string
  ): Promise<WithContext<MarkerInfoResult>> {
    const result = await collectMarkerInfo(
      this._store,
      this._markerMap,
      this._threadMap,
      markerHandle
    );
    return { ...result, context: this._getContext() };
  }

  async markerStack(
    markerHandle: string
  ): Promise<WithContext<MarkerStackResult>> {
    const result = await collectMarkerStack(
      this._store,
      this._markerMap,
      this._threadMap,
      markerHandle
    );
    return { ...result, context: this._getContext() };
  }
}
