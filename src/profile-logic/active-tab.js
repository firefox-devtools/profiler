/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getThreadSelectors } from '../selectors/per-thread';
import { assertExhaustiveCheck } from '../utils/flow';

import type { State } from '../types/state';
import type { ThreadIndex, Pid } from '../types/profile';
import type {
  GlobalTrack,
  LocalTrack,
  TrackIndex,
} from '../types/profile-derived';

/**
 * Take the global tracks and decide which one to hide during the active tab view.
 * Some global tracks are allowed, some tracks are not, and we have to do some
 * computations for some('process' type specifically).
 */
export function computeActiveTabHiddenGlobalTracks(
  globalTracks: GlobalTrack[],
  state: State
): Set<TrackIndex> {
  const activeTabHiddenGlobalTracks = new Set();

  for (let trackIndex = 0; trackIndex < globalTracks.length; trackIndex++) {
    const globalTrack: GlobalTrack = globalTracks[trackIndex];
    const trackType = globalTrack.type;

    switch (trackType) {
      case 'screenshots':
        // Do not hide screenshots.
        break;
      case 'visual-progress':
      case 'perceptual-visual-progress':
      case 'contentful-visual-progress':
        // Hide those global track types because we want to hide as much as
        // possible from web developers for now.
        activeTabHiddenGlobalTracks.add(trackIndex);
        break;
      case 'process': {
        // Do not display empty tracks if the tab filtered thread is empty.
        if (
          globalTrack.mainThreadIndex !== undefined &&
          globalTrack.mainThreadIndex !== null &&
          isTabFilteredThreadEmpty(globalTrack.mainThreadIndex, state)
        ) {
          // Thread is empty and we should hide it.
          activeTabHiddenGlobalTracks.add(trackIndex);
        }
        break;
      }
      default:
        throw assertExhaustiveCheck(trackType, `Unhandled GlobalTrack type.`);
    }
  }

  return activeTabHiddenGlobalTracks;
}

/**
 * Take the local tracks and decide which one to hide during the active tab view.
 * Some tracks are not allowed, and we have to do some computations for some('thread' type specifically).
 */
export function computeActiveTabHiddenLocalTracksByPid(
  localTracksByPid: Map<Pid, LocalTrack[]>,
  state: State
): Map<Pid, Set<TrackIndex>> {
  const activeTabHiddenLocalTracksByPid = new Map();

  for (const [pid, localTracks] of localTracksByPid) {
    // Pre-put the new Set here, because we should keep the whole processes even though they are empty.
    const currentLocalTracks = new Set();
    activeTabHiddenLocalTracksByPid.set(pid, currentLocalTracks);
    for (let trackIndex = 0; trackIndex < localTracks.length; trackIndex++) {
      const localTrack = localTracks[trackIndex];
      const trackType = localTrack.type;

      switch (trackType) {
        case 'network':
        case 'memory':
        case 'ipc': {
          // Hide those global track types because we want to hide as much as
          // possible from web developers for now.
          currentLocalTracks.add(trackIndex);
          break;
        }
        case 'thread': {
          // We don't want to display empty tracks if the tab filtered thread is empty.
          if (
            localTrack.threadIndex !== undefined &&
            localTrack.threadIndex !== null &&
            isTabFilteredThreadEmpty(localTrack.threadIndex, state)
          ) {
            // Thread is empty and we should hide it.
            currentLocalTracks.add(trackIndex);
          }
          break;
        }
        default:
          throw assertExhaustiveCheck(trackType, `Unhandled LocalTrack type.`);
      }
    }
  }

  return activeTabHiddenLocalTracksByPid;
}

/**
 * Checks whether the tab filtered thread is empty or not.
 * We take a look at the sample and marker data to determine that.
 */
function isTabFilteredThreadEmpty(
  threadIndex: ThreadIndex,
  state: State
): boolean {
  // Have to get the thread selectors to look if the thread is empty or not.
  const threadSelectors = getThreadSelectors(threadIndex);
  const tabFilteredThread = threadSelectors.getActiveTabFilteredThread(state);
  // Check the samples first to see if they are all empty or not.
  for (const stackIndex of tabFilteredThread.samples.stack) {
    if (stackIndex !== null) {
      // Samples are not empty. Do not hide that thread.
      // We don't have to look at the markers because samples are not empty.
      return false;
    }
  }

  const tabFilteredMarkers = threadSelectors.getActiveTabFilteredMarkerIndexesWithoutGlobals(
    state
  );
  if (tabFilteredMarkers.length > 0) {
    // Thread has some markers in it. Don't hide and skip to the next global track.
    return false;
  }

  return true;
}
