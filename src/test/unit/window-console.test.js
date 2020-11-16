/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  addDataToWindowObject,
  logFriendlyPreamble,
} from '../../utils/window-console';
import { storeWithSimpleProfile } from '../fixtures/stores';

describe('console-accessible values on the window object', function() {
  // Coerce the window into a generic object, as these values aren't defined
  // in the flow type definition.

  it('does not have the values initially', function() {
    expect((window: any).profile).toBeUndefined();
    expect((window: any).filteredProfile).toBeUndefined();
    expect((window: any).callTree).toBeUndefined();
  });

  it('adds values to the console', function() {
    const store = storeWithSimpleProfile();
    const target = {};
    addDataToWindowObject(store.getState, store.dispatch, target);
    expect(target.profile).toBeTruthy();
    expect(target.filteredThread).toBeTruthy();
    expect(target.callTree).toBeTruthy();
  });

  it('logs a friendly message', function() {
    const log = console.log;
    (console: any).log = jest.fn();
    logFriendlyPreamble();
    expect(console.log.mock.calls.length).toEqual(2);
    expect(console.log.mock.calls).toMatchSnapshot();
    (console: any).log = log;
  });
});
