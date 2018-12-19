/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import * as Tracks from '../profile-logic/tracks';
import * as UrlState from './url-state';
import { ensureExists } from '../utils/flow';

import type {
  Profile,
  CategoryList,
  IndexIntoCategoryList,
  Thread,
  ThreadIndex,
  Pid,
} from '../types/profile';
import type {
  LocalTrack,
  TrackIndex,
  GlobalTrack,
} from '../types/profile-derived';
import type { Milliseconds, StartEndRange } from '../types/units';
import type {
  GlobalTrackReference,
  LocalTrackReference,
  TrackReference,
  PreviewSelection,
} from '../types/actions';
import type { Selector, DangerousSelectorWithArguments } from '../types/store';
import type {
  State,
  ProfileViewState,
  SymbolicationStatus,
  ProfileSharingStatus,
} from '../types/state';

export const getProfileView: Selector<ProfileViewState> = state =>
  state.profileView;

/**
 * Profile View Options
 */
export const getProfileViewOptions: Selector<*> = state =>
  getProfileView(state).viewOptions;
export const getProfileRootRange: Selector<StartEndRange> = state =>
  getProfileViewOptions(state).rootRange;
export const getSymbolicationStatus: Selector<SymbolicationStatus> = state =>
  getProfileViewOptions(state).symbolicationStatus;
export const getProfileSharingStatus: Selector<ProfileSharingStatus> = state =>
  getProfileViewOptions(state).profileSharingStatus;
export const getScrollToSelectionGeneration: Selector<number> = state =>
  getProfileViewOptions(state).scrollToSelectionGeneration;
export const getFocusCallTreeGeneration: Selector<number> = state =>
  getProfileViewOptions(state).focusCallTreeGeneration;
export const getZeroAt: Selector<Milliseconds> = state =>
  getProfileRootRange(state).start;

export const getCommittedRange: Selector<StartEndRange> = createSelector(
  getProfileRootRange,
  getZeroAt,
  UrlState.getAllCommittedRanges,
  (rootRange, zeroAt, committedRanges): StartEndRange => {
    if (committedRanges.length > 0) {
      let { start, end } = committedRanges[committedRanges.length - 1];
      start += zeroAt;
      end += zeroAt;
      return { start, end };
    }
    return rootRange;
  }
);

/**
 * Profile
 */
export const getProfileOrNull: Selector<Profile | null> = state =>
  getProfileView(state).profile;
export const getProfile: Selector<Profile> = state =>
  ensureExists(
    getProfileOrNull(state),
    'Tried to access the profile before it was loaded.'
  );
export const getProfileInterval: Selector<Milliseconds> = state =>
  getProfile(state).meta.interval;
export const getCategories: Selector<CategoryList> = state =>
  getProfile(state).meta.categories;
export const getDefaultCategory: Selector<IndexIntoCategoryList> = state =>
  getCategories(state).findIndex(c => c.color === 'grey');
export const getThreads: Selector<Thread[]> = state =>
  getProfile(state).threads;
export const getThreadNames: Selector<string[]> = state =>
  getProfile(state).threads.map(t => t.name);
export const getRightClickedTrack: Selector<TrackReference> = state =>
  getProfileViewOptions(state).rightClickedTrack;
export const getPreviewSelection: Selector<PreviewSelection> = state =>
  getProfileViewOptions(state).previewSelection;

/**
 * Tracks
 *
 * Tracks come in two flavors: global tracks and local tracks.
 * They're uniquely referenced by a TrackReference.
 */
export const getGlobalTracks: Selector<GlobalTrack[]> = state =>
  getProfileView(state).globalTracks;

/**
 * This returns all TrackReferences for global tracks.
 */
export const getGlobalTrackReferences: Selector<
  GlobalTrackReference[]
> = createSelector(getGlobalTracks, globalTracks =>
  globalTracks.map((globalTrack, trackIndex) => ({
    type: 'global',
    trackIndex,
  }))
);

/**
 * This finds a GlobalTrack from its TrackReference. No memoization is needed
 * as this is a simple value look-up.
 */
