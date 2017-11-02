/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ProfileViewerHeader from '../../components/header/ProfileViewerHeader';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { getBoundingBox } from '../fixtures/utils';
import ReactDOM from 'react-dom';

jest.useFakeTimers();
ReactDOM.findDOMNode = jest.fn(() => ({
  getBoundingClientRect: () => getBoundingBox(300, 300),
}));

describe('calltree/ProfileViewerHeader', function() {
  it('renders the header', () => {
    window.requestAnimationFrame = fn => setTimeout(fn, 0);
    window.devicePixelRatio = 1;
    const ctx = mockCanvasContext();
    /**
     * Mock out any created refs for the components with relevant information.
     */
    function createNodeMock(element) {
      // <TimelineCanvas><canvas /></TimelineCanvas>
      if (element.type === 'canvas') {
        return {
          getBoundingClientRect: () => getBoundingBox(200, 300),
          getContext: () => ctx,
          style: {},
        };
      }
      return null;
    }

    const { profile } = getProfileFromTextSamples(`
      A A A
      B B B
      C C H
      D F I
      E G
    `);

    const header = renderer.create(
      <Provider store={storeWithProfile(profile)}>
        <ProfileViewerHeader />
      </Provider>,
      { createNodeMock }
    );

    // Flush any requestAnimationFrames.
    jest.runAllTimers();

    const drawCalls = ctx.__flushDrawLog();

    expect(header.toJSON()).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    delete window.requestAnimationFrame;
    delete window.devicePixelRatio;
  });
});
