/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';
import { getProfileViewOptions } from './profile';

import type { Selector, MarkerReference } from 'firefox-profiler/types';

export const getRightClickedMarkerInfo: Selector<MarkerReference | null> =
  createSelector(
    getProfileViewOptions,
    (viewOptions) => viewOptions.rightClickedMarker
  );
