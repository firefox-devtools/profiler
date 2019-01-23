/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import FlameGraph from '../../components/flame-graph';
import { render } from 'react-testing-library';
import { Provider } from 'react-redux';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { changeInvertCallstack } from '../../actions/profile-view';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { mockPrototype } from '../fixtures/mocks/prototype';

describe('FlameGraph', function() {
  it('renders FlameGraph correctly', () => {
    const flushRafCalls = mockRaf();
    window.devicePixelRatio = 1;
    const ctx = mockCanvasContext();

    mockPrototype(HTMLElement.prototype, 'getBoundingClientRect', () =>
      getBoundingBox(200, 300)
    );

    mockPrototype(HTMLCanvasElement.prototype, 'getContext', () => ctx);

    const { profile } = getProfileFromTextSamples(`
      A[cat:DOM]       A[cat:DOM]       A[cat:DOM]
      B[cat:DOM]       B[cat:DOM]       B[cat:DOM]
      C[cat:Graphics]  C[cat:Graphics]  H[cat:Network]
      D[cat:Graphics]  F[cat:Graphics]  I[cat:Network]
      E[cat:Graphics]  G[cat:Graphics]
    `);

    const store = storeWithProfile(profile);

    const { container } = render(
      <Provider store={store}>
        <FlameGraph />
      </Provider>
    );

    flushRafCalls();

    const drawCalls = ctx.__flushDrawLog();

    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    delete window.devicePixelRatio;
  });

  it('renders a message instead of FlameGraph when call stack is inverted', () => {
    const { profile } = getProfileFromTextSamples(`
      A  B
    `);

    const store = storeWithProfile(profile);
    store.dispatch(changeInvertCallstack(true));

    const { container } = render(
      <Provider store={store}>
        <FlameGraph />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