export const getGlobalTrackFromReference: DangerousSelectorWithArguments<
  GlobalTrack,
  GlobalTrackReference
> = (state, trackReference) =>
  getGlobalTracks(state)[trackReference.trackIndex];

/**
 * This finds a GlobalTrack and its index for a specific Pid.
 *
 * Warning: this selector returns a new object on every call, and will not
 * properly work with a PureComponent.
 */
export const getGlobalTrackAndIndexByPid: DangerousSelectorWithArguments<
  {| +globalTrackIndex: TrackIndex, +globalTrack: GlobalTrack |},
  Pid
> = (state, pid) => {
  const globalTracks = getGlobalTracks(state);
  const globalTrackIndex = globalTracks.findIndex(
    track => track.type === 'process' && track.pid === pid
  );
  if (globalTrackIndex === -1) {
    throw new Error('Unable to find the track index for the given pid.');
  }
  const globalTrack = globalTracks[globalTrackIndex];
  if (globalTrack.type !== 'process') {
    throw new Error('The globalTrack must be a process type.');
  }
  return { globalTrackIndex, globalTrack };
};

/**
 * This returns a map of local tracks from a pid.
 */
export const getLocalTracksByPid: Selector<Map<Pid, LocalTrack[]>> = state =>
  getProfileView(state).localTracksByPid;

/**
 * This selectors performs a simple look up in a Map, throws an error if it doesn't exist,
 * and finally returns the local tracks for a specific Pid. It does not need memoization
 * and is a very inexpensive function to run.
 */
export const getLocalTracks: DangerousSelectorWithArguments<
  LocalTrack[],
  Pid
> = (state, pid) =>
  ensureExists(
    getProfileView(state).localTracksByPid.get(pid),
    'Unable to get the tracks for the given pid.'
  );

/**
 * This selector does an inexpensive look-up for the local track from a reference.
 * It does not need any memoization, and returns the same object every time.
 */
export const getLocalTrackFromReference: DangerousSelectorWithArguments<
  LocalTrack,
  LocalTrackReference
> = (state, trackReference) =>
  getLocalTracks(state, trackReference.pid)[trackReference.trackIndex];

export const getRightClickedThreadIndex: Selector<null | ThreadIndex> = createSelector(
  getRightClickedTrack,
  getGlobalTracks,
  getLocalTracksByPid,
  (rightClickedTrack, globalTracks, localTracksByPid) => {
    if (rightClickedTrack.type === 'global') {
      const track = globalTracks[rightClickedTrack.trackIndex];
      return track.type === 'process' ? track.mainThreadIndex : null;
    }
    const { pid, trackIndex } = rightClickedTrack;
    const localTracks = ensureExists(
      localTracksByPid.get(pid),
      'No local tracks found at that pid.'
    );
    const track = localTracks[trackIndex];

    return track.type === 'thread' ? track.threadIndex : null;
  }
);

export const getGlobalTrackNames: Selector<string[]> = createSelector(
  getGlobalTracks,
  getThreads,
  (globalTracks, threads) =>
    globalTracks.map(globalTrack =>
      Tracks.getGlobalTrackName(globalTrack, threads)
    )
);

export const getGlobalTrackName: DangerousSelectorWithArguments<
  string,
  TrackIndex
> = (state, trackIndex) => getGlobalTrackNames(state)[trackIndex];

export const getLocalTrackNamesByPid: Selector<
  Map<Pid, string[]>
> = createSelector(
  getLocalTracksByPid,
  getThreads,
  (localTracksByPid, threads) => {
    const localTrackNamesByPid = new Map();
    for (const [pid, localTracks] of localTracksByPid) {
      localTrackNamesByPid.set(
        pid,
        localTracks.map(localTrack =>
          Tracks.getLocalTrackName(localTrack, threads)
        )
      );
    }
    return localTrackNamesByPid;
  }
);

export const getLocalTrackName = (
  state: State,
  pid: Pid,
  trackIndex: TrackIndex
): string =>
  ensureExists(
    getLocalTrackNamesByPid(state).get(pid),
    'Could not find the track names from the given pid'
  )[trackIndex];
