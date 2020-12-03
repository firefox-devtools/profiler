/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import memoize from 'memoize-immutable';
import MixedTupleMap from 'mixedtuplemap';
import * as Transforms from '../../profile-logic/transforms';
import * as UrlState from '../url-state';
import * as ProfileData from '../../profile-logic/profile-data';
import * as ProfileSelectors from '../profile';
import * as JsTracer from '../../profile-logic/js-tracer';

import type {
  Thread,
  ThreadIndex,
  JsTracerTable,
  SamplesTable,
  NativeAllocationsTable,
  Selector,
  ThreadViewOptions,
  TransformStack,
  JsTracerTiming,
  $ReturnType,
  StartEndRange,
  WeightType,
  EventDelayInfo,
  ThreadsKey,
} from 'firefox-profiler/types';

import type { UniqueStringArray } from '../../utils/unique-string-array';
import { ensureExists, getFirstItemFromSet } from '../../utils/flow';
import { mergeThreads } from '../../profile-logic/merge-compare';
import { defaultThreadViewOptions } from '../../reducers/profile-view';

/**
 * Infer the return type from the getThreadSelectorsPerThread function. This
 * is done that so that the local type definition with `Selector<T>` is the canonical
 * definition for the type of the selector.
 */
export type ThreadSelectorsPerThread = $ReturnType<
  typeof getThreadSelectorsPerThread
>;

/**
 * Create the selectors for a thread that have to do with an entire thread. This includes
 * the general filtering pipeline for threads.
 */
