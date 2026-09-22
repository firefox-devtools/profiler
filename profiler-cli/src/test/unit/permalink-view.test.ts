/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { permalinkViewForCommand } from '../../permalink-view';

describe('permalinkViewForCommand', function () {
  it('maps sample queries to the call tree with their ephemeral settings', function () {
    expect(
      permalinkViewForCommand({
        command: 'thread',
        subcommand: 'samples-bottom-up',
        thread: 't-2',
        search: 'js::RunScript',
        includeIdle: true,
        strategy: 'timing',
        sampleFilters: [{ type: 'merge', funcIndexes: [3] }],
      })
    ).toEqual({
      threadHandle: 't-2',
      tab: 'calltree',
      callTreeSearch: 'js::RunScript',
      includeIdle: true,
      strategy: 'timing',
      sampleFilters: [{ type: 'merge', funcIndexes: [3] }],
      invertCallstack: true,
    });
  });

  it('maps marker and network queries to their tabs and search fields', function () {
    expect(
      permalinkViewForCommand({
        command: 'thread',
        subcommand: 'markers',
        markerFilters: { searchString: 'DOMEvent', category: 'DOM' },
      })
    ).toEqual({
      threadHandle: undefined,
      tab: 'marker-chart',
      markerSearch: 'DOMEvent',
    });
    expect(
      permalinkViewForCommand({
        command: 'thread',
        subcommand: 'markers',
        markerFilters: { list: true },
      }).tab
    ).toBe('marker-table');
    expect(
      permalinkViewForCommand({
        command: 'thread',
        subcommand: 'network',
        networkFilters: { searchString: 'css' },
      })
    ).toEqual({
      threadHandle: undefined,
      tab: 'network-chart',
      networkSearch: 'css',
    });
  });

  it('maps cross-thread marker searches to the marker tabs', function () {
    expect(
      permalinkViewForCommand({
        command: 'profile',
        subcommand: 'markers',
        markerFilters: { searchString: 'GC', thread: 't-3', list: true },
      })
    ).toEqual({
      threadHandle: 't-3',
      tab: 'marker-table',
      markerSearch: 'GC',
    });
    expect(
      permalinkViewForCommand({ command: 'profile', subcommand: 'info' })
    ).toEqual({});
  });

  it('selects the marker for marker commands', function () {
    expect(
      permalinkViewForCommand({
        command: 'marker',
        subcommand: 'info',
        marker: 'm-4',
      })
    ).toEqual({ tab: 'marker-chart', markerHandle: 'm-4' });
  });

  it('leaves the session state alone for state commands', function () {
    expect(permalinkViewForCommand({ command: 'status' })).toEqual({});
    expect(
      permalinkViewForCommand({ command: 'zoom', subcommand: 'pop' })
    ).toEqual({});
  });
});
