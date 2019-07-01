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
  StartEndSampleRange,
  IndexIntoSamplesTable,
} from '../../types/profile';
import type { Selector } from '../../types/store';
import type { ThreadViewOptions } from '../../types/state';
import type { TransformStack } from '../../types/transforms';
import type { UniqueStringArray } from '../../utils/unique-string-array';
import type { JsTracerTiming } from '../../types/profile-derived';
import type { $ReturnType } from '../../types/utils';
import type { Milliseconds } from '../../types/units';

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
export function getThreadSelectorsPerThread(threadIndex: ThreadIndex): * {
  const getThread: Selector<Thread> = state =>
    ProfileSelectors.getProfile(state).threads[threadIndex];
  const getStringTable: Selector<UniqueStringArray> = state =>
    getThread(state).stringTable;
  const getSamplesTable: Selector<SamplesTable> = state =>
    getThread(state).samples;

  const getCommittedSampleRange: Selector<StartEndSampleRange> = createSelector(
    getThread,
    ProfileSelectors.getCommittedRange,
    ({ samples }, { start, end }) =>
      ProfileData.getSampleIndexRangeForSelection(samples, start, end)
  );

  /**
   * The first per-thread selectors filter out and transform a thread based on user's
   * interactions. The transforms are order dependendent.
   *
   * 1. Unfiltered getThread - The first selector gets the unmodified original thread.
   * 2. Range - New samples table with only samples in the committed range.
   * 3. Transform - Apply the transform stack that modifies the stacks and samples.
   * 4. Implementation - Modify stacks and samples to only show a single implementation.
   * 5. Search - Exclude samples that don't include some text in the stack.
   * 6. Preview - Only include samples that are within a user's preview range selection.
   */
  const getRangeFilteredThread: Selector<Thread> = createSelector(
    getThread,
    getCommittedSampleRange,
    (thread, { sampleStart, sampleEnd }) =>
      ProfileData.filterThreadSamplesToRange(thread, sampleStart, sampleEnd)
  );

  // It becomes very expensive to apply each transform over and over again as they
  // typically take around 100ms to run per transform on a fast machine. Memoize
  // memoize each step individually so that they transform stack can be pushed and
  // popped frequently and easily.
  const _applyTransformMemoized = memoize(Transforms.applyTransform, {
    cache: new MixedTupleMap(),
  });

  const getTransformStack: Selector<TransformStack> = state =>
    UrlState.getTransformStack(state, threadIndex);

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

  const getPreviewSelectionSampleRange: Selector<StartEndSampleRange | null> = createSelector(
    getFilteredThread,
    ProfileSelectors.getPreviewSelection,
    ({ samples }, previewSelection) => {
      if (!previewSelection.hasSelection) {
        return null;
      }

      return ProfileData.getSampleIndexRangeForSelection(
        samples,
        previewSelection.selectionStart,
        previewSelection.selectionEnd
      );
    }
  );

  const getPreviewFilteredThread: Selector<Thread> = createSelector(
    getFilteredThread,
    getPreviewSelectionSampleRange,
    (thread, previewSelectionSampleRange): Thread => {
      if (!previewSelectionSampleRange) {
        return thread;
      }
      const { sampleStart, sampleEnd } = previewSelectionSampleRange;
      return ProfileData.filterThreadSamplesToRange(
        thread,
        sampleStart,
        sampleEnd
      );
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
    ProfileSelectors.getProfileViewOptions(state).perThread[threadIndex];

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
  > = createSelector(
    getJsTracerTable,
    getStringTable,
    (jsTracerTable, stringTable) =>
      jsTracerTable === null
        ? null
        : JsTracer.getJsTracerTiming(jsTracerTable, stringTable)
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

  const getSampleDurationGetter: Selector<
    (IndexIntoSamplesTable) => Milliseconds
  > = createSelector(
    getSamplesTable,
    ProfileSelectors.getProfileInterval,
    ProfileData.getSampleDurationGetter
  );

  return {
    getThread,
    getStringTable,
    getSamplesTable,
    getFilteredThread,
    getRangeFilteredThread,
    getRangeAndTransformFilteredThread,
    getPreviewFilteredThread,
    getFriendlyThreadName,
    getThreadProcessDetails,
    getTransformLabels,
    getTransformStack,
    getViewOptions,
    getJsTracerTable,
    getExpensiveJsTracerTiming,
    getExpensiveJsTracerLeafTiming,
    getSampleDurationGetter,
  };
}
