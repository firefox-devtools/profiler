/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import Timeline from '../../components/timeline';
import renderer from 'react-test-renderer';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { getBoundingBox } from '../fixtures/utils';
import ReactDOM from 'react-dom';

import type { Profile } from '../../types/profile';

function _getProfileWithDroppedSamples(): Profile {
  const { profile } = getProfileFromTextSamples(
    // The base thread is 9 samples long.
    '1  2  3  4  5  6  7  8  9',
    // Create a second thread where `x` is when the thread wasn't yet initialized
    // and where e is an empty sample. The profile fixture will be mutated below
    // to follow this.
    `
      x  x  e  e  A  A  A  x  x
                  B  B  B
                  C  C  H
                  D  F  I
                  E  G
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

describe('Timeline', function() {
  beforeEach(() => {
    jest.spyOn(ReactDOM, 'findDOMNode').mockImplementation(() => {
      // findDOMNode uses nominal typing instead of structural (null | Element | Text), so
      // opt out of the type checker for this mock by returning `any`.
      const mockEl = ({
        getBoundingClientRect: () => getBoundingBox(300, 300),
      }: any);
      return mockEl;
    });

    // Mock out the 2d canvas for the loupe view.
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => mockCanvasContext());
  });
  it('renders the header', () => {
    const flushRafCalls = mockRaf();
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
        <Timeline />
      </Provider>,
      { createNodeMock }
    );

    // We need to flush twice since when the first flush is run, it
    // will request more code to be run in later animation frames.
    flushRafCalls();
    flushRafCalls();

    const drawCalls = ctx.__flushDrawLog();

    expect(header.toJSON()).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    delete window.devicePixelRatio;
  });
});
