/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Reducer, ProfileLoadingState } from 'firefox-profiler/types';

const ProfileloadingState: Reducer<ProfileLoadingState> = (
  state = { profileLoadingStep: 'promise', progress: 0 },
  action
) => {
  switch (action.type) {
    case 'CHANGE_LOAD_PROGRESS':
      return {
        profileLoadingStep: action.profileLoadingStep,
        progress: action.progress,
      };
    default:
      return state;
  }
};

export default ProfileloadingState;
