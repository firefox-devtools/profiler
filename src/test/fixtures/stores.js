/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import createStore from '../../content/create-store';
import { receiveProfileFromAddon } from '../../content/actions/receive-profile';
import exampleProfile from './profiles/timings-with-js';
import { processProfile } from '../../content/process-profile';
import type { Store } from '../../content/types';
import type { Profile } from '../../common/types/profile';

export function blankStore() {
  return createStore();
}

export function storeWithProfile(profile: Profile = processProfile(exampleProfile)): Store {
  const store = createStore();
  store.dispatch(receiveProfileFromAddon(profile));
  return store;
}
