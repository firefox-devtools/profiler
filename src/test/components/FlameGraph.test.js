/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import FlameGraph from '../../components/flame-graph';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import {
  changeInvertCallstack,
  changeSelectedCallNode,
} from '../../actions/profile-view';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { ensureExists } from '../../utils/flow';

describe('FlameGraph', function() {
  function setup() {
    const flushRafCalls = mockRaf();
    window.devicePixelRatio = 1;
    const ctx = mockCanvasContext();

    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(200, 300));
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
    A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
    B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
    C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
    D[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
    E[cat:Graphics]  G[cat:Graphics]
  `);

    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;

    const { container } = render(
      <Provider store={store}>
        <FlameGraph />
      </Provider>
    );

    flushRafCalls();

    const getContentDiv = () =>
      ensureExists(
        container.querySelector('.flameGraphContent'),
        `Couldn't find the content div with selector .flameGraphContent`
      );

    return {
      getState,
      dispatch,
      container,
      ctx,
      getContentDiv,
      funcNames,
    };
  }

  it('matches the snapshot', () => {
    const { container, ctx } = setup();
    const drawCalls = ctx.__flushDrawLog();
    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();
  });

  it('renders a message instead when call stack is inverted', () => {
    const { container, dispatch } = setup();

    dispatch(changeInvertCallstack(true));

    expect(container.firstChild).toMatchSnapshot();
  });

  it('can be navigated with the keyboard', () => {
    const { getState, dispatch, getContentDiv, funcNames } = setup();
    const div = getContentDiv();

    function selectedNode() {
      const callNodeIndex = selectedThreadSelectors.getSelectedCallNodeIndex(
        getState()
      );
      return callNodeIndex && funcNames[callNodeIndex];
    }

    dispatch(changeSelectedCallNode(0, [0, 1] /* B */));

    expect(selectedNode()).toBe('B');

    fireEvent.keyDown(div, { key: 'ArrowUp' });

    expect(selectedNode()).toBe('C');

    fireEvent.keyDown(div, { key: 'ArrowRight' });

    expect(selectedNode()).toBe('H');

    fireEvent.keyDown(div, { key: 'ArrowLeft' });

    expect(selectedNode()).toBe('C');

    fireEvent.keyDown(div, { key: 'ArrowDown' });

    expect(selectedNode()).toBe('B');
  });
});
