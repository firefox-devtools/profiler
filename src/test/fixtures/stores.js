/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import createStore from '../../create-store';
import { viewProfile } from '../../actions/receive-profile';
import exampleProfile from './profiles/timings-with-js';
import { processProfile } from '../../profile-logic/process-profile';
import { getProfileFromTextSamples } from './profiles/make-profile';

import type { Store } from '../../types/store';
import type { Profile } from '../../types/profile';

export function blankStore() {
  return createStore();
}

export function storeWithProfile(
  profile: Profile = processProfile(exampleProfile())
): Store {
  const store = createStore();
  store.dispatch(viewProfile(profile));
  return store;
}

export function storeWithSimpleProfile(): Store {
  const { profile } = getProfileFromTextSamples(`
    A A A
    B B B
    C C H
    D F I
    E G
  `);
  return storeWithProfile(profile);
}
