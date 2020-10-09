/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Reducer, LoadingState } from 'firefox-profiler/types';

const loadingState: Reducer<LoadingState> = (
  state = { loadingStep: 'promise', progress: 0 },
  action
) => {
  switch (action.type) {
    case 'CHANGE_LOAD_PROGRESS':
      return {
        loadingStep: action.loadingStep,
        progress: action.progress,
      };
    default:
      return state;
  }
};

export default loadingState;
