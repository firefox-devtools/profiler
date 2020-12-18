/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import escapeStringRegexp from 'escape-string-regexp';
import { createSelector } from 'reselect';
import { ensureExists, getFirstItemFromSet } from '../utils/flow';
import { urlFromState } from '../app-logic/url-handling';
import * as CommittedRanges from '../profile-logic/committed-ranges';
import { getThreadsKey } from '../profile-logic/profile-data';
import { getProfileNameFromZipPath } from 'firefox-profiler/profile-logic/zip-files';

import type {
  ThreadIndex,
  Pid,
  TransformStack,
  Action,
  TimelineType,
  DataSource,
  ImplementationFilter,
  CallTreeSummaryStrategy,
  UrlState,
  TimelineTrackOrganization,
  Selector,
  DangerousSelectorWithArguments,
  StartEndRange,
  TrackIndex,
  ThreadsKey,
  ProfileSpecificUrlState,
  FullProfileSpecificUrlState,
  ActiveTabSpecificProfileUrlState,
} from 'firefox-profiler/types';

import type { TabSlug } from '../app-logic/tabs-handling';

import urlStateReducer from '../reducers/url-state';
import { formatMetaInfoString } from '../profile-logic/profile-metainfo';

/**
 * Various simple selectors into the UrlState.
 */
export const getUrlState: Selector<UrlState> = (state): UrlState =>
  state.urlState;
export const getProfileSpecificState: Selector<ProfileSpecificUrlState> = state =>
  getUrlState(state).profileSpecific;
export const getFullProfileSpecificState: Selector<FullProfileSpecificUrlState> = state =>
  getProfileSpecificState(state).full;
export const getActiveTabProfileSpecificState: Selector<ActiveTabSpecificProfileUrlState> = state =>
  getProfileSpecificState(state).activeTab;

export const getDataSource: Selector<DataSource> = state =>
  getUrlState(state).dataSource;
export const getHash: Selector<string> = state => getUrlState(state).hash;
export const getProfileUrl: Selector<string> = state =>
  getUrlState(state).profileUrl;
export const getProfilesToCompare: Selector<string[] | null> = state =>
  getUrlState(state).profilesToCompare;
export const getProfileNameFromUrl: Selector<string | null> = state =>
  getUrlState(state).profileName;
export const getAllCommittedRanges: Selector<StartEndRange[]> = state =>
  getProfileSpecificState(state).committedRanges;
export const getImplementationFilter: Selector<ImplementationFilter> = state =>
  getProfileSpecificState(state).implementation;
export const getLastSelectedCallTreeSummaryStrategy: Selector<CallTreeSummaryStrategy> = state =>
  getProfileSpecificState(state).lastSelectedCallTreeSummaryStrategy;
export const getInvertCallstack: Selector<boolean> = state =>
  getProfileSpecificState(state).invertCallstack;
export const getShowUserTimings: Selector<boolean> = state =>
  getProfileSpecificState(state).showUserTimings;
export const getShowJsTracerSummary: Selector<boolean> = state =>
  getFullProfileSpecificState(state).showJsTracerSummary;
export const getTimelineTrackOrganization: Selector<TimelineTrackOrganization> = state =>
  getUrlState(state).timelineTrackOrganization;

/**
 * Active tab specific url state selectors
 */
export const getIsActiveTabResourcesPanelOpen: Selector<boolean> = state =>
  getActiveTabProfileSpecificState(state).isResourcesPanelOpen;

/**
 * Raw search strings, before any splitting has been performed.
 */
export const getCurrentSearchString: Selector<string> = state =>
  getProfileSpecificState(state).callTreeSearchString;
export const getMarkersSearchString: Selector<string> = state =>
  getProfileSpecificState(state).markersSearchString;
export const getNetworkSearchString: Selector<string> = state =>
  getProfileSpecificState(state).networkSearchString;

export const getSelectedTab: Selector<TabSlug> = state =>
  getUrlState(state).selectedTab;
