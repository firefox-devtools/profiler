/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { Reducer, IconsWithClassNames } from 'firefox-profiler/types';

const favicons: Reducer<IconsWithClassNames> = (state = new Map(), action) => {
  switch (action.type) {
    case 'ICON_HAS_LOADED': {
      const { icon, className } = action.iconWithClassName;
      return new Map([...state.entries(), [icon, className]]);
    }
    case 'ICON_BATCH_ADD': {
      const newState = new Map([...state.entries()]);
      for (const { icon, className } of action.icons) {
        newState.set(icon, className);
      }

      return newState;
    }
    case 'ICON_IN_ERROR': // nothing to do
    default:
      return state;
  }
};

export default favicons;
