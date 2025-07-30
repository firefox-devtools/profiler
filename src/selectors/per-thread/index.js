/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { createSelector } from 'reselect';
import memoize from 'memoize-immutable';
import * as UrlState from '../url-state';
import * as ProfileData from '../../profile-logic/profile-data';
import {
  getThreadSelectorsWithMarkersPerThread,
  getBasicThreadSelectorsPerThread,
  type ThreadSelectorsPerThread,
} from './thread';
import {
  getMarkerSelectorsPerThread,
  type MarkerSelectorsPerThread,
} from './markers';
import {
  getStackAndSampleSelectorsPerThread,
  type StackAndSampleSelectorsPerThread,
} from './stack-sample';
import {
  getComposedSelectorsPerThread,
  type ComposedSelectorsPerThread,
} from './composed';
import {
  getStackLineInfoForCallNode,
  getLineTimings,
} from '../../profile-logic/line-timings';
import {
  getStackAddressInfoForCallNode,
  getAddressTimings,
} from '../../profile-logic/address-timings';
import * as ProfileSelectors from '../profile';
import { ensureExists, getFirstItemFromSet } from '../../utils/flow';

import type {
  Thread,
  ThreadIndex,
  Selector,
  ThreadsKey,
  StackLineInfo,
  LineTimings,
  StackAddressInfo,
  AddressTimings,
} from 'firefox-profiler/types';

import type { TimingsForPath } from '../../profile-logic/profile-data';

/**
 * Traditional selectors only take one parameter, the `State` object. The selectors
 * memoize based off of the `State` of the last call. If a ThreadIndex parameter were
 * passed in, the memoization would break as the ThreadIndex would change many times
 * across a single render call. Instead for ThreadSelectors, duplicate the selector
 * functions once per thread in the profile, so each memoizes separately.
 */
export type ThreadSelectors = {|
  ...ThreadSelectorsPerThread,
  ...MarkerSelectorsPerThread,
  ...StackAndSampleSelectorsPerThread,
  ...ComposedSelectorsPerThread,
|};

/**
 * This is the static object store that holds the selector functions.
 */
const _threadSelectorsCache: { [number]: ThreadSelectors } = {};
const _mergedThreadSelectorsMemoized = memoize(
  (threadsKey: ThreadsKey) => {
    // We don't pass this set inside this memoization function since we create
    // an intermediate Set whenever we need to access the cache. Memoize should
    // only use threadsKey as the key.
    const threadIndexes = new Set(('' + threadsKey).split(',').map((n) => +n));
    return _buildThreadSelectors(threadIndexes, threadsKey);
  },
  { limit: 5 }
);

const getSingleThreadSelectors = (
  threadIndex: ThreadIndex
): ThreadSelectors => {
  if (threadIndex in _threadSelectorsCache) {
    return _threadSelectorsCache[threadIndex];
  }

  const threadIndexes = new Set([threadIndex]);
  const selectors = _buildThreadSelectors(threadIndexes);
  _threadSelectorsCache[threadIndex] = selectors;
  return selectors;
};

/**
 * This function does the work of building out the selectors for a given thread index.
 * See the respective definitions in the functions getXXXXXSelectorsPerThread for
 * what they specifically include.
 */
export const getThreadSelectors = (
  oneOrManyThreadIndexes: ThreadIndex | Set<ThreadIndex>
): ThreadSelectors => {
  let threadIndex: null | ThreadIndex = null;
  let threadIndexes: null | Set<ThreadIndex> = null;

  if (typeof oneOrManyThreadIndexes === 'number') {
    threadIndex = oneOrManyThreadIndexes;
  } else {
    threadIndexes = oneOrManyThreadIndexes;
  }

  // The thread selectors have two different caching strategies. For a single thread
  // index, we will retain the cache forever. For a Set of more than one thread indexes
  // we will only memoize the last used Set. Most likely, users will add on to a
  // selection until they have the desired set of Threads. It would be very memory
  // intensive to retain this set of selectors forever, as it can change frequently
  // and with various different values.
  if (threadIndex !== null) {
    return getSingleThreadSelectors(threadIndex);
  }

  // This must be true with the logic above.
  threadIndexes = ensureExists(threadIndexes);

  return getThreadSelectorsFromThreadsKey(
    ProfileData.getThreadsKey(threadIndexes),
    threadIndexes
  );
};

/**
 * This function returns the selectors for a group of threads, based on the ThreadsKey.
 * It only memoizes off of a single ThreadsKey. If that key changes, the caching will
 * be invalidated, and a new set of selectors will be generated. This is because
 * thread selections are fairly dynamic, and we don't want to retain too many
 * extraneous results.
 */
export const getThreadSelectorsFromThreadsKey = (
  threadsKey: ThreadsKey,
  threadIndexes: Set<ThreadIndex> = new Set(
    ('' + threadsKey).split(',').map((n) => +n)
  )
): ThreadSelectors => {
  if (threadIndexes.size === 1) {
    // We should get the single thread and use its caching mechanism.
    // We know this value exists because of the size check, even if Flow doesn't.
    return getSingleThreadSelectors(
      ensureExists(getFirstItemFromSet(threadIndexes))
    );
  }

  return _mergedThreadSelectorsMemoized(threadsKey);
};