export const getSelectedThreadIndexesOrNull: Selector<Set<ThreadIndex> | null> = state =>
  getProfileSpecificState(state).selectedThreads;
export const getSelectedThreadIndexes: Selector<Set<ThreadIndex>> = state =>
  ensureExists(
    getSelectedThreadIndexesOrNull(state),
    'Attempted to get a thread index before a profile was loaded.'
  );
export const getSelectedThreadsKey: Selector<ThreadsKey> = state =>
  getThreadsKey(getSelectedThreadIndexes(state));

/**
 * This selector is temporary for a migration to multiple selected thread indexes.
 */
export const getFirstSelectedThreadIndex: Selector<ThreadIndex> = state =>
  ensureExists(
    getFirstItemFromSet(getSelectedThreadIndexes(state)),
    'Expected to find at least one thread index in the selected thread indexes'
  );
export const getTimelineType: Selector<TimelineType> = state =>
  getFullProfileSpecificState(state).timelineType;

/**
 * Simple selectors for tracks and track order.
 */
export const getLegacyThreadOrder: Selector<ThreadIndex[] | null> = state =>
  getFullProfileSpecificState(state).legacyThreadOrder;
export const getLegacyHiddenThreads: Selector<ThreadIndex[] | null> = state =>
  getFullProfileSpecificState(state).legacyHiddenThreads;
export const getGlobalTrackOrder: Selector<TrackIndex[]> = state =>
  getFullProfileSpecificState(state).globalTrackOrder;
export const getHiddenGlobalTracks: Selector<Set<TrackIndex>> = state =>
  getFullProfileSpecificState(state).hiddenGlobalTracks;
export const getHiddenLocalTracksByPid: Selector<
  Map<Pid, Set<TrackIndex>>
> = state => getFullProfileSpecificState(state).hiddenLocalTracksByPid;
export const getLocalTrackOrderByPid: Selector<
  Map<Pid, TrackIndex[]>
> = state => getFullProfileSpecificState(state).localTrackOrderByPid;

/**
 * This selector does a simple lookup in the set of hidden tracks for a PID, and ensures
 * that a TrackIndex is selected correctly. This makes it easier to avoid doing null
 * checks everywhere.
 */
export const getHiddenLocalTracks: DangerousSelectorWithArguments<
  Set<TrackIndex>,
  Pid
> = (state, pid) =>
  ensureExists(
    getHiddenLocalTracksByPid(state).get(pid),
    'Unable to get the hidden tracks from the given pid'
  );

/**
 * This selector gets the local track order for a PID, and ensures that one is
 * selected correctly. This makes it easier to avoid doing null checks everywhere.
 */
export const getLocalTrackOrder: DangerousSelectorWithArguments<
  TrackIndex[],
  Pid
> = (state, pid) =>
  ensureExists(
    getLocalTrackOrderByPid(state).get(pid),
    'Unable to get the track order from the given pid'
  );

/**
 * Divide a search string into several parts by splitting on comma.
 */
const splitSearchString = (searchString: string): string[] | null => {
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
};

/**
 * Concatenate an array of strings into a RegExp that matches on all
 * the strings.
 */
const stringsToRegExp = (strings: string[] | null): RegExp | null => {
  if (!strings || !strings.length) {
    return null;
  }
  const regexpStr = strings.map(escapeStringRegexp).join('|');
  return new RegExp(regexpStr, 'gi');
};

/**
 * Search strings filter a thread to only samples that match the strings.
 */
export const getSearchStrings: Selector<string[] | null> = createSelector(
  getCurrentSearchString,
  splitSearchString
);

export const getMarkersSearchStrings: Selector<
  string[] | null
> = createSelector(getMarkersSearchString, splitSearchString);

export const getNetworkSearchStrings: Selector<
  string[] | null
> = createSelector(getNetworkSearchString, splitSearchString);

/**
 * A RegExp can be used for searching and filtering the thread's samples.
 */
export const getSearchStringsAsRegExp: Selector<RegExp | null> = createSelector(
  getSearchStrings,
  stringsToRegExp
);

