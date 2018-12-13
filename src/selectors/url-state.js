/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import escapeStringRegexp from 'escape-string-regexp';
import { createSelector } from 'reselect';
import { ensureExists } from '../utils/flow';
import { urlFromState } from '../app-logic/url-handling';
import * as CommittedRanges from '../profile-logic/committed-ranges';

import type { ThreadIndex, Pid } from '../types/profile';
import type { TransformStack } from '../types/transforms';
import type { Action, TimelineType } from '../types/actions';
import type { State, UrlState } from '../types/reducers';
import urlStateReducer from '../reducers/url-state';

// Pre-allocate an array to help with strict equality tests in the selectors.
const EMPTY_TRANSFORM_STACK = [];

export const getUrlState = (state: State): UrlState => state.urlState;
export const getProfileSpecificState = (state: State) =>
  getUrlState(state).profileSpecific;

export const getDataSource = (state: State) => getUrlState(state).dataSource;
export const getHash = (state: State) => getUrlState(state).hash;
export const getProfileUrl = (state: State) => getUrlState(state).profileUrl;
export const getAllCommittedRanges = (state: State) =>
  getProfileSpecificState(state).committedRanges;
export const getImplementationFilter = (state: State) =>
  getProfileSpecificState(state).implementation;
export const getInvertCallstack = (state: State) =>
  getProfileSpecificState(state).invertCallstack;
export const getShowJsTracerSummary = (state: State) =>
  getProfileSpecificState(state).showJsTracerSummary;
export const getCurrentSearchString = (state: State) =>
  getProfileSpecificState(state).callTreeSearchString;
export const getSearchStrings = createSelector(
  getCurrentSearchString,
  searchString => {
    if (!searchString) {
      return null;
    }
    const result = searchString
      .split(',')
      .map(part => part.trim())
      .filter(part => part);

    if (result.length) {
      return result;
    }

    return null;
  }
);
export const getSearchStringsAsRegExp = createSelector(
  getSearchStrings,
  strings => {
    if (!strings || !strings.length) {
      return null;
    }
    const regexpStr = strings.map(escapeStringRegexp).join('|');
    return new RegExp(regexpStr, 'gi');
  }
);
export const getMarkersSearchString = (state: State) =>
  getProfileSpecificState(state).markersSearchString;
export const getSelectedTab = (state: State) => getUrlState(state).selectedTab;
export const getSelectedThreadIndexOrNull = (state: State) =>
  getProfileSpecificState(state).selectedThread;
export const getSelectedThreadIndex = (state: State) => {
  const threadIndex = getSelectedThreadIndexOrNull(state);
  if (threadIndex === null) {
    throw new Error(
      'Attempted to get a thread index before a profile was loaded.'
    );
  }
  return threadIndex;
};
export const getTransformStack = (
  state: State,
  threadIndex: ThreadIndex
): TransformStack => {
  return (
    getProfileSpecificState(state).transforms[threadIndex] ||
    EMPTY_TRANSFORM_STACK
  );
};

export const getTimelineType = (state: State): TimelineType =>
  getProfileSpecificState(state).timelineType;

export const getLegacyThreadOrder = (state: State) =>
  getProfileSpecificState(state).legacyThreadOrder;
export const getLegacyHiddenThreads = (state: State) =>
  getProfileSpecificState(state).legacyHiddenThreads;
export const getGlobalTrackOrder = (state: State) =>
  getProfileSpecificState(state).globalTrackOrder;
export const getHiddenGlobalTracks = (state: State) =>
  getProfileSpecificState(state).hiddenGlobalTracks;
export const getHiddenLocalTracksByPid = (state: State) =>
  getProfileSpecificState(state).hiddenLocalTracksByPid;
export const getHiddenLocalTracks = (state: State, pid: Pid) =>
  ensureExists(
    getHiddenLocalTracksByPid(state).get(pid),
    'Unable to get the hidden tracks from the given pid'
  );
export const getLocalTrackOrderByPid = (state: State) =>
  getProfileSpecificState(state).localTrackOrderByPid;
export const getLocalTrackOrder = (state: State, pid: Pid) =>
  ensureExists(
    getLocalTrackOrderByPid(state).get(pid),
    'Unable to get the track order from the given pid'
  );

export const getUrlPredictor = createSelector(
  getUrlState,
  (oldUrlState: UrlState) => (actionOrActionList: Action | Action[]) => {
    const actionList: Action[] = Array.isArray(actionOrActionList)
      ? actionOrActionList
      : [actionOrActionList];
    const newUrlState = actionList.reduce(urlStateReducer, oldUrlState);
    return urlFromState(newUrlState);
  }
);

export const getPathInZipFileFromUrl = (state: State) =>
  getUrlState(state).pathInZipFile;

/**
 * For now only provide a name for a profile if it came from a zip file.
 */
export const getProfileName: State => null | string = createSelector(
  getPathInZipFileFromUrl,
  pathInZipFile => {
    if (!pathInZipFile) {
      return null;
    }
    const pathParts = pathInZipFile.split('/');
    return pathParts[pathParts.length - 1];
  }
);

export const getCommittedRangeLabels = createSelector(
  getAllCommittedRanges,
  CommittedRanges.getCommittedRangeLabels
);
