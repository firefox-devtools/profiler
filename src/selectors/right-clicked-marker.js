/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import { getThreadSelectors } from './per-thread';
import { getProfileViewOptions } from './profile';

import type { ThreadIndex, Thread } from '../types/profile';
import type { MarkerIndex, Marker } from '../types/profile-derived';
import type { Selector } from '../types/store';

export type RightClickedMarkerInfo = {|
  +threadIndex: ThreadIndex,
  +thread: Thread,
  +markerIndex: MarkerIndex,
  +marker: Marker,
|};

export const getRightClickedMarkerInfo: Selector<RightClickedMarkerInfo | null> = createSelector(
  getProfileViewOptions,
  state => {
    const { rightClickedMarker } = getProfileViewOptions(state);

    if (rightClickedMarker !== null) {
      const markerGetter = getThreadSelectors(
        rightClickedMarker.threadIndex
      ).getMarkerGetter(state);

      return markerGetter(rightClickedMarker.markerIndex);
    }

    return null;
  },
  state => {
    const { rightClickedMarker } = getProfileViewOptions(state);

    if (rightClickedMarker !== null) {
      return getThreadSelectors(rightClickedMarker.threadIndex).getThread(
        state
      );
    }

    return null;
  },
  ({ rightClickedMarker }, marker, thread) => {
    if (rightClickedMarker && marker && thread) {
      return {
        ...rightClickedMarker,
        thread,
        marker,
      };
    }

    return null;
  }
);