export const getMarkersSearchStringsAsRegExp: Selector<RegExp | null> = createSelector(
  getMarkersSearchStrings,
  stringsToRegExp
);

export const getNetworkSearchStringsAsRegExp: Selector<RegExp | null> = createSelector(
  getNetworkSearchStrings,
  stringsToRegExp
);

// Pre-allocate an array to help with strict equality tests in the selectors.
const EMPTY_TRANSFORM_STACK = [];

export const getTransformStack: DangerousSelectorWithArguments<
  TransformStack,
  ThreadsKey
> = (state, threadsKey) => {
  return (
    getProfileSpecificState(state).transforms[threadsKey] ||
    EMPTY_TRANSFORM_STACK
  );
};

/**
 * The URL predictor is used to generate a link for an uploaded profile, to predict
 * what the URL will be.
 */
export const getUrlPredictor: Selector<
  (Action | Action[]) => string
> = createSelector(
  getUrlState,
  (oldUrlState: UrlState) => (actionOrActionList: Action | Action[]) => {
    const actionList: Action[] = Array.isArray(actionOrActionList)
      ? actionOrActionList
      : [actionOrActionList];
    const newUrlState = actionList.reduce(urlStateReducer, oldUrlState);
    return urlFromState(newUrlState);
  }
);

/**
 * Get the current path for a zip file that is being used.
 */
export const getPathInZipFileFromUrl: Selector<string | null> = state =>
  getUrlState(state).pathInZipFile;

/**
 * Get a short formatted string that represents the meta info of the current profile.
 */
export const getFormattedMetaInfoString: Selector<string> = state => {
  // Avoid circular dependencies by selected the profile meta manually.
  const { meta } = ensureExists(
    state.profileView.profile,
    'Expected the profile to exist.'
  );
  return formatMetaInfoString(meta);
};

/**
 * Get just the file name from the zip file path, if it exists.
 */
export const getFileNameInZipFilePath: Selector<string | null> = createSelector(
  getPathInZipFileFromUrl,
  pathInZipFile => {
    if (pathInZipFile) {
      return getProfileNameFromZipPath(pathInZipFile);
    }
    return null;
  }
);

/**
 * Get a profile name that can be used as a short identifier for the profile. This
 * will be displayed in the UI, and will be used as a default for a profile name
 * if none is currently set. If none is set, then a series of strategies will be
 * used to select a default one.
 */
export const getProfileNameWithDefault: Selector<string> = createSelector(
  getProfileNameFromUrl,
  getFileNameInZipFilePath,
  getFormattedMetaInfoString,
  (profileNameFromUrl, fileNameInZipFilePath, formattedMetaInfoString) => {
    // Always prefer a manually set name.
    if (profileNameFromUrl) {
      return profileNameFromUrl;
    }
    // Next, try and use a path from the zip file.
    if (fileNameInZipFilePath) {
      return fileNameInZipFilePath;
    }

    // Finally return a generic string describing the type of profile.
    if (formattedMetaInfoString === '') {
      return 'Untitled profile';
    }
    return formattedMetaInfoString;
  }
);

/**
 * Determines the profile name used to store in the IndexedDB by default.
 */
export const getProfileNameForStorage: Selector<string> = createSelector(
  getProfileNameFromUrl,
  getFileNameInZipFilePath,
  (profileNameFromUrl, fileNameInZipFilePath) => {
    // Always prefer a manually set name.
    if (profileNameFromUrl) {
      return profileNameFromUrl;
    }
    // Next, try and use a path from the zip file.
    if (fileNameInZipFilePath) {
      return fileNameInZipFilePath;
    }

    // Finally, return a blank string.
    return '';
  }
);

/**
 * This selector transforms the committed ranges into a list of labels that can
 * be displayed in the UI.
 */
export const getCommittedRangeLabels: Selector<string[]> = createSelector(
  getAllCommittedRanges,
  CommittedRanges.getCommittedRangeLabels
);
