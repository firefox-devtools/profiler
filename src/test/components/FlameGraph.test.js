/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import FlameGraph from '../../components/flame-graph';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { changeInvertCallstack } from '../../actions/profile-view';
import mockRaf from '../fixtures/mocks/request-animation-frame';

it('renders FlameGraph correctly', () => {
  const flushRafCalls = mockRaf();
  window.devicePixelRatio = 1;
  const ctx = mockCanvasContext();

  /**
   * Mock out any created refs for the components with relevant information.
   */
  function createNodeMock(element) {
    // <FlameGraphCanvas><canvas /></FlameGraphCanvas>
    if (element.type === 'canvas') {
      return {
        getBoundingClientRect: () => getBoundingBox(200, 300),
        getContext: () => ctx,
        style: {},
      };
    }
    // <Viewport />
    if (element.props.className.split(' ').includes('chartViewport')) {
      return {
        getBoundingClientRect: () => getBoundingBox(200, 300),
        focus: () => {},
      };
    }
    return null;
  }

  const { profile } = getProfileFromTextSamples(`
    A  A  A
    B  B  B
    C  C  H
    D  F  I
    E  G
  `);

  const store = storeWithProfile(profile);

  const flameGraph = renderer.create(
    <Provider store={store}>
      <FlameGraph />
    </Provider>,
    { createNodeMock }
  );

  flushRafCalls();

  const drawCalls = ctx.__flushDrawLog();

  expect(flameGraph).toMatchSnapshot();
  expect(drawCalls).toMatchSnapshot();

  delete window.devicePixelRatio;
});

it('renders a message instead of FlameGraph when call stack is inverted', () => {
  const { profile } = getProfileFromTextSamples(`
    A  B
  `);

  const store = storeWithProfile(profile);
  store.dispatch(changeInvertCallstack(true));

  const flameGraph = renderer.create(
    <Provider store={store}>
      <FlameGraph />
    </Provider>
  );

  expect(flameGraph).toMatchSnapshot();
});
