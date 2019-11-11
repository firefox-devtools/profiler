/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import { getThreadSelectors } from './per-thread';
import { getProfileViewOptions } from './profile';

import type { ThreadIndex } from '../types/profile';
import type { MarkerIndex, Marker } from '../types/profile-derived';
import type { Selector } from '../types/store';

export const getRightClickedMarkerThreadIndex: Selector<ThreadIndex | null> = createSelector(
  getProfileViewOptions,
  ({ rightClickedMarker }) =>
    rightClickedMarker ? rightClickedMarker.threadIndex : null
);

export const getRightClickedMarkerIndex: Selector<MarkerIndex | null> = createSelector(
  getProfileViewOptions,
  ({ rightClickedMarker }) =>
    rightClickedMarker ? rightClickedMarker.markerIndex : null
);

export const getRightClickedMarker: Selector<Marker | null> = createSelector(
  getRightClickedMarkerIndex,
  state => {
    const threadIndex = getRightClickedMarkerThreadIndex(state);
    if (threadIndex !== null) {
      return getThreadSelectors(threadIndex).getMarkerGetter(state);
    }

    return null;
  },
  (markerIndex, getMarker) => {
    if (markerIndex !== null && getMarker !== null) {
      return getMarker(markerIndex);
    }

    return null;
  }
);
