/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as ProfileSelectors from '../../selectors/profile';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithThreadCPUDelta } from '../fixtures/profiles/processed-profile';

describe('profile CPU selectors', function () {
  it('ignores the first threadCPUDelta entry when summing CPU time', function () {
    const profile = getProfileWithThreadCPUDelta([[7000, 11000, 13000]], 'ns');
    const { getState } = storeWithProfile(profile);

    expect(ProfileSelectors.getThreadCPUTimeMs(getState())).toEqual([0.024]);
  });
});
