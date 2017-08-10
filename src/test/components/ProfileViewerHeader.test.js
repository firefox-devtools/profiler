/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import ProfileViewerHeader from '../../components/header/ProfileViewerHeader';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileForUnfilteredCallTree } from '../fixtures/profiles/profiles-for-call-trees';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import MockedReactDOM from 'react-dom';

jest.useFakeTimers();

describe('calltree/ProfileCallTreeView', function() {
  (MockedReactDOM: any).__findDOMNode = function(component) {
    // Mock out the findDOMNode call for WithSize.
    if (
      component.props &&
      component.props.className === 'profileViewerHeader'
    ) {
      return { getBoundingClientRect: () => _getBoundingBox(300, 300) };
    } else {
      throw new Error(
        'Another findDOMNode call needs to be mocked out for this test.'
      );
    }
  };

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
          getBoundingClientRect: () => _getBoundingBox(200, 300),
          getContext: () => ctx,
          style: {},
        };
      }
      return null;
    }

    const header = renderer.create(
      <Provider store={storeWithProfile(getProfileForUnfilteredCallTree())}>
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

function _getBoundingBox(width, height) {
  return {
    width,
    height,
    left: 0,
    x: 0,
    top: 0,
    y: 0,
    right: width,
    bottom: height,
  };
}
