/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render } from 'react-testing-library';
import { Provider } from 'react-redux';

import { changeNetworkSearchString } from '../../actions/profile-view';
import NetworkChart from '../../components/network-chart';
import { changeSelectedTab } from '../../actions/app';
import { ensureExists } from '../../utils/flow';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileWithMarkers,
  getNetworkMarkers,
} from '../fixtures/profiles/processed-profile';
import { getBoundingBox } from '../fixtures/utils';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { type NetworkPayload } from '../../types/markers';

const NETWORK_MARKERS = (function() {
  const arrayOfNetworkMarkers = Array(10)
    .fill()
    .map((_, i) => getNetworkMarkers(3 + 0.1 * i, i));
  return [].concat(...arrayOfNetworkMarkers);
})();

function setupWithProfile(profile) {
  const flushRafCalls = mockRaf();
  const ctx = mockCanvasContext();
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ctx);

  // Ideally we'd want this only on the Canvas and on ChartViewport, but this is
  // a lot easier to mock this everywhere.
  jest
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => getBoundingBox(200, 300));

  const store = storeWithProfile(profile);
  store.dispatch(changeSelectedTab('network-chart'));

  const renderResult = render(
    <Provider store={store}>
      <NetworkChart />
    </Provider>
  );
  const { container } = renderResult;

  function getUrlShorteningParts(): Array<[string, string]> {
    return Array.from(
      container.querySelectorAll('.networkChartRowItemLabel span span')
    ).map(node => [node.className, node.textContent]);
  }

  function styleForClass(className: string): ?string {
    return ensureExists(
      container.querySelector(className),
      `Couldn't find the element with selector ${className}`
    ).getAttribute('style');
  }

  function rowItem() {
    return ensureExists(
      container.querySelector('.networkChartRowItem'),
      `Couldn't find the row item in the network chart, with selector .networkChartRowItem`
    );
  }

  return {
    ...renderResult,
    flushRafCalls,
    dispatch: store.dispatch,
    flushDrawLog: () => ctx.__flushDrawLog(),
    getUrlShorteningParts,
    styleForClass,
    rowItem,
  };
}

// create new function to get ProfileWithNetworkMarkers
function setupWithPayload(name: string, payload: NetworkPayload) {
  const profile = getProfileWithMarkers([[name, 0, payload]]);
  const setupResult = setupWithProfile(profile);
  const { flushRafCalls, dispatch } = setupResult;

  dispatch(changeSelectedTab('network-chart'));
  flushRafCalls();

  return setupResult;
}

describe('NetworkChart', function() {
  it('renders NetworkChart correctly', () => {
    const profile = getProfileWithMarkers([...NETWORK_MARKERS]);
    const {
      flushRafCalls,
      dispatch,
      flushDrawLog,
      container,
    } = setupWithProfile(profile);

    dispatch(changeSelectedTab('network-chart'));
    flushRafCalls();

    const drawCalls = flushDrawLog();
    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();
  });
});

describe('NetworkChartRowBar phase calculations', function() {
  it('divides up the different phases of the request with full set of required information', () => {
    const { styleForClass } = setupWithPayload(
      'Load 100: https://test.mozilla.org',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_REDIRECT',
        connectStart: 20,
        startTime: 10,
        endTime: 90,
        requestStart: 20,
        responseStart: 60,
        responseEnd: 80,
      }
    );
    expect(styleForClass('.networkChartRowItemBarRequestQueue')).toMatch(
      'width: 12.5%'
    );
    expect(styleForClass('.networkChartRowItemBarRequest')).toMatch(
      'width: 50%'
    );
    expect(styleForClass('.networkChartRowItemBarResponse')).toMatch(
      'width: 25%'
    );
  });

  it('divides up the different phases of the request with subset of required information', () => {
    const { styleForClass } = setupWithPayload(
      'Load 101: https://test.mozilla.org',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_REDIRECT',
        connectStart: 20,
        startTime: 10,
        endTime: 90,
        responseStart: 60,
        responseEnd: 80,
      }
    );

    expect(styleForClass('.networkChartRowItemBarRequestQueue')).toMatch(
      'width: 12.5%'
    );
    expect(styleForClass('.networkChartRowItemBarRequest')).toMatch(
      'width: 0%'
    );
    expect(styleForClass('.networkChartRowItemBarResponse')).toMatch(
      'width: 25%'
    );
  });

  it('divides up the different phases of the request with no set of required information', () => {
    const { styleForClass } = setupWithPayload(
      'Load 101: https://test.mozilla.org',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
      }
    );
    expect(styleForClass('.networkChartRowItemBarRequestQueue')).toMatch(
      'width: 0%'
    );
    expect(styleForClass('.networkChartRowItemBarRequest')).toMatch(
      'width: 0%'
    );
    expect(styleForClass('.networkChartRowItemBarResponse')).toMatch(
      'width: 100%'
    );
  });
});

