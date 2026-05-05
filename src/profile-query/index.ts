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
  getIncludeIdleSamples,
  getSelectedThreadIndexes,
  getTransformStack,
  getCurrentSearchString,
  getProfileSpecificState,
} from 'firefox-profiler/selectors/url-state';
import {
  commitRange,
  popCommittedRanges,
  changeSelectedThreads,
  changeCallTreeSearchString,
  changeIncludeIdleSamples,
  popTransformsFromStackForThreads,
} from '../actions/profile-view';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { TimestampManager } from './timestamps';
import { ThreadMap } from './thread-map';
import { parseFunctionHandle } from './function-map';
import { getLibForFunc } from './function-list';
import { MarkerMap } from './marker-map';
import { loadProfileFromFileOrUrl, type LoadOptions } from './loader';
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
import { describeTransformGroup, pushSpecTransforms } from './filter-stack';
import { functionAnnotate as computeFunctionAnnotate } from './function-annotate';
import type {
  StartEndRange,
  ThreadIndex,
  ThreadsKey,
} from 'firefox-profiler/types';
import type {
  StatusResult,
  SessionContext,
  WithContext,
  FunctionExpandResult,
  FunctionInfoResult,
  FunctionAnnotateResult,
  AnnotateMode,
  ViewRangeResult,
  ThreadSelectResult,
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
  FilterEntry,
} from './types';
import type { CallTreeCollectionOptions } from './formatters/call-tree';

import { getThreadsKey } from 'firefox-profiler/profile-logic/profile-data';
import type { Store } from '../types/store';

export class ProfileQuerier {
  _store: Store;
  _processIndexMap: Map<string, number>;
  _timestampManager: TimestampManager;
  _threadMap: ThreadMap;
  _markerMap: MarkerMap;
  _archiveCache: Map<string, Promise<Uint8Array>>;
  /**
   * Per-thread sizes of each filter "push group". One `filter push` adds one
   * entry whose value is the number of Redux transforms it dispatched (e.g.
   * `--merge f-1,f-2` -> 2). `filter pop N` removes N groups, popping the
   * matching count of Redux transforms. Transforms that were already in the
   * Redux stack when the querier was constructed (URL-loaded, etc.) are
   * seeded as individual size-1 groups so they remain poppable.
   *
   * FIXME: Add a MergeSet transform so multiple functions can be merged in a
   * single group entry rather than dispatching one transform per function.
   */
  _pushGroupSizes: Map<ThreadsKey, number[]>;

  constructor(store: Store, rootRange: StartEndRange) {
    this._store = store;
    this._processIndexMap = new Map();
    this._timestampManager = new TimestampManager(rootRange);
    this._threadMap = new ThreadMap();
    this._archiveCache = new Map();
    this._pushGroupSizes = new Map();

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

    // Seed push-group sizes from any transforms already in the Redux stack
    // (typically loaded from a profiler.firefox.com URL). Each such transform
    // becomes its own size-1 group so it remains individually poppable.
    const transformsPerThread = getProfileSpecificState(state).transforms;
    for (const [rawKey, stack] of Object.entries(transformsPerThread)) {
      if (stack.length === 0) {
        continue;
      }
      const threadsKey: ThreadsKey = /^-?\d+$/.test(rawKey)
        ? Number(rawKey)
        : rawKey;
      this._pushGroupSizes.set(
        threadsKey,
        Array.from({ length: stack.length }, () => 1)
      );
    }
  }

  /**
   * Ensure `_pushGroupSizes[threadsKey]` matches the Redux stack length by
   * prepending size-1 groups for any transforms we haven't accounted for.
   * Guards against external stack mutations between operations.
   */
  private _syncPushGroups(threadsKey: ThreadsKey): number[] {
    let groups = this._pushGroupSizes.get(threadsKey);
    if (groups === undefined) {
      groups = [];
      this._pushGroupSizes.set(threadsKey, groups);
    }
    const stackLength = getTransformStack(
      this._store.getState(),
      threadsKey
    ).length;
    const sum = groups.reduce((a, b) => a + b, 0);
    if (sum < stackLength) {
      for (let i = 0; i < stackLength - sum; i++) {
        groups.unshift(1);
      }
    }
    return groups;
  }

  static async load(
    filePathOrUrl: string,
    options: LoadOptions = {}
  ): Promise<ProfileQuerier> {
    const { store, rootRange } = await loadProfileFromFileOrUrl(
      filePathOrUrl,
      options
    );
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
    return this._runWithSampleFilters(
      threadHandle,
      includeIdle,
      search,
      sampleFilters,
      () => collectThreadSamples(this._store, this._threadMap, threadHandle)
    );
  }

