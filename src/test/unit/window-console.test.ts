/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { stripIndent } from 'common-tags';

import type { ExtraPropertiesOnWindowForConsole } from '../../utils/window-console';
import {
  addDataToWindowObject,
  logFriendlyPreamble,
} from '../../utils/window-console';
import { storeWithSimpleProfile, storeWithProfile } from '../fixtures/stores';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import type { MixedObject } from 'firefox-profiler/types';

describe('console-accessible values on the window object', function () {
  // Coerce the window into a generic object, as these values aren't defined
  // in the flow type definition.

  it('does not have the values initially', function () {
    expect((window as any).profile).toBeUndefined();
    expect((window as any).filteredProfile).toBeUndefined();
    expect((window as any).callTree).toBeUndefined();
  });

  it('adds values to the console', function () {
    const store = storeWithSimpleProfile();
    const targetWin: Partial<ExtraPropertiesOnWindowForConsole> = {};
    const target = addDataToWindowObject(
      store.getState,
      store.dispatch,
      targetWin
    );
    expect(target.profile).toBeTruthy();
    expect(target.filteredThread).toBeTruthy();
    expect(target.callTree).toBeTruthy();
    expect(target.shortenUrl).toBeTruthy();
  });

  it('logs a friendly message', function () {
    const log = console.log;
    const mockedLog = jest.fn();
    (console as any).log = mockedLog;
    logFriendlyPreamble();
    expect(mockedLog.mock.calls.length).toEqual(2);
    expect(mockedLog.mock.calls).toMatchSnapshot();
    (console as any).log = log;
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
    const target: MixedObject = {};
    addDataToWindowObject(store.getState, store.dispatch, target);
    const result = (target as any).extractGeckoLogs();
    expect(result).toBe(stripIndent`
      1970-01-01 00:00:00.170000000 UTC - [Unknown Process 0: Empty]: D/nsHttp ParentChannelListener::ParentChannelListener [this=7fb5e19b98d0, next=7fb5f48f2320]
      1970-01-01 00:00:00.190000000 UTC - [Unknown Process 0: Empty]: D/nsJarProtocol nsJARChannel::nsJARChannel [this=0x87f1ec80]
    `);
  });

  it('can extract gecko logs with log level already in module', function () {
    const profile = getProfileWithMarkers([
      [
        'LogMessages',
        170,
        null,
        {
          type: 'Log',
          module: 'D/nsHttp',
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
          module: 'D/nsJarProtocol',
        },
      ],
    ]);
    const store = storeWithProfile(profile);
    const target: MixedObject = {};
    addDataToWindowObject(store.getState, store.dispatch, target);
    const result = (target as any).extractGeckoLogs();
    expect(result).toBe(stripIndent`
      1970-01-01 00:00:00.170000000 UTC - [Unknown Process 0: Empty]: D/nsHttp ParentChannelListener::ParentChannelListener [this=7fb5e19b98d0, next=7fb5f48f2320]
      1970-01-01 00:00:00.190000000 UTC - [Unknown Process 0: Empty]: D/nsJarProtocol nsJARChannel::nsJARChannel [this=0x87f1ec80]
    `);
  });

  describe('totalMarkerDuration', function () {
    function setup(): ExtraPropertiesOnWindowForConsole {
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const store = storeWithSimpleProfile();
      const targetWin: Partial<ExtraPropertiesOnWindowForConsole> = {};
      return addDataToWindowObject(store.getState, store.dispatch, targetWin);
    }
    beforeEach(function () {});

    it('returns 0 for empty array', function () {
      const target = setup();
      const result = target.totalMarkerDuration([]);
      expect(result).toBe(0);
    });

    it('returns 0 and logs error for non-array input', function () {
      const target = setup();
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const result = target.totalMarkerDuration('not an array');
      expect(result).toBe(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'totalMarkerDuration expects an array of markers'
      );
      consoleErrorSpy.mockRestore();
    });

    it('calculates duration for interval markers', function () {
      const target = setup();
      const markers = [
        {
          start: 100,
          end: 200,
          name: 'marker1',
          category: 0,
          data: null,
        },
        {
          start: 150,
          end: 250,
          name: 'marker2',
          category: 0,
          data: null,
        },
      ];
      const result = target.totalMarkerDuration(markers);
      expect(result).toBe(200); // (200-100) + (250-150) = 100 + 100 = 200

      // Make sure that we print a formatted log for the duration.
      expect(console.log).toHaveBeenCalledWith('Total marker duration: 200ms');
    });

    it('skips instant markers with null end times', function () {
      const target = setup();
      const markers = [
        {
          start: 100,
          end: 200,
          name: 'interval',
          category: 0,
          threadId: null,
          data: null,
        },
        {
          start: 150,
          end: null,
          name: 'instant',
          category: 0,
          threadId: null,
          data: null,
        },
        {
          start: 300,
          end: 400,
          name: 'interval2',
          category: 0,
          threadId: null,
          data: null,
        },
      ];
      const result = target.totalMarkerDuration(markers);
      expect(result).toBe(200); // (200-100) + (400-300) = 100 + 100 = 200
    });

    it('handles mixed valid and invalid markers', function () {
      const target = setup();
      const markers = [
        {
          start: 100,
          end: 200,
          name: 'valid',
          category: 0,
          threadId: null,
          data: null,
        },
        null,
        {
          start: 'invalid',
          end: 300,
          name: 'invalid',
          category: 0,
          threadId: null,
          data: null,
        },
        {
          start: 400,
          end: 500,
          name: 'valid2',
          category: 0,
          threadId: null,
          data: null,
        },
      ];
      const result = target.totalMarkerDuration(markers);
      expect(result).toBe(200); // (200-100) + (500-400) = 100 + 100 = 200
    });
  });
});
