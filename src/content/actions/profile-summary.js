// @flow
import type { Action } from './types';
import type { Summary } from '../../common/summarize-profile';
import type { ThreadIndex } from '../../common/types/profile';

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
