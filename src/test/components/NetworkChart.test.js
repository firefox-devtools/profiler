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
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';

import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileWithMarkers,
  getNetworkMarkers,
  type TestDefinedMarkers,
} from '../fixtures/profiles/processed-profile';
import { getBoundingBox } from '../fixtures/utils';
import mockRaf from '../fixtures/mocks/request-animation-frame';

const NETWORK_MARKERS = (function() {
  const arrayOfNetworkMarkers = Array(10)
    .fill()
    .map((_, i) =>
      getNetworkMarkers({
        uri: 'https://mozilla.org/',
        id: i,
        startTime: 3 + 0.1 * i,
      })
    );
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
    .mockImplementation(() =>
      // We're adding the timeline margin to try to get some round numbers in
      // the tests.
      getBoundingBox(200 + TIMELINE_MARGIN_RIGHT + TIMELINE_MARGIN_LEFT, 300)
    );

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
      container.querySelectorAll('.networkChartRowItemLabel span')
    ).map(node => [node.className, node.textContent]);
  }

  const getPhaseElements = () =>
    Array.from(container.querySelectorAll('.networkChartRowItemBarPhase'));

  const getPhaseElementStyles = () =>
    getPhaseElements().map(element => element.getAttribute('style'));

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
    getPhaseElements,
    getPhaseElementStyles,
    rowItem,
  };
}

// create new function to get ProfileWithNetworkMarkers
function setupWithPayload(markers: TestDefinedMarkers) {
  const profile = getProfileWithMarkers(markers);
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
    const { getPhaseElementStyles } = setupWithPayload(
      getNetworkMarkers({
        uri: 'https://mozilla.org/img/',
        id: 100,
        startTime: 10,
        // With an endTime at 109, the profile's end time is 110, and so the
        // profile's length is 100, which gives integer values for test results.
        endTime: 109,
        payload: {
          pri: 20,
          count: 10,
          domainLookupStart: 20,
          domainLookupEnd: 24,
          connectStart: 25,
          tcpConnectEnd: 26,
          secureConnectionStart: 26,
          connectEnd: 28,
          requestStart: 30,
          responseStart: 60,
          responseEnd: 80,
        },
      })
    );

    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 20px; opacity: 0;',
      'left: 20px; width: 20px; opacity: 0.3333333333333333;',
      'left: 40px; width: 60px; opacity: 0.6666666666666666;',
      'left: 100px; width: 40px; opacity: 1;',
      'left: 140px; width: 58px; opacity: 0;',
    ]);
  });

  it('divides up the different phases of the request with subset of required information', () => {
    const { getPhaseElementStyles } = setupWithPayload(
      getNetworkMarkers({
        uri: 'https://mozilla.org/img/',
        id: 100,
        startTime: 10,
        // With an endTime at 109, the profile's end time is 110, and so the
        // profile's length is 100, which gives integer values for test results.
        endTime: 109,
        payload: {
          pri: 20,
          count: 10,
          requestStart: 20,
          responseStart: 60,
          responseEnd: 80,
        },
      })
    );

    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 20px; opacity: 0;',
      'left: 20px; width: 80px; opacity: 0.6666666666666666;',
      'left: 100px; width: 40px; opacity: 1;',
      'left: 140px; width: 58px; opacity: 0;',
    ]);
  });

  it('takes the full width when there is no details in the payload', () => {
    const { getPhaseElementStyles } = setupWithPayload(
      getNetworkMarkers({
        uri: 'https://mozilla.org/img/',
        id: 100,
        startTime: 10,
        // With an endTime at 109, the profile's end time is 110, and so the
        // profile's length is 100, which gives integer values for test results.
        endTime: 109,
      })
    );

    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 198px; opacity: 1;',
    ]);
  });

  it('divides the phases when only the start marker is present', () => {
    const markerForProfileRange = [
      'Some Marker',
      0,
      // With an endTime at 99, the profile's end time is 100 which gives
      // integer values for test results.
      { startTime: 0, endTime: 99 },
    ];

    const startMarker = getNetworkMarkers({
      uri: 'https://mozilla.org/img/',
      id: 100,
      startTime: 10,
      endTime: 60,
    })[0];

    const { getPhaseElementStyles } = setupWithPayload([
      markerForProfileRange,
      startMarker,
    ]);

    expect(getPhaseElementStyles()).toEqual([
      // The marker goes to the end of the profile range.
      'left: 0px; width: 180px; opacity: 1;',
    ]);
  });

  it('divides the phases when only the end marker is present', () => {
    const endMarker = getNetworkMarkers({
      uri: 'https://mozilla.org/img/',
      id: 100,
      startTime: 5,
      fetchStart: 10,
      // With an endTime at 109, the profile's end time is 110, and so the
      // profile's length is 100, which gives integer values for test results.
      endTime: 109,
      payload: {
        pri: 20,
        count: 10,
        domainLookupStart: 20,
        domainLookupEnd: 24,
        connectStart: 25,
        tcpConnectEnd: 26,
        secureConnectionStart: 26,
        connectEnd: 28,
        requestStart: 30,
        responseStart: 60,
        responseEnd: 80,
      },
    })[1];

    const { getPhaseElementStyles } = setupWithPayload([endMarker]);

    expect(getPhaseElementStyles()).toEqual([
      'left: 0px; width: 20px; opacity: 0;',
      'left: 20px; width: 20px; opacity: 0.3333333333333333;',
      'left: 40px; width: 60px; opacity: 0.6666666666666666;',
      'left: 100px; width: 40px; opacity: 1;',
      'left: 140px; width: 58px; opacity: 0;',
    ]);
  });
});

