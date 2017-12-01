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

import type { Profile } from '../../types/profile';

jest.useFakeTimers();
ReactDOM.findDOMNode = jest.fn(() => ({
  getBoundingClientRect: () => getBoundingBox(300, 300),
}));

function _getProfileWithDroppedSamples(): Profile {
  const { profile } = getProfileFromTextSamples(
    // The base thread is 9 samples long.
    '1 2 3 4 5 6 7 8 9',
    // Create a second thread where `x` is when the thread wasn't yet initialized
    // and where e is an empty sample. The profile fixture will be mutated below
    // to follow this.
    `
      x x e e A A A x x
              B B B
              C C H
              D F I
              E G
    `
  );

  const [thread1, thread2] = profile.threads;

  // Manually choose the timings:
  const sampleStartIndex = 2;
  const sampleEndIndex = 7;
  Object.assign(thread2, {
    processStartupTime: thread2.samples.time[sampleStartIndex],
    registerTime: thread2.samples.time[sampleStartIndex],
    processShutdownTime: thread2.samples.time[sampleEndIndex],
    unregisterTime: null,
  });
  thread1.name = 'Main Thread';
  thread2.name = 'Thread with dropped samples';

  // Remove the samples that contain 'x' and 'e'.
  {
    const samples = thread2.samples;
    for (const key in samples) {
      if (samples.hasOwnProperty(key) && Array.isArray(samples[key])) {
        // Slice just the stacks we care about, simulating a thread that was started
        // later, and with dropped data in its buffer.
        samples[key] = samples[key].slice(4, 7);
      }
    }
  }
  thread2.samples.length = thread2.samples.time.length;

  profile.threads.push(thread2);
  return profile;
}

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

    const profile = _getProfileWithDroppedSamples();

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