  async threadSamplesTopDown(
    threadHandle?: string,
    callTreeOptions?: CallTreeCollectionOptions,
    includeIdle: boolean = false,
    search?: string,
    sampleFilters?: SampleFilterSpec[]
  ): Promise<WithContext<ThreadSamplesTopDownResult>> {
    return this._runWithSampleFilters(
      threadHandle,
      includeIdle,
      search,
      sampleFilters,
      () =>
        collectThreadSamplesTopDown(
          this._store,
          this._threadMap,
          threadHandle,
          callTreeOptions
        )
    );
  }

  async threadSamplesBottomUp(
    threadHandle?: string,
    callTreeOptions?: CallTreeCollectionOptions,
    includeIdle: boolean = false,
    search?: string,
    sampleFilters?: SampleFilterSpec[]
  ): Promise<WithContext<ThreadSamplesBottomUpResult>> {
    return this._runWithSampleFilters(
      threadHandle,
      includeIdle,
      search,
      sampleFilters,
      () =>
        collectThreadSamplesBottomUp(
          this._store,
          this._threadMap,
          threadHandle,
          callTreeOptions
        )
    );
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
      const rootRange = getProfileRootRange(state);
      const startName = this._timestampManager.nameForTimestamp(
        rootRange.start
      );
      const endName = this._timestampManager.nameForTimestamp(rootRange.end);
      return {
        type: 'view-range',
        action: 'pop',
        range: {
          start: rootRange.start,
          startName,
          end: rootRange.end,
          endName,
        },
        message: `Already at full profile view: ${startName} (${this._timestampManager.timestampString(rootRange.start)}) to ${endName} (${this._timestampManager.timestampString(rootRange.end)})`,
      };
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
  async threadSelect(
    threadHandle: string
  ): Promise<WithContext<ThreadSelectResult>> {
    const threadIndexes = this._threadMap.threadIndexesForHandle(threadHandle);

    // Change the selected threads in the Redux store
    this._store.dispatch(changeSelectedThreads(threadIndexes));

    const state = this._store.getState();
    const profile = getProfile(state);
    const threadNames = Array.from(threadIndexes).map(
      (idx) => profile.threads[idx].name
    );

    return {
      type: 'thread-select',
      threadHandle,
      threadNames,
      context: this._getContext(),
    };
  }

  /**
   * Map the current Redux transform stack for `threadsKey` to FilterEntry[],
   * grouping consecutive transforms that came from the same `filter push`
   * (each push is recorded as one size in _pushGroupSizes). Transforms not
   * accounted for by any group — e.g. URL-loaded ones encountered before the
   * group map was seeded — each become their own size-1 entry.
   */
  private _collectFilterEntries(threadsKey: ThreadsKey): FilterEntry[] {
    const stack = getTransformStack(this._store.getState(), threadsKey);
    const groups = this._syncPushGroups(threadsKey);
    const entries: FilterEntry[] = [];
    let offset = 0;
    for (const size of groups) {
      const transforms = stack.slice(offset, offset + size);
      if (transforms.length === 0) {
        break;
      }
      entries.push({
        index: entries.length + 1,
        transforms,
        description: describeTransformGroup(transforms),
      });
      offset += size;
    }
    return entries;
  }

  /**
   * Push the Redux transforms for a filter spec as one filter entry. `--merge
   * f-1,f-2` dispatches two Redux transforms but shows up — and pops — as a
   * single entry.
   */
  filterPush(spec: SampleFilterSpec, threadHandle?: string): FilterStackResult {
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const threadsKey = getThreadsKey(threadIndexes);
    const actualHandle =
      threadHandle ?? this._threadMap.handleForThreadIndexes(threadIndexes);

    const groups = this._syncPushGroups(threadsKey);
    const countBefore = getTransformStack(
      this._store.getState(),
      threadsKey
    ).length;
    pushSpecTransforms(this._store, threadsKey, spec);
    const countAfter = getTransformStack(
      this._store.getState(),
      threadsKey
    ).length;
    groups.push(countAfter - countBefore);
    const filters = this._collectFilterEntries(threadsKey);
    const pushed = filters[filters.length - 1];

    return {
      type: 'filter-stack',
      threadHandle: actualHandle,
      filters,
      action: 'push',
      message: `Pushed filter ${pushed.index}: ${pushed.description}`,
    };
  }

  /**
   * Pop the last `count` filter entries (default 1). Each entry is one
   * previous `filter push` — multi-transform pushes (e.g. `--merge f-1,f-2`)
   * undo as a single entry because that's how they were shown.
   */
  filterPop(count: number = 1, threadHandle?: string): FilterStackResult {
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const threadsKey = getThreadsKey(threadIndexes);
    const actualHandle =
      threadHandle ?? this._threadMap.handleForThreadIndexes(threadIndexes);

    const groups = this._syncPushGroups(threadsKey);
    const before = this._collectFilterEntries(threadsKey);
    const toPop = Math.max(0, Math.min(count, groups.length));
    let transformsToPop = 0;
    for (let i = 0; i < toPop; i++) {
      transformsToPop += groups.pop()!;
    }
    const beforeStackLength = getTransformStack(
      this._store.getState(),
      threadsKey
    ).length;
    if (transformsToPop > 0) {
      this._store.dispatch(
        popTransformsFromStackForThreads(
          threadsKey,
          beforeStackLength - transformsToPop
        )
      );
    }
    const filters = this._collectFilterEntries(threadsKey);
    const removed = before.slice(before.length - toPop).reverse();

    let message: string;
    if (toPop === 0) {
      message = 'No filters to pop';
    } else if (removed.length === 1) {
      message = `Popped filter: ${removed[0].description}`;
    } else {
      message = `Popped ${toPop} filters: ${removed.map((f) => f.description).join('; ')}`;
    }

    return {
      type: 'filter-stack',
      threadHandle: actualHandle,
      filters,
      action: 'pop',
      message,
    };
  }

  /**
   * Clear all transforms from the thread's transform stack.
   */
  filterClear(threadHandle?: string): FilterStackResult {
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const threadsKey = getThreadsKey(threadIndexes);
    const actualHandle =
      threadHandle ?? this._threadMap.handleForThreadIndexes(threadIndexes);

    const entryCount = this._syncPushGroups(threadsKey).length;
    this._pushGroupSizes.set(threadsKey, []);
    if (entryCount > 0) {
      this._store.dispatch(popTransformsFromStackForThreads(threadsKey, 0));
    }

    return {
      type: 'filter-stack',
      threadHandle: actualHandle,
      filters: [],
      action: 'clear',
      message:
        entryCount === 0
          ? 'No filters to clear'
          : `Cleared ${entryCount} filter(s)`,
    };
  }

  /**
   * List the thread's full Redux transform stack as filter entries.
   */
  filterList(threadHandle?: string): FilterStackResult {
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const threadsKey = getThreadsKey(threadIndexes);
    const actualHandle =
      threadHandle ?? this._threadMap.handleForThreadIndexes(threadIndexes);

    return {
      type: 'filter-stack',
      threadHandle: actualHandle,
      filters: this._collectFilterEntries(threadsKey),
    };
  }

  /**
   * Resolve thread indexes, apply idle/search/ephemeral-filter wrappers, collect,
   * and attach common metadata. Shared by threadSamples, threadSamplesTopDown,
   * and threadSamplesBottomUp.
   */
  private _runWithSampleFilters<T>(
    threadHandle: string | undefined,
    includeIdle: boolean,
    search: string | undefined,
    sampleFilters: SampleFilterSpec[] | undefined,
    collect: () => T
  ): WithContext<
    T & {
      activeOnly: boolean;
      search?: string;
      activeFilters?: FilterEntry[];
      ephemeralFilters?: SampleFilterSpec[];
    }
  > {
    const activeOnly = !includeIdle;
    const threadIndexes =
      threadHandle !== undefined
        ? this._threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(this._store.getState());
    const withIdle = includeIdle
      ? () => this._withIncludedIdle(collect)
      : collect;
    const withSearch = search
      ? () => this._withCallTreeSearch(search, withIdle)
      : withIdle;
    const result =
      sampleFilters && sampleFilters.length > 0
        ? this._withEphemeralFilters(threadIndexes, sampleFilters, withSearch)
        : withSearch();
    const activeFilters = this._collectFilterEntries(
      getThreadsKey(threadIndexes)
    );
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

    try {
      for (const spec of filters) {
        pushSpecTransforms(this._store, threadsKey, spec);
      }
      return fn();
    } finally {
      this._store.dispatch(
        popTransformsFromStackForThreads(threadsKey, stackLengthBefore)
      );
    }
  }

  /**
   * Turn on the "include idle samples" toggle around a computation, then
   * restore the previous value. Used for the --include-idle slow path; the
   * default CLI state already excludes idle, so no-wrap is the fast path.
   */
  private _withIncludedIdle<T>(fn: () => T): T {
    const previous = getIncludeIdleSamples(this._store.getState());
    if (previous) {
      return fn();
    }
    this._store.dispatch(changeIncludeIdleSamples(true));
    try {
      return fn();
    } finally {
      this._store.dispatch(changeIncludeIdleSamples(previous));
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

  private _buildBaseStatus(state: ReturnType<Store['getState']>) {
    const profile = getProfile(state);
    const rootRange = getProfileRootRange(state);
    const committedRanges = getAllCommittedRanges(state);
    const selectedThreadIndexes = getSelectedThreadIndexes(state);

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

    const zeroAt = rootRange.start;
    const viewRanges = committedRanges.map((range) => {
      const absoluteStart = range.start + zeroAt;
      const absoluteEnd = range.end + zeroAt;
      return {
        start: absoluteStart,
        startName: this._timestampManager.nameForTimestamp(absoluteStart),
        end: absoluteEnd,
        endName: this._timestampManager.nameForTimestamp(absoluteEnd),
      };
    });

    return {
      selectedThreadHandle,
      selectedThreads,
      viewRanges,
      rootRange: { start: rootRange.start, end: rootRange.end },
    };
  }

  /**
   * Get current session context for display in command outputs.
   * This is a lightweight version of getStatus() that includes only
   * the current view range (not the full stack).
   */
  private _getContext(): SessionContext {
    const state = this._store.getState();
    const { selectedThreadHandle, selectedThreads, viewRanges, rootRange } =
      this._buildBaseStatus(state);
    const currentViewRange =
      viewRanges.length > 0 ? viewRanges[viewRanges.length - 1] : null;
    return {
      selectedThreadHandle,
      selectedThreads,
      currentViewRange,
      rootRange,
    };
  }

  /**
   * Get current session status including selected threads and view ranges.
   */
  async getStatus(): Promise<StatusResult> {
    const state = this._store.getState();
    const { selectedThreadHandle, selectedThreads, viewRanges, rootRange } =
      this._buildBaseStatus(state);

    // Collect active filter stacks: every thread with a non-empty Redux
    // transform stack, whether pushed via the CLI or loaded from the URL.
    const transformsPerThread = getProfileSpecificState(state).transforms;
    const filterStacks = Object.entries(transformsPerThread)
      .filter(([, stack]) => stack.length > 0)
      .map(([rawKey]) => {
        // ThreadsKey is number | string; JSON-ish keys come back as strings.
        const threadsKey: ThreadsKey = /^-?\d+$/.test(rawKey)
          ? Number(rawKey)
          : rawKey;
        return {
          threadsKey,
          threadHandle: this._threadMap.handleForKey(threadsKey),
          filters: this._collectFilterEntries(threadsKey),
        };
      });

    return {
      type: 'status',
      selectedThreadHandle,
      selectedThreads,
      viewRanges,
      rootRange,
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
    const library = getLibForFunc(
      funcIndex,
      funcTable,
      resourceTable,
      profile.libs
    )?.name;
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

    if (resourceIndex !== -1) {
      resource = {
        name: stringArray[resourceTable.name[resourceIndex]],
        index: resourceIndex,
      };
    }

    const lib = getLibForFunc(
      funcIndex,
      funcTable,
      resourceTable,
      profile.libs
    );
    if (lib) {
      library = {
        name: lib.name,
        path: lib.path,
        debugName: lib.debugName,
        debugPath: lib.debugPath,
        breakpadId: lib.breakpadId,
      };
    }

    const fullName = lib ? `${lib.name}!${funcName}` : funcName;

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
    const withIdle = includeIdle
      ? () => this._withIncludedIdle(collect)
      : collect;
    const result =
      sampleFilters && sampleFilters.length > 0
        ? this._withEphemeralFilters(threadIndexes, sampleFilters, withIdle)
        : withIdle();
    const activeFilters = this._collectFilterEntries(
      getThreadsKey(threadIndexes)
    );
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
    const result = await computeFunctionAnnotate(
      this._store,
      this._threadMap,
      this._archiveCache,
      functionHandle,
      mode,
      symbolServerUrl,
      contextOption
    );
    return { ...result, context: this._getContext() };
  }
}
