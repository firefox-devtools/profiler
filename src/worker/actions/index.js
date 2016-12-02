import { summarizeProfile } from '../../common/summarize-profile';

export function processProfileSummary() {
  return function (dispatch, getState) {
    dispatch({
      toContent: true,
      type: 'PROFILE_SUMMARY_PROCESSED',
      summary: summarizeProfile(getState().profile),
    });
  };
}

export function profileProcessed(profile) {
  return {
    type: 'PROFILE_PROCESSED',
    profile: profile,
  };
}