export function getThreadSelectorsPerThread(
  threadIndexes: Set<ThreadIndex>,
  threadsKey: ThreadsKey
) {
  const getMergedThread: Selector<Thread> = createSelector(
    ProfileSelectors.getProfile,
    profile =>
      mergeThreads(
        [...threadIndexes].map(threadIndex => profile.threads[threadIndex])
      )
  );
  /**
   * Either return the raw thread from the profile, or merge several raw threads
   * together.
   */
  const getThread: Selector<Thread> = state =>
    threadIndexes.size === 1
      ? ProfileSelectors.getProfile(state).threads[
          ensureExists(getFirstItemFromSet(threadIndexes))
        ]
      : getMergedThread(state);
  const getStringTable: Selector<UniqueStringArray> = state =>
    getThread(state).stringTable;
  const getSamplesTable: Selector<SamplesTable> = state =>
    getThread(state).samples;
  const getNativeAllocations: Selector<NativeAllocationsTable | void> = state =>
    getThread(state).nativeAllocations;
  const getThreadRange: Selector<StartEndRange> = state =>
    // This function is already memoized in profile-data.js, so we don't need to
    // memoize it here with `createSelector`.
    ProfileData.getTimeRangeForThread(
      getThread(state),
      ProfileSelectors.getProfileInterval(state)
    );

  /**
   * This selector gets the weight type from the thread.samples table, but
   * does not get it for others like the Native Allocations table. The call
   * tree uses the getWeightTypeForCallTree selector.
   */
  const getSamplesWeightType: Selector<WeightType> = state =>
    getSamplesTable(state).weightType || 'samples';

  /**
   * The first per-thread selectors filter out and transform a thread based on user's
   * interactions. The transforms are order dependendent.
   *
   * 1. Unfiltered getThread - The first selector gets the unmodified original thread.
   * 2. Tab - New samples table with only samples that belongs to the active tab.
   * 3. Range - New samples table with only samples in the committed range.
   * 4. Transform - Apply the transform stack that modifies the stacks and samples.
   * 5. Implementation - Modify stacks and samples to only show a single implementation.
   * 6. Search - Exclude samples that don't include some text in the stack.
   * 7. Preview - Only include samples that are within a user's preview range selection.
   */

  const getTabFilteredThread: Selector<Thread> = createSelector(
    getThread,
    ProfileSelectors.getRelevantInnerWindowIDsForCurrentTab,
    (thread, relevantPages) => {
      if (relevantPages.size === 0) {
        // If this set doesn't have any relevant page, just return the whole thread.
        return thread;
      }
      return ProfileData.filterThreadByTab(thread, relevantPages);
    }
  );

  /**
   * Similar to getTabFilteredThread, but this selector returns the active tab
   * filtered thread even though we are not in the active tab view at the moment.
   * This selector is needed to make the hidden track calculations during profile
   * load time(during viewProfile).
   */
  const getActiveTabFilteredThread: Selector<Thread> = createSelector(
    getThread,
    ProfileSelectors.getRelevantInnerWindowIDsForActiveTab,
    (thread, relevantPages) => {
      if (relevantPages.size === 0) {
        // If this set doesn't have any relevant page, just return the whole thread.
        return thread;
      }
      return ProfileData.filterThreadByTab(thread, relevantPages);
    }
  );

  const getRangeFilteredThread: Selector<Thread> = createSelector(
    getTabFilteredThread,
    ProfileSelectors.getCommittedRange,
    (thread, range) => {
      const { start, end } = range;
      return ProfileData.filterThreadSamplesToRange(thread, start, end);
    }
  );

  // It becomes very expensive to apply each transform over and over again as they
  // typically take around 100ms to run per transform on a fast machine. Memoize
  // memoize each step individually so that they transform stack can be pushed and
  // popped frequently and easily.
  const _applyTransformMemoized = memoize(Transforms.applyTransform, {
    cache: new MixedTupleMap(),
  });

  const getTransformStack: Selector<TransformStack> = state =>
    UrlState.getTransformStack(state, threadsKey);

  const getRangeAndTransformFilteredThread: Selector<Thread> = createSelector(
    getRangeFilteredThread,
    getTransformStack,
    ProfileSelectors.getDefaultCategory,
    (startingThread, transforms, defaultCategory) =>
      transforms.reduce(
        // Apply the reducer using an arrow function to ensure correct memoization.
        (thread, transform) =>
          _applyTransformMemoized(thread, transform, defaultCategory),
        startingThread
      )
  );

  const _getImplementationFilteredThread: Selector<Thread> = createSelector(
    getRangeAndTransformFilteredThread,
    UrlState.getImplementationFilter,
    ProfileSelectors.getDefaultCategory,
    ProfileData.filterThreadByImplementation
  );

  const _getImplementationAndSearchFilteredThread: Selector<Thread> = createSelector(
    _getImplementationFilteredThread,
    UrlState.getSearchStrings,
    (thread, searchStrings) => {
      return ProfileData.filterThreadToSearchStrings(thread, searchStrings);
    }
  );

  const getFilteredThread: Selector<Thread> = createSelector(
    _getImplementationAndSearchFilteredThread,
    UrlState.getInvertCallstack,
    ProfileSelectors.getDefaultCategory,
    (thread, shouldInvertCallstack, defaultCategory) => {
      return shouldInvertCallstack
        ? ProfileData.invertCallstack(thread, defaultCategory)
        : thread;
    }
  );

  const getPreviewFilteredThread: Selector<Thread> = createSelector(
    getFilteredThread,
    ProfileSelectors.getPreviewSelection,
    (thread, previewSelection): Thread => {
      if (!previewSelection.hasSelection) {
        return thread;
      }
      const { selectionStart, selectionEnd } = previewSelection;
      return ProfileData.filterThreadSamplesToRange(
        thread,
        selectionStart,
        selectionEnd
      );
    }
  );

  /**
   * This selector returns the offset to add to a sampleIndex when accessing the
   * base thread, if your thread is a range filtered thread (all but the base
   * `getThread` or the last `getPreviewFilteredThread`).
   */
  const getSampleIndexOffsetFromCommittedRange: Selector<number> = createSelector(
    getThread,
    ProfileSelectors.getCommittedRange,
    ({ samples }, { start, end }) => {
      const [beginSampleIndex] = ProfileData.getSampleIndexRangeForSelection(
        samples,
        start,
        end
      );
      return beginSampleIndex;
    }
  );

  /**
   * This selector returns the offset to add to a sampleIndex when accessing the
   * base thread, if your thread is the preview filtered thread.
   */
  const getSampleIndexOffsetFromPreviewRange: Selector<number> = createSelector(
    getFilteredThread,
    ProfileSelectors.getPreviewSelection,
    getSampleIndexOffsetFromCommittedRange,
    ({ samples }, previewSelection, sampleIndexFromCommittedRange) => {
      if (!previewSelection.hasSelection) {
        return sampleIndexFromCommittedRange;
      }

      const [beginSampleIndex] = ProfileData.getSampleIndexRangeForSelection(
        samples,
        previewSelection.selectionStart,
        previewSelection.selectionEnd
      );

      return sampleIndexFromCommittedRange + beginSampleIndex;
    }
  );

  const getFriendlyThreadName: Selector<string> = createSelector(
    ProfileSelectors.getThreads,
    getThread,
    ProfileData.getFriendlyThreadName
  );

  const getThreadProcessDetails: Selector<string> = createSelector(
    getThread,
    ProfileData.getThreadProcessDetails
  );

  const getTransformLabels: Selector<string[]> = createSelector(
    getRangeAndTransformFilteredThread,
    getFriendlyThreadName,
    getTransformStack,
    Transforms.getTransformLabels
  );

  const getViewOptions: Selector<ThreadViewOptions> = state =>
    ProfileSelectors.getProfileViewOptions(state).perThread[threadsKey] ||
    defaultThreadViewOptions;

  /**
   * Check to see if there are any JS allocations for this thread. This way we
   * can display a custom thread.
   */
  const getHasJsAllocations: Selector<boolean> = state =>
    Boolean(getThread(state).jsAllocations);

  /**
   * Check to see if there are any JS allocations for this thread. This way we
   * can display a custom thread.
   */
  const getHasNativeAllocations: Selector<boolean> = state =>
    Boolean(getThread(state).nativeAllocations);

  /**
   * We can only compute the retained memory in the versions of the native allocations
   * format that provide the memory address. The earlier versions did not have
   * balanced allocations and deallocations.
   */
  const getCanShowRetainedMemory: Selector<boolean> = state => {
    const nativeAllocations = getNativeAllocations(state);
    if (!nativeAllocations) {
      return false;
    }
    return 'memoryAddress' in nativeAllocations;
  };

  /**
   * The JS tracer selectors are placed in the thread selectors since there are
   * not many of them. If this section grows, then consider breaking them out
   * into their own file.
   */
  const getJsTracerTable: Selector<JsTracerTable | null> = state =>
    getThread(state).jsTracer || null;

  /**
   * This selector can be very slow, so care should be taken when running it to provide
   * a helpful loading message for the user. Provide separate selectors for the stack
   * based timing, and the leaf timing, so that they memoize nicely.
   */
  const getExpensiveJsTracerTiming: Selector<
    JsTracerTiming[] | null
  > = createSelector(getJsTracerTable, getThread, (jsTracerTable, thread) =>
    jsTracerTable === null
      ? null
      : JsTracer.getJsTracerTiming(jsTracerTable, thread)
  );

  /**
   * This selector can be very slow, so care should be taken when running it to provide
   * a helpful loading message for the user. Provide separate selectors for the stack
   * based timing, and the leaf timing, so that they memoize nicely.
   */
  const getExpensiveJsTracerLeafTiming: Selector<
    JsTracerTiming[] | null
  > = createSelector(
    getJsTracerTable,
    getStringTable,
    (jsTracerTable, stringTable) =>
      jsTracerTable === null
        ? null
        : JsTracer.getJsTracerLeafTiming(jsTracerTable, stringTable)
  );

  const getProcessedEventDelaysOrNull: Selector<EventDelayInfo | null> = createSelector(
    getSamplesTable,
    ProfileSelectors.getProfileInterval,
    (samplesTable, interval) =>
      samplesTable === null || samplesTable.eventDelay === undefined
        ? null
        : ProfileData.processEventDelays(samplesTable, interval)
  );

  const getProcessedEventDelays: Selector<EventDelayInfo> = state =>
    ensureExists(
      getProcessedEventDelaysOrNull(state),
      'Could not get the processed event delays'
    );

  return {
    getThread,
    getStringTable,
    getSamplesTable,
    getSamplesWeightType,
    getNativeAllocations,
    getThreadRange,
    getFilteredThread,
    getRangeFilteredThread,
    getRangeAndTransformFilteredThread,
    getPreviewFilteredThread,
    getSampleIndexOffsetFromCommittedRange,
    getSampleIndexOffsetFromPreviewRange,
    getFriendlyThreadName,
    getThreadProcessDetails,
    getTransformLabels,
    getTransformStack,
    getViewOptions,
    getJsTracerTable,
    getExpensiveJsTracerTiming,
    getExpensiveJsTracerLeafTiming,
    getHasJsAllocations,
    getHasNativeAllocations,
    getCanShowRetainedMemory,
    getTabFilteredThread,
    getActiveTabFilteredThread,
    getProcessedEventDelays,
  };
}
