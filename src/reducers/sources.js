/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Reducer, FileSourceStatus } from 'firefox-profiler/types';

const sources: Reducer<Map<string, FileSourceStatus>> = (
  state = new Map(),
  action
) => {
  switch (action.type) {
    case 'SOURCE_LOADING_BEGIN': {
      const { file, url } = action;
      const newState = new Map(state);
      newState.set(file, { type: 'LOADING', url });
      return newState;
    }
    case 'SOURCE_LOADING_SUCCESS': {
      const { file, source } = action;
      const newState = new Map(state);
      newState.set(file, { type: 'AVAILABLE', source });
      return newState;
    }
    case 'SOURCE_LOADING_ERROR': {
      const { file, errors } = action;
      const newState = new Map(state);
      newState.set(file, { type: 'ERROR', errors });
      return newState;
    }
    default:
      return state;
  }
};

export default sources;
