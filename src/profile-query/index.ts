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
  collectThreadNetwork,
  collectMarkerStack,
  collectMarkerInfo,
  collectProfileLogs,
} from './formatters/marker-info';
import { collectThreadPageLoad } from './formatters/page-load';
import { parseTimeValue } from './time-range-parser';
import { FilterStack, pushSpecTransforms } from './filter-stack';
import {
  getStackLineInfo,
  getLineTimings,
} from 'firefox-profiler/profile-logic/line-timings';
import {
  getStackAddressInfo,
  getAddressTimings,
} from 'firefox-profiler/profile-logic/address-timings';
import { fetchAssembly } from 'firefox-profiler/utils/fetch-assembly';
import { fetchSource } from 'firefox-profiler/utils/fetch-source';
import type { ExternalCommunicationDelegate } from 'firefox-profiler/utils/query-api';
import type {
  AddressProof,
  StartEndRange,
  ThreadIndex,
} from 'firefox-profiler/types';
import type {
  StatusResult,
  SessionContext,
  WithContext,
  FunctionExpandResult,
  FunctionInfoResult,
  FunctionAnnotateResult,
  AnnotateMode,
  FunctionSourceAnnotation,
  FunctionAsmAnnotation,
  ViewRangeResult,
  ThreadInfoResult,
  MarkerStackResult,
  MarkerInfoResult,
  ProfileInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  ThreadMarkersResult,
  ThreadNetworkResult,
  ThreadFunctionsResult,
  ThreadPageLoadResult,
  ProfileLogsResult,
  MarkerFilterOptions,
  FunctionFilterOptions,
  SampleFilterSpec,
  FilterStackResult,
} from './types';
import type { CallTreeCollectionOptions } from './formatters/call-tree';

import { getThreadsKey } from 'firefox-profiler/profile-logic/profile-data';
import type { Store } from '../types/store';

class NodeExternalCommunicationDelegate implements ExternalCommunicationDelegate {
  async fetchUrlResponse(url: string, postData?: string): Promise<Response> {
    const init: RequestInit =
      postData !== undefined ? { method: 'POST', body: postData } : {};
    return fetch(url, init);
  }

  async queryBrowserSymbolicationApi(
    _path: string,
    _requestJson: string
  ): Promise<string> {
    throw new Error('No browser connection available in profiler-cli');
  }

  async fetchJSSourceFromBrowser(_source: string): Promise<string> {
    throw new Error('No browser connection available in profiler-cli');
  }
}

const nodeDelegate = new NodeExternalCommunicationDelegate();

export class ProfileQuerier {
  _store: Store;
  _processIndexMap: Map<string, number>;
  _timestampManager: TimestampManager;
  _threadMap: ThreadMap;
  _markerMap: MarkerMap;
  _filterStack: FilterStack;
  _archiveCache: Map<string, Promise<Uint8Array>>;

