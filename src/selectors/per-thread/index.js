/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { createSelector } from 'reselect';
import * as UrlState from '../url-state';
import * as ProfileData from '../../profile-logic/profile-data';
import {
  getThreadSelectorsPerThread,
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
import * as ProfileSelectors from '../profile';

import type { ThreadIndex } from '../../types/profile';
import type { Selector } from '../../types/store';
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
const _threadSelectorsCache: { [key: ThreadIndex]: ThreadSelectors } = {};

/**
 * This function does the work of building out the selectors for a given thread index.
 * See the respective definitions in the functions getXXXXXSelectorsPerThread for
 * what they specifically include.
 */
export const getThreadSelectors = (
  threadIndex: ThreadIndex
): ThreadSelectors => {
  if (!(threadIndex in _threadSelectorsCache)) {
    // We define the thread selectors in 3 steps to ensure clarity in the
    // separate files.
    // 1. The basic selectors.
    let selectors = getThreadSelectorsPerThread(threadIndex);
    // 2. Stack, sample and marker selectors that need the previous basic
    // selectors for their own definition.
    selectors = {
      ...selectors,
      ...getStackAndSampleSelectorsPerThread(selectors),
      ...getMarkerSelectorsPerThread(selectors),
    };
    // 3. Other selectors that need selectors from different files to be defined.
    _threadSelectorsCache[threadIndex] = {
      ...selectors,
      ...getComposedSelectorsPerThread(selectors),
    };
  }
  return _threadSelectorsCache[threadIndex];
};

/**
 * Most of the time, we only want to work with the selected thread. This object
 * collects the selectors for the currently selected thread.
 */
export const selectedThreadSelectors: ThreadSelectors = (() => {
  const anyThreadSelectors: ThreadSelectors = getThreadSelectors(0);
  const result: $Shape<ThreadSelectors> = {};
  for (const key in anyThreadSelectors) {
    result[key] = state =>
      getThreadSelectors(UrlState.getSelectedThreadIndex(state))[key](state);
  }
  const result2: ThreadSelectors = (result: any);
  return result2;
})();

export type NodeSelectors = {|
  +getName: Selector<string>,
  +getIsJS: Selector<boolean>,
  +getLib: Selector<string>,
  +getTimingsForSidebar: Selector<TimingsForPath>,
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
    selectedThreadSelectors.getSampleDurationGetter,
    selectedThreadSelectors.getSampleIndexOffsetFromPreviewRange,
    UrlState.getInvertCallstack,
    selectedThreadSelectors.getPreviewFilteredThread,
    ProfileSelectors.getCategories,
    ProfileData.getTimingsForPath
  );

  return {
    getName,
    getIsJS,
    getLib,
    getTimingsForSidebar,
  };
})();
