/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import createStore from '../../app-logic/create-store';
import { viewProfile } from '../../actions/receive-profile';
import { createGeckoProfileWithJsTimings } from './profiles/gecko-profile';
import { processProfile } from '../../profile-logic/process-profile';
import { getProfileFromTextSamples } from './profiles/processed-profile';

import type { Store } from '../../types/store';
import type { Profile } from '../../types/profile';

export function blankStore() {
  return createStore();
}

export function storeWithProfile(profile?: Profile): Store {
  if (!profile) {
    profile = processProfile(createGeckoProfileWithJsTimings());
    profile.meta.symbolicated = true;
  }
  const store = createStore();
  store.dispatch(viewProfile(profile));
  return store;
}

export function storeWithSimpleProfile(): Store {
  // FIXME: These samples need to be seperated by two spaces instead of one.
  const { profile } = getProfileFromTextSamples(`
    A A A
    B B B
    C C H
    D F I
    E G
  `);
  return storeWithProfile(profile);
}
