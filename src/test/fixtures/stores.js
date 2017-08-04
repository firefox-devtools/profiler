/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import createStore from '../../create-store';
import { receiveProfileFromAddon } from '../../actions/receive-profile';
import exampleProfile from './profiles/timings-with-js';
import { processProfile } from '../../profile-logic/process-profile';
import type { Store } from '../../types/store';
import type { Profile } from '../../types/profile';

export function blankStore() {
  return createStore();
}

export function storeWithProfile(
  profile: Profile = processProfile(exampleProfile())
): Store {
  const store = createStore();
  store.dispatch(receiveProfileFromAddon(profile));
  return store;
}