  constructor(store: Store, rootRange: StartEndRange) {
    this._store = store;
    this._processIndexMap = new Map();
    this._timestampManager = new TimestampManager(rootRange);
    this._threadMap = new ThreadMap();
    this._filterStack = new FilterStack();
    this._archiveCache = new Map();

    // Build process index map
    const state = this._store.getState();
    const profile = getProfile(state);
    this._markerMap = new MarkerMap();
    const uniquePids = Array.from(new Set(profile.threads.map((t) => t.pid)));
    uniquePids.forEach((pid, index) => {
      this._processIndexMap.set(pid, index);
    });

    // Seed thread handles eagerly so they are available immediately after load.
    profile.threads.forEach((_, index) => {
      this._threadMap.handleForThreadIndex(index);
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

    // Warn if the requested range extends outside the profile bounds
    let warning: string | undefined;
    if (startTimestamp < rootRange.start || endTimestamp > rootRange.end) {
      const profileDuration = (rootRange.end - rootRange.start) / 1000;
      warning = `Range extends outside the profile duration (${profileDuration.toFixed(3)}s). Did you mean to use milliseconds? Use the "ms" suffix for milliseconds (e.g. 0ms,400ms).`;
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
      warning,
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
   * List completed network requests for a thread with timing phases.
   */
  async threadNetwork(
    threadHandle?: string,
    filterOptions?: {
      searchString?: string;
      minDuration?: number;
      maxDuration?: number;
      limit?: number;
    }
  ): Promise<WithContext<ThreadNetworkResult>> {
    const result = collectThreadNetwork(
      this._store,
      this._threadMap,
      threadHandle,
      filterOptions
    );
    return { ...result, context: this._getContext() };
  }

  /**
   * Summarize a page load: navigation timing, resource stats, CPU categories, and jank.
   */
  async threadPageLoad(
    threadHandle?: string,
    options?: { navigationIndex?: number; jankLimit?: number }
  ): Promise<WithContext<ThreadPageLoadResult>> {
    const result = collectThreadPageLoad(
      this._store,
      this._threadMap,
      this._timestampManager,
      this._markerMap,
      threadHandle,
      options
    );
    return { ...result, context: this._getContext() };
  }

  /**
   * Extract Log-type markers from the profile in MOZ_LOG format.
   * Iterates all threads by default; supports filtering by thread, module, level, search, and limit.
   */
  async profileLogs(
    filterOptions: {
      thread?: string;
      module?: string;
      level?: string;
      search?: string;
      limit?: number;
    } = {}
  ): Promise<WithContext<ProfileLogsResult>> {
    const result = collectProfileLogs(
      this._store,
      this._threadMap,
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

  /**
   * Annotate a function with per-line source or per-instruction assembly timing data.
   */
  async functionAnnotate(
    functionHandle: string,
    mode: AnnotateMode,
    symbolServerUrl: string,
    contextOption: string = '2'
  ): Promise<WithContext<FunctionAnnotateResult>> {
    const state = this._store.getState();
    const profile = getProfile(state);
    const { funcTable, stringArray, resourceTable } = profile.shared;

    const funcIndex = parseFunctionHandle(functionHandle, funcTable.length);
    const funcName = stringArray[funcTable.name[funcIndex]];
    const warnings: string[] = [];

    // Resolve library name for fullName
    const resourceIndex = funcTable.resource[funcIndex];
    let libraryName: string | undefined;
    if (resourceIndex !== -1) {
      const libIndex = resourceTable.lib[resourceIndex];
      if (
        libIndex !== null &&
        libIndex !== undefined &&
        libIndex >= 0 &&
        profile.libs
      ) {
        libraryName = profile.libs[libIndex].name;
      }
    }
    const fullName = libraryName ? `${libraryName}!${funcName}` : funcName;

    // Get selected thread + derived thread data (derived Thread has correct types for utilities)
    const threadIndexes = getSelectedThreadIndexes(state);
    const threadSelectors = getThreadSelectors(threadIndexes);
    const thread = threadSelectors.getFilteredThread(state);
    const {
      stackTable,
      frameTable,
      funcTable: threadFuncTable,
      nativeSymbols: threadNativeSymbols,
    } = thread;
    const samples = thread.samples;

    const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
    const threadHandle = this._threadMap.handleForThreadIndexes(threadIndexes);

    // Compute aggregate self/total for the header.
    // Build a boolean lookup: does frame i belong to funcIndex?
    const frameInFunc = new Uint8Array(frameTable.func.length);
    for (let fi = 0; fi < frameTable.func.length; fi++) {
      if (frameTable.func[fi] === funcIndex) {
        frameInFunc[fi] = 1;
      }
    }
    // Memoize bottom-up: does this stack contain any frame for funcIndex?
    // stackTable entries are in topological order (prefix always has lower index).
    const stackContainsFunc = new Int8Array(stackTable.length);
    for (let si = 0; si < stackTable.length; si++) {
      const frame = stackTable.frame[si];
      if (frameInFunc[frame]) {
        stackContainsFunc[si] = 1;
      } else {
        const prefix = stackTable.prefix[si];
        stackContainsFunc[si] =
          prefix !== null ? stackContainsFunc[prefix] : -1;
      }
    }

    let totalSelfSamples = 0;
    let totalTotalSamples = 0;
    for (let si = 0; si < samples.length; si++) {
      const stackIndex = samples.stack[si];
      if (stackIndex === null) {
        continue;
      }
      const weight = samples.weight ? samples.weight[si] : 1;
      if (stackContainsFunc[stackIndex] === 1) {
        totalTotalSamples += weight;
      }
      if (frameInFunc[stackTable.frame[stackIndex]]) {
        totalSelfSamples += weight;
      }
    }

    // Source annotation
    let srcAnnotation: FunctionSourceAnnotation | null = null;
    if (mode === 'src' || mode === 'all') {
      const sourceIndex = funcTable.source[funcIndex];
      if (sourceIndex !== null) {
        const filenameStrIndex = thread.sources.filename[sourceIndex];
        const filename = thread.stringTable.getString(filenameStrIndex);
        const sourceUuid = thread.sources.id[sourceIndex];

        // getStackLineInfo finds all frames belonging to this source file and
        // computes per-line hit sets. getLineTimings aggregates into self/total maps.
        const stackLineInfo = getStackLineInfo(
          stackTable,
          frameTable,
          threadFuncTable,
          sourceIndex
        );
        const { totalLineHits, selfLineHits } = getLineTimings(
          stackLineInfo,
          samples
        );

        // Count samples with/without line number information
        let samplesWithFunction = 0;
        let samplesWithLineInfo = 0;
        for (let si = 0; si < samples.length; si++) {
          const stackIndex = samples.stack[si];
          if (stackIndex === null) {
            continue;
          }
          const lineSetIndex =
            stackLineInfo.stackIndexToLineSetIndex[stackIndex];
          if (lineSetIndex === -1) {
            continue;
          }
          const weight = samples.weight ? samples.weight[si] : 1;
          samplesWithFunction += weight;
          if (stackLineInfo.lineSetTable.self[lineSetIndex] !== -1) {
            samplesWithLineInfo += weight;
          }
        }

        // Build an addressProof from any native symbol for this function.
        // This is used by fetchSource to query the /source/v1 API on local symbol servers.
        let addressProof: AddressProof | null = null;
        for (let fi = 0; fi < frameTable.func.length; fi++) {
          if (frameTable.func[fi] === funcIndex) {
            const ns = frameTable.nativeSymbol[fi];
            if (ns !== null) {
              const libIndex = threadNativeSymbols.libIndex[ns];
              const lib = profile.libs[libIndex];
              if (lib.debugName && lib.breakpadId) {
                addressProof = {
                  debugName: lib.debugName,
                  breakpadId: lib.breakpadId,
                  address: threadNativeSymbols.address[ns],
                };
              }
              break;
            }
          }
        }

        // Fetch source using the same path as the profiler UI:
        // tries /source/v1 on local symbol server, CORS download for Mercurial/crates.io, etc.
        let fileLines: string[] | null = null;
        let totalFileLines: number | null = null;
        const fetchResult = await fetchSource(
          filename,
          sourceUuid,
          symbolServerUrl,
          addressProof,
          this._archiveCache,
          nodeDelegate
        );
        if (fetchResult.type === 'SUCCESS') {
          fileLines = fetchResult.source.split('\n');
          totalFileLines = fileLines.length;
        } else {
          const errorMessages = fetchResult.errors
            .map((e) => JSON.stringify(e))
            .join('; ');
          warnings.push(
            `Could not fetch source for ${filename}: ${errorMessages}`
          );
        }

        // Determine which lines to show based on the context option
        const annotatedLineNums = new Set([
          ...totalLineHits.keys(),
          ...selfLineHits.keys(),
        ]);
        let linesToShow: Set<number>;
        let contextMode: string;

        if (contextOption === 'file') {
          // Show the whole file
          linesToShow = new Set<number>();
          const last = totalFileLines ?? Math.max(...annotatedLineNums);
          for (let ln = 1; ln <= last; ln++) {
            linesToShow.add(ln);
          }
          contextMode = 'full file';
        } else {
          // Treat as a number of context lines (default: 2)
          const parsed = parseInt(contextOption, 10);
          const CONTEXT = Math.max(0, isNaN(parsed) ? 2 : parsed);
          linesToShow = new Set<number>();
          for (const ln of annotatedLineNums) {
            for (
              let ctx = Math.max(1, ln - CONTEXT);
              ctx <= ln + CONTEXT;
              ctx++
            ) {
              linesToShow.add(ctx);
            }
          }
          contextMode =
            CONTEXT === 0
              ? 'annotated lines only'
              : `±${CONTEXT} lines context`;
        }

        const sortedLines = Array.from(linesToShow).sort((a, b) => a - b);
        srcAnnotation = {
          filename,
          totalFileLines,
          samplesWithFunction,
          samplesWithLineInfo,
          contextMode,
          lines: sortedLines.map((ln) => ({
            lineNumber: ln,
            selfSamples: selfLineHits.get(ln) ?? 0,
            totalSamples: totalLineHits.get(ln) ?? 0,
            sourceText: fileLines !== null ? (fileLines[ln - 1] ?? null) : null,
          })),
        };
      } else if (mode === 'src') {
        warnings.push(
          `Function ${functionHandle} has no source index. Use --mode asm for assembly view.`
        );
      }
    }

    // Assembly annotation
    const asmAnnotations: FunctionAsmAnnotation[] = [];
    if (mode === 'asm' || mode === 'all') {
      // Collect all native symbol indices for this funcIndex by scanning frames
      const nativeSymbolsForFunc = new Set<number>();
      for (let fi = 0; fi < frameTable.func.length; fi++) {
        if (frameTable.func[fi] === funcIndex) {
          const ns = frameTable.nativeSymbol[fi];
          if (ns !== null) {
            nativeSymbolsForFunc.add(ns);
          }
        }
      }

      if (nativeSymbolsForFunc.size === 0) {
        warnings.push(
          `Function ${functionHandle} has no native symbols — may be JS-only or not symbolicated.`
        );
      }

      const nativeSymbolCount = nativeSymbolsForFunc.size;
      let compilationIndex = 1;

      for (const nsIndex of nativeSymbolsForFunc) {
        const symbolName = thread.stringTable.getString(
          threadNativeSymbols.name[nsIndex]
        );
        const symbolAddress = threadNativeSymbols.address[nsIndex];
        const functionSize = threadNativeSymbols.functionSize[nsIndex] ?? null;
        const libIndex = threadNativeSymbols.libIndex[nsIndex];
        const lib = profile.libs[libIndex];

        // Compute per-address timings using the existing utilities
        const stackAddressInfo = getStackAddressInfo(
          stackTable,
          frameTable,
          threadFuncTable,
          nsIndex
        );
        const { totalAddressHits, selfAddressHits } = getAddressTimings(
          stackAddressInfo,
          samples
        );

        const nativeSymbolInfo = {
          name: symbolName,
          address: symbolAddress,
          functionSize: functionSize ?? 0,
          functionSizeIsKnown: functionSize !== null,
          libIndex,
        };

        let fetchError: string | null = null;
        let instructions: FunctionAsmAnnotation['instructions'] = [];

        try {
          const fetchResult = await fetchAssembly(
            nativeSymbolInfo,
            lib,
            symbolServerUrl,
            nodeDelegate
          );
          if (fetchResult.type === 'SUCCESS') {
            instructions = fetchResult.instructions.map((instr) => ({
              address: instr.address,
              selfSamples: selfAddressHits.get(instr.address) ?? 0,
              totalSamples: totalAddressHits.get(instr.address) ?? 0,
              decodedString: instr.decodedString,
            }));
          } else {
            fetchError = fetchResult.errors
              .map((e) => JSON.stringify(e))
              .join('; ');
            warnings.push(
              `Assembly fetch failed for ${symbolName}: ${fetchError}`
            );
          }
        } catch (e) {
          fetchError = e instanceof Error ? e.message : String(e);
          warnings.push(
            `Assembly fetch threw for ${symbolName}: ${fetchError}`
          );
        }

        asmAnnotations.push({
          compilationIndex,
          symbolName,
          symbolAddress,
          functionSize,
          nativeSymbolCount,
          fetchError,
          instructions,
        });
        compilationIndex++;
      }
    }

    const annotateResult: FunctionAnnotateResult = {
      type: 'function-annotate',
      functionHandle,
      funcIndex,
      name: funcName,
      fullName,
      threadHandle,
      friendlyThreadName,
      totalSelfSamples,
      totalTotalSamples,
      mode,
      srcAnnotation,
      asmAnnotations,
      warnings,
    };

    return { ...annotateResult, context: this._getContext() };
  }
}