function _buildThreadSelectors(
  threadIndexes: Set<ThreadIndex>,
  threadsKey: ThreadsKey = ProfileData.getThreadsKey(threadIndexes)
) {
  // We define the thread selectors in 5 steps to ensure clarity in the
  // separate files.
  // 1. The basic thread selectors.
  let selectors = getBasicThreadSelectorsPerThread(threadIndexes, threadsKey);
  // 2. The marker selectors.
  selectors = {
    ...selectors,
    ...getMarkerSelectorsPerThread(selectors, threadIndexes, threadsKey),
  };
  // 3. The thread selectors that need marker selectors.
  selectors = {
    ...selectors,
    ...getThreadSelectorsWithMarkersPerThread(
      selectors,
      threadIndexes,
      threadsKey
    ),
  };
  // 4. Stack, sample selectors that need the previous selectors for their
  // own definition.
  selectors = {
    ...selectors,
    ...getStackAndSampleSelectorsPerThread(
      selectors,
      threadIndexes,
      threadsKey
    ),
  };
  // 5. Other selectors that need selectors from different files to be defined.
  selectors = {
    ...selectors,
    ...getComposedSelectorsPerThread(selectors),
  };
  return selectors;
}

/**
 * Most of the time, we only want to work with the selected thread. This object
 * collects the selectors for the currently selected thread.
 */
export const selectedThreadSelectors: ThreadSelectors = (() => {
  const anyThreadSelectors: ThreadSelectors = getThreadSelectors(0);
  const result: $Shape<ThreadSelectors> = {};
  for (const key in anyThreadSelectors) {
    result[key] = (state) =>
      getThreadSelectors(UrlState.getSelectedThreadIndexes(state))[key](state);
  }
  const result2: ThreadSelectors = (result: any);
  return result2;
})();

export type NodeSelectors = {|
  +getName: Selector<string>,
  +getIsJS: Selector<boolean>,
  +getLib: Selector<string>,
  +getTimingsForSidebar: Selector<TimingsForPath>,
  +getSourceViewStackLineInfo: Selector<StackLineInfo | null>,
  +getSourceViewLineTimings: Selector<LineTimings>,
  +getAssemblyViewStackAddressInfo: Selector<StackAddressInfo | null>,
  +getAssemblyViewAddressTimings: Selector<AddressTimings>,
|};

export const selectedNodeSelectors: NodeSelectors = (() => {
  const getName: Selector<string> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable }) => {
      if (!selectedPath.length) {
        return '';
      }

      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      return stringTable.getString(funcTable.name[funcIndex]);
    }
  );

  const getIsJS: Selector<boolean> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { funcTable }) => {
      if (!selectedPath.length) {
        return false;
      }

      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      return funcTable.isJS[funcIndex];
    }
  );

  const getLib: Selector<string> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable, resourceTable }) => {
      if (!selectedPath.length) {
        return '';
      }

      return ProfileData.getOriginAnnotationForFunc(
        ProfileData.getLeafFuncIndex(selectedPath),
        funcTable,
        resourceTable,
        stringTable
      );
    }
  );

  const getTimingsForSidebar: Selector<TimingsForPath> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getCallNodeInfo,
    ProfileSelectors.getProfileInterval,
    selectedThreadSelectors.getThread,
    selectedThreadSelectors.getPreviewFilteredCtssSampleIndexOffset,
    ProfileSelectors.getCategories,
    selectedThreadSelectors.getPreviewFilteredCtssSamples,
    selectedThreadSelectors.getUnfilteredCtssSamples,
    ProfileData.getTimingsForPath
  );

  const getSourceViewStackLineInfo: Selector<StackLineInfo | null> =
    createSelector(
      selectedThreadSelectors.getFilteredThread,
      UrlState.getSourceViewFile,
      selectedThreadSelectors.getCallNodeInfo,
      selectedThreadSelectors.getSelectedCallNodeIndex,
      (
        { stackTable, frameTable, funcTable, stringTable }: Thread,
        sourceViewFile,
        callNodeInfo,
        selectedCallNodeIndex
      ): StackLineInfo | null => {
        if (sourceViewFile === null || selectedCallNodeIndex === null) {
          return null;
        }
        const selectedFunc = callNodeInfo.funcForNode(selectedCallNodeIndex);
        const selectedFuncFile = funcTable.fileName[selectedFunc];
        if (
          selectedFuncFile === null ||
          stringTable.getString(selectedFuncFile) !== sourceViewFile
        ) {
          return null;
        }
        return getStackLineInfoForCallNode(
          stackTable,
          frameTable,
          selectedCallNodeIndex,
          callNodeInfo
        );
      }
    );

  const getSourceViewLineTimings: Selector<LineTimings> = createSelector(
    getSourceViewStackLineInfo,
    selectedThreadSelectors.getPreviewFilteredCtssSamples,
    getLineTimings
  );

  const getAssemblyViewStackAddressInfo: Selector<StackAddressInfo | null> =
    createSelector(
      selectedThreadSelectors.getFilteredThread,
      selectedThreadSelectors.getAssemblyViewNativeSymbolIndex,
      selectedThreadSelectors.getCallNodeInfo,
      selectedThreadSelectors.getSelectedCallNodeIndex,
      (
        { stackTable, frameTable }: Thread,
        nativeSymbolIndex,
        callNodeInfo,
        selectedCallNodeIndex
      ): StackAddressInfo | null => {
        if (nativeSymbolIndex === null || selectedCallNodeIndex === null) {
          return null;
        }
        return getStackAddressInfoForCallNode(
          stackTable,
          frameTable,
          selectedCallNodeIndex,
          callNodeInfo,
          nativeSymbolIndex
        );
      }
    );

  const getAssemblyViewAddressTimings: Selector<AddressTimings> =
    createSelector(
      getAssemblyViewStackAddressInfo,
      selectedThreadSelectors.getPreviewFilteredCtssSamples,
      getAddressTimings
    );

  return {
    getName,
    getIsJS,
    getLib,
    getTimingsForSidebar,
    getSourceViewStackLineInfo,
    getSourceViewLineTimings,
    getAssemblyViewStackAddressInfo,
    getAssemblyViewAddressTimings,
  };
})();
