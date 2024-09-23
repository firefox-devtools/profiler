/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { stripIndent } from 'common-tags';

import {
  addDataToWindowObject,
  logFriendlyPreamble,
} from '../../utils/window-console';
import { storeWithSimpleProfile, storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';

describe('console-accessible values on the window object', function () {
  // Coerce the window into a generic object, as these values aren't defined
  // in the flow type definition.

  it('does not have the values initially', function () {
    expect((window: any).profile).toBeUndefined();
    expect((window: any).filteredProfile).toBeUndefined();
    expect((window: any).callTree).toBeUndefined();
  });

  it('adds values to the console', function () {
    const store = storeWithSimpleProfile();
    const target = {};
    addDataToWindowObject(store.getState, store.dispatch, target);
    expect(target.profile).toBeTruthy();
    expect(target.filteredThread).toBeTruthy();
    expect(target.callTree).toBeTruthy();
    expect(target.shortenUrl).toBeTruthy();
  });

  it('logs a friendly message', function () {
    const log = console.log;
    (console: any).log = jest.fn();
    logFriendlyPreamble();
    expect(console.log.mock.calls.length).toEqual(2);
    expect(console.log.mock.calls).toMatchSnapshot();
    (console: any).log = log;
  });

  it('can extract gecko logs', function () {
    const profile = getProfileWithMarkers([
      [
        'LogMessages',
        170,
        null,
        {
          type: 'Log',
          module: 'nsHttp',
          name: 'ParentChannelListener::ParentChannelListener [this=7fb5e19b98d0, next=7fb5f48f2320]',
        },
      ],
      [
        'LogMessages',
        190,
        null,
        {
          type: 'Log',
          name: 'nsJARChannel::nsJARChannel [this=0x87f1ec80]\n',
          module: 'nsJarProtocol',
        },
      ],
    ]);
    const store = storeWithProfile(profile);
    const target = {};
    addDataToWindowObject(store.getState, store.dispatch, target);
    const result = target.extractGeckoLogs();
    expect(result).toBe(stripIndent`
      1970-01-01 00:00:00.170000000 UTC - [Unknown Process 0: Empty]: D/nsHttp ParentChannelListener::ParentChannelListener [this=7fb5e19b98d0, next=7fb5f48f2320]
      1970-01-01 00:00:00.190000000 UTC - [Unknown Process 0: Empty]: D/nsJarProtocol nsJARChannel::nsJARChannel [this=0x87f1ec80]
    `);
  });
});
