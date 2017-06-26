/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action } from '../types/store';
import type { Summary } from '../profile-logic/summarize-profile';
import type { ThreadIndex } from '../types/profile';

export function profileSummaryProcessed(summary: Summary): Action {
  return {
    type: 'PROFILE_SUMMARY_PROCESSED',
    summary,
  };
}

export function expandProfileSummaryThread(threadIndex: ThreadIndex): Action {
  return {
    type: 'PROFILE_SUMMARY_EXPAND',
    threadIndex,
  };
}

export function collapseProfileSummaryThread(threadIndex: ThreadIndex): Action {
  return {
    type: 'PROFILE_SUMMARY_COLLAPSE',
    threadIndex,
  };
}
