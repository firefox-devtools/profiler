/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Reducer, FileSourceItem } from 'firefox-profiler/types';

const sources: Reducer<FileSourceItem[]> = (state = [], action) => {
  switch (action.type) {
    case 'SOURCE_LOADING_BEGIN': {
      const { file, url } = action;
      return [
        ...state.filter(item => item.file !== file),
        { file, status: { type: 'LOADING', url } },
      ];
    }
    case 'SOURCE_LOADING_SUCCESS': {
      const { file, source } = action;
      return [
        ...state.filter(item => item.file !== file),
        { file, status: { type: 'AVAILABLE', source } },
      ];
    }
    case 'SOURCE_LOADING_ERROR': {
      const { file, error } = action;
      return [
        ...state.filter(item => item.file !== file),
        { file, status: { type: 'ERROR', error } },
      ];
    }
    default:
      return state;
  }
};

export default sources;