describe('NetworkChartRowBar URL split', function() {
  function setupForUrl(uri: string) {
    return setupWithPayload(getNetworkMarkers({ uri }));
  }

  it('splits up the url by protocol / domain / path / filename / params / hash', function() {
    const { getUrlShorteningParts } = setupForUrl(
      'https://test.mozilla.org/img/optimized/test.gif?param1=123&param2=321#hashNode2'
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

  it('splits properly a url without a path', function() {
    const testUrl = 'https://mozilla.org/';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriRequired', '/'],
    ]);
  });

  it('splits properly a url without a directory', function() {
    const testUrl = 'https://mozilla.org/index.html';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriRequired', '/index.html'],
    ]);
  });

  it('splits properly a url without a filename', function() {
    const testUrl = 'https://mozilla.org/analytics/';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriRequired', '/analytics/'],
    ]);
  });

  it('splits properly a url without a filename and a long directory', function() {
    const testUrl = 'https://mozilla.org/assets/analytics/';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriOptional', '/assets'],
      ['networkChartRowItemUriRequired', '/analytics/'],
    ]);
  });

  it('splits properly a url with a short directory path', function() {
    const testUrl = 'https://mozilla.org/img/image.jpg';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriOptional', '/img'],
      ['networkChartRowItemUriRequired', '/image.jpg'],
    ]);
  });

  it('splits properly a url with a long directory path', function() {
    const testUrl = 'https://mozilla.org/assets/img/image.jpg';
    const { getUrlShorteningParts } = setupForUrl(testUrl);
    expect(getUrlShorteningParts()).toEqual([
      ['networkChartRowItemUriOptional', 'https://'],
      ['networkChartRowItemUriRequired', 'mozilla.org'],
      ['networkChartRowItemUriOptional', '/assets/img'],
      ['networkChartRowItemUriRequired', '/image.jpg'],
    ]);
  });

  it('returns null with an invalid url', function() {
    const { getUrlShorteningParts } = setupForUrl(
      'test.mozilla.org/img/optimized/'
    );
    expect(getUrlShorteningParts()).toEqual([]);
  });
});

describe('NetworkChartRowBar MIME-type filter', function() {
  it('searches for img MIME-Type', function() {
    const { rowItem } = setupWithPayload(
      getNetworkMarkers({
        uri: 'https://test.mozilla.org/img/optimized/test.png',
      })
    );
    expect(rowItem().classList.contains('network-color-img')).toBe(true);
  });

  it('searches for html MIME-Type', function() {
    const { rowItem } = setupWithPayload(
      getNetworkMarkers({
        uri: 'https://test.mozilla.org/img/optimized/test.html',
      })
    );

    expect(rowItem().classList.contains('network-color-html')).toBe(true);
  });

  it('searches for js MIME-Type', function() {
    const { rowItem } = setupWithPayload(
      getNetworkMarkers({ uri: 'https://test.mozilla.org/scripts/test.js' })
    );

    expect(rowItem().classList.contains('network-color-js')).toBe(true);
  });

  it('searches for css MIME-Type', function() {
    const { rowItem } = setupWithPayload(
      getNetworkMarkers({ uri: 'https://test.mozilla.org/styles/test.css' })
    );

    expect(rowItem().classList.contains('network-color-css')).toBe(true);
  });

  it('uses default when no filter applies', function() {
    const { rowItem } = setupWithPayload(
      getNetworkMarkers({ uri: 'https://test.mozilla.org/file.xuul' })
    );

    expect(rowItem().classList.contains('network-color-other')).toBe(true);
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
