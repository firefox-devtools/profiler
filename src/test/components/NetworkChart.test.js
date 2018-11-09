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

describe('NetworkChart', function() {
  it('renders NetworkChart correctly', () => {
    window.devicePixelRatio = 1;

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

    delete window.devicePixelRatio;
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