describe('NetworkChartRowBar URL split', function() {
  it('splits up the url by protocol / domain / path / filename / params / hash', function() {
    const { getUrlShorteningParts } = setupWithPayload(
      'Load 101: https://test.mozilla.org/img/optimized/test.gif?param1=123&param2=321#hashNode2',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
      }
    );
    expect(getUrlShorteningParts()).toEqual([
      // Then assert that it's broken up as expected
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'test.mozilla.org'],
      ['networkChartRowItemUriOptional', '/img/optimized'],
      ['networkChartRowItemUriRequired', '/test.gif'],
      ['networkChartRowItemUriOptional', '?param1=123&param2=321'],
      ['networkChartRowItemUriOptional', '#hashNode2'],
    ]);
  });

  it('returns null with an invalid url', function() {
    const { getUrlShorteningParts } = setupWithPayload(
      'Load 101: test.mozilla.org/img/optimized/',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
      }
    );
    expect(getUrlShorteningParts()).toEqual([]);
  });
});

describe('NetworkChartRowBar MIME-type filter', function() {
  it('searches for img MIME-Type', function() {
    const { rowItem } = setupWithPayload(
      'Load 101: https://test.mozilla.org/img/optimized/test.png',
      {
        type: 'Network',
        URI: 'https://test.mozilla.org/img/optimized/test.png',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_STOP',
        startTime: 10,
        endTime: 90,
      }
    );
    expect(rowItem().classList.contains('networkChartRowItemImg')).toBe(true);
  });

  it('searches for html MIME-Type', function() {
    const { rowItem } = setupWithPayload(
      'Load 101: https://test.mozilla.org/img/optimized/test.html',
      {
        type: 'Network',
        URI: 'https://test.mozilla.org/img/optimized/test.html',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_STOP',
        startTime: 10,
        endTime: 90,
      }
    );

    expect(rowItem().classList.contains('networkChartRowItemHtml')).toBe(true);
  });

  it('searches for js MIME-Type', function() {
    const { rowItem } = setupWithPayload(
      'Load 101: https://test.mozilla.org/img/optimized/test.js',
      {
        type: 'Network',
        URI: 'https://test.mozilla.org/img/optimized/test.js',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_STOP',
        startTime: 10,
        endTime: 90,
      }
    );

    expect(rowItem().classList.contains('networkChartRowItemJs')).toBe(true);
  });

  it('searches for css MIME-Type', function() {
    const { rowItem } = setupWithPayload(
      'Load 101: https://test.mozilla.org/img/optimized/test.css',
      {
        type: 'Network',
        URI: 'https://test.mozilla.org/img/optimized/test.css',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_STOP',
        startTime: 10,
        endTime: 90,
      }
    );

    expect(rowItem().classList.contains('networkChartRowItemCss')).toBe(true);
  });

  it('uses default when no filter applies', function() {
    const { rowItem } = setupWithPayload(
      'Load 101: https://test.mozilla.org/img/optimized/test.xuul',
      {
        type: 'Network',
        URI: 'https://test.mozilla.org/img/optimized/test.xuul',
        id: 90001,
        pri: 20,
        count: 10,
        status: 'STATUS_STOP',
        startTime: 10,
        endTime: 90,
      }
    );

    expect(rowItem().className).toEqual('even networkChartRowItem ');
  });
});

describe('EmptyReasons', () => {
  it("shows a reason when a profile's network markers have been filtered out", () => {
    const profile = getProfileWithMarkers(NETWORK_MARKERS);
    const { dispatch, container } = setupWithProfile(profile);

    dispatch(changeSelectedTab('network-chart'));
    dispatch(changeNetworkSearchString('MATCH_NOTHING'));
    expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
  });
});
