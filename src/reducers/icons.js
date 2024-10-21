/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Reducer, IconsWithClassNames } from 'firefox-profiler/types';

const favicons: Reducer<IconsWithClassNames> = (state = new Map(), action) => {
  switch (action.type) {
    case 'ICON_HAS_LOADED':
      return new Map([...state.entries(), action.iconWithClassName]);
    case 'ICON_IN_ERROR': // nothing to do
    default:
      return state;
  }
};

export default favicons;
