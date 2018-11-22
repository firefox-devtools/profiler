/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { mount } from 'enzyme';
import { Provider } from 'react-redux';

import { changeMarkersSearchString } from '../../actions/profile-view';
import NetworkChart from '../../components/network-chart';
import { changeSelectedTab } from '../../actions/app';

import EmptyReasons from '../../components/shared/EmptyReasons';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileWithMarkers,
  getNetworkMarker,
} from '../fixtures/profiles/make-profile';
import { getBoundingBox } from '../fixtures/utils';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { type NetworkPayload } from '../../types/markers';

const NETWORK_MARKERS = Array(10)
  .fill()
  .map((_, i) => getNetworkMarker(3 + 0.1 * i, i));

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

  const networkChart = mount(
    <Provider store={store}>
      <NetworkChart />
    </Provider>
  );

  return {
    networkChart,
    flushRafCalls,
    dispatch: store.dispatch,
    flushDrawLog: () => ctx.__flushDrawLog(),
  };
}

// create new function to get ProfileWithNetworkMarkers
function setupWithPayload(name: string, payload: NetworkPayload) {
  const profile = getProfileWithMarkers([[name, 0, payload]]);
  const { flushRafCalls, dispatch, networkChart } = setupWithProfile(profile);

  dispatch(changeSelectedTab('network-chart'));
  networkChart.update();
  flushRafCalls();

  return { networkChart };
}

describe('NetworkChart', function() {
  it('renders NetworkChart correctly', () => {
    const profile = getProfileWithMarkers([...NETWORK_MARKERS]);
    const {
      flushRafCalls,
      dispatch,
      networkChart,
      flushDrawLog,
    } = setupWithProfile(profile);

    dispatch(changeSelectedTab('network-chart'));
    networkChart.update();
    flushRafCalls();

    const drawCalls = flushDrawLog();
    expect(networkChart).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();
  });
});

describe('NetworkChartRowBar phase calculations', function() {
  it('divides up the different phases of the request with full set of required information', () => {
    const { networkChart } = setupWithPayload(
      'Load 100: https://test.mozilla.org',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        connectStart: 20,
        startTime: 10,
        endTime: 90,
        requestStart: 20,
        responseStart: 60,
        responseEnd: 80,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      networkChart.find('.networkChartRowItemBarRequestQueue').prop('style')
    ).toHaveProperty('width', '12.5%');
    expect(
      networkChart.find('.networkChartRowItemBarRequest').prop('style')
    ).toHaveProperty('width', '50%');
    expect(
      networkChart.find('.networkChartRowItemBarResponse').prop('style')
    ).toHaveProperty('width', '25%');
  });

  it('divides up the different phases of the request with subset of required information', () => {
    const { networkChart } = setupWithPayload(
      'Load 101: https://test.mozilla.org',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        connectStart: 20,
        startTime: 10,
        endTime: 90,
        responseStart: 60,
        responseEnd: 80,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      networkChart.find('.networkChartRowItemBarRequestQueue').prop('style')
    ).toHaveProperty('width', '12.5%');
    expect(
      networkChart.find('.networkChartRowItemBarRequest').prop('style')
    ).toHaveProperty('width', '0%');
    expect(
      networkChart.find('.networkChartRowItemBarResponse').prop('style')
    ).toHaveProperty('width', '25%');
  });

  it('divides up the different phases of the request with no set of required information', () => {
    const { networkChart } = setupWithPayload(
      'Load 101: https://test.mozilla.org',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      networkChart.find('.networkChartRowItemBarRequestQueue').prop('style')
    ).toHaveProperty('width', '0%');
    expect(
      networkChart.find('.networkChartRowItemBarRequest').prop('style')
    ).toHaveProperty('width', '0%');
    expect(
      networkChart.find('.networkChartRowItemBarResponse').prop('style')
    ).toHaveProperty('width', '100%');
  });
});

describe('NetworkChartRowBar URL split', function() {
  it('splits up the url by protocol / domain / path / filemane / params / hash', function() {
    const { networkChart } = setupWithPayload(
      'Load 101: https://test.mozilla.org/img/optimized/test.gif?param1=123&param2=321#hashNode2',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      // Find the URL shortening parts
      networkChart
        .find('.networkChartRowItemLabel span span')
        .map(node => [node.prop('className'), node.text()])
    ).toEqual([
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
    const { networkChart } = setupWithPayload(
      'Load 101: test.mozilla.org/img/optimized/',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      // Find the URL shortening parts
      networkChart
        .find('.networkChartRowItemLabel span span')
        .map(node => [node.prop('className'), node.text()])
    ).toEqual([]);
  });
});

describe('NetworkChartRowBar MIME-type filter', function() {
  it('searches for img MIME-Type', function() {
    const { networkChart } = setupWithPayload(
      'Load 101: htps://test.mozilla.org/img/optimized/test.png',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/test123.png',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      // Find the URL shortening parts
      networkChart
        .find('.networkChartRowItem')
        .map(node => node.prop('className'))
    ).toEqual(['even networkChartRowItem networkChartRowItemImg']);
  });

  it('searches for html MIME-Type', function() {
    const { networkChart } = setupWithPayload(
      'Load 101: htps://test.mozilla.org/img/optimized/test.html',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/test123.png',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      // Find the URL shortening parts
      networkChart
        .find('.networkChartRowItem')
        .map(node => node.prop('className'))
    ).toEqual(['even networkChartRowItem networkChartRowItemHtml']);
  });

  it('searches for js MIME-Type', function() {
    const { networkChart } = setupWithPayload(
      'Load 101: htps://test.mozilla.org/img/optimized/test.js',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/test123.png',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      // Find the URL shortening parts
      networkChart
        .find('.networkChartRowItem')
        .map(node => node.prop('className'))
    ).toEqual(['even networkChartRowItem networkChartRowItemJs']);
  });

  it('searches for css MIME-Type', function() {
    const { networkChart } = setupWithPayload(
      'Load 101: htps://test.mozilla.org/img/optimized/test.css',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/test123.png',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      // Find the URL shortening parts
      networkChart
        .find('.networkChartRowItem')
        .map(node => node.prop('className'))
    ).toEqual(['even networkChartRowItem networkChartRowItemCss']);
  });

  it('uses default when no filter applies', function() {
    const { networkChart } = setupWithPayload(
      'Load 101: htps://test.mozilla.org/img/optimized/test.xuul',
      {
        type: 'Network',
        URI: 'https://mozilla.org/img/test123.png',
        RedirectURI: 'https://mozilla.org/img/optimized',
        id: 90001,
        pri: 20,
        count: 10,
        dur: 100,
        status: 'STATUS_REDIRECT',
        startTime: 10,
        endTime: 90,
        title: 'Load 100',
        name: 'Name',
      }
    );
    expect(
      // Find the URL shortening parts
      networkChart
        .find('.networkChartRowItem')
        .map(node => node.prop('className'))
    ).toEqual(['even networkChartRowItem ']);
  });
});

describe('EmptyReasons', () => {
  it("shows a reason when a profile's network markers have been filtered out", () => {
    const profile = getProfileWithMarkers(NETWORK_MARKERS);
    const { dispatch, networkChart } = setupWithProfile(profile);

    dispatch(changeSelectedTab('network-chart'));
    dispatch(changeMarkersSearchString('MATCH_NOTHING'));
    networkChart.update();
    expect(networkChart.find(EmptyReasons)).toMatchSnapshot();
  });
});
