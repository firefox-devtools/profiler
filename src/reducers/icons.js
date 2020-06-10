/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Reducer } from 'firefox-profiler/types';

const favicons: Reducer<Set<string>> = (state = new Set(), action) => {
  switch (action.type) {
    case 'ICON_HAS_LOADED':
      return new Set([...state, action.icon]);
    case 'ICON_IN_ERROR': // nothing to do
    default:
      return state;
  }
};

export default favicons;
