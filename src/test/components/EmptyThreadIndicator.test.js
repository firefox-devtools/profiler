/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ReactDOM from 'react-dom';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import {
  EmptyThreadIndicator,
  getIndicatorPositions,
} from '../../components/timeline/EmptyThreadIndicator';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { getElementWithFixedSize } from '../fixtures/mocks/element-size';

import type { StartEndRange } from 'firefox-profiler/types';

describe('EmptyThreadIndicator', function () {
  // Sizing for the containing dom node.
  const width = 100;
  const height = 10;

  beforeEach(() => {
    jest
      .spyOn(ReactDOM, 'findDOMNode')
      .mockImplementation(() => getElementWithFixedSize({ width, height }));
  });

  const { derivedThreads } = getProfileFromTextSamples(`
    A  A  A
  `);

  const thread = derivedThreads[0];
  thread.processStartupTime = 2;
  thread.processShutdownTime = 10;
  thread.registerTime = 3;
  thread.unregisterTime = 9;
  thread.samples.time = [5, 6, 7];

  // Make it really easy to generate the component's props.
  function propsFromViewportRange(viewport: StartEndRange) {
    return {
      rangeStart: viewport.start,
      rangeEnd: viewport.end,
      thread: thread,
      interval: 0.1,
      unfilteredSamplesRange: { start: 5, end: 8 },
      width,
      height: 10,
    };
  }

  describe('rendering', function () {
    it('matches the snapshot when rendering all three types of indicators', () => {
      const props = propsFromViewportRange({ start: 0, end: 10 });

      const flushRafCalls = mockRaf(); // WithSize uses requestAnimationFrame
      const { container } = render(
        // The props have to be passed in manually to avoid adding the SizeProps.
        <EmptyThreadIndicator
          rangeStart={props.rangeStart}
          rangeEnd={props.rangeEnd}
          thread={props.thread}
          interval={props.interval}
          unfilteredSamplesRange={props.unfilteredSamplesRange}
        />
      );
      flushRafCalls();

      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot when rendering no indicators', () => {
      // This range has samples throughout it.
      const props = propsFromViewportRange({ start: 5.5, end: 6.5 });

      const flushRafCalls = mockRaf(); // WithSize uses requestAnimationFrame
      const { container } = render(
        // The props have to be passed in manually to avoid adding the SizeProps.
        <EmptyThreadIndicator
          rangeStart={props.rangeStart}
          rangeEnd={props.rangeEnd}
          thread={props.thread}
          interval={props.interval}
          unfilteredSamplesRange={props.unfilteredSamplesRange}
        />
      );
      flushRafCalls();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('startup empty thread indicator', function () {
    // Thread startup is between 0 and 3 seconds in the mock data. In addition the space
    // is 100px wide.

    it('is 30% on screen when zoomed all the way out', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  viewport |------------------------------|
      //  startup  |--------|
      const { startup } = getIndicatorPositions(
        propsFromViewportRange({ start: 0, end: 10 })
      );
      expect(startup).toEqual({ left: 0, width: 30 });
    });

    it('is 100% on screen zoomed far into the startup time', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  viewport |-----|
      //  startup  |--------|
      const { startup } = getIndicatorPositions(
        propsFromViewportRange({ start: 0, end: 2 })
      );
      expect(startup).toEqual({ left: 0, width: 100 });
    });

    it('is not shown when the viewport isn’t in range', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  viewport             |------------------|
      //  startup  |--------|
      const { startup } = getIndicatorPositions(
        propsFromViewportRange({ start: 4, end: 10 })
      );
      expect(startup).toEqual(null);
    });
  });

  describe('shutdown empty thread indicator', function () {
    // Thread startup is between 0 and 3 seconds in the mock data. In addition the space
    // is 100px wide.

    it('is on screen when zoomed all the way out', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  viewport |------------------------------|
      //  shutdown                            |---|
      const { shutdown } = getIndicatorPositions(
        propsFromViewportRange({ start: 0, end: 10 })
      );
      // It takes up 30% of the view.
      expect(shutdown).toEqual({ right: 0, width: 10 });
    });

    it('is 100% on screen zoomed far into shutdown time', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  viewport                             |-|
      //  shutdown                            |---|
      const { shutdown } = getIndicatorPositions(
        propsFromViewportRange({ start: 9.2, end: 9.8 })
      );
      // It takes up 100% of the view.
      expect(shutdown).toEqual({ right: 0, width: 100 });
    });

    it('is not shown when the viewport isn’t in range', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  viewport |--------------|
      //  shutdown                            |---|
      const { shutdown } = getIndicatorPositions(
        propsFromViewportRange({ start: 0, end: 5 })
      );
      // It takes up 100% of the view.
      expect(shutdown).toEqual(null);
    });
  });

  describe('empty buffer start indicator', function () {
    // Thread startup is between 0 and 3 seconds in the mock data. In addition the space
    // is 100px wide.

    it('in range during and after', () => {
      //           0  1  2  3  4  5  6  7  8  9 10
      //  registered        |-----------------|
      //  samples                 |--------|
      //  viewport             |-----------------|
      //  empty                |--|
      const { emptyBufferStart } = getIndicatorPositions(
        propsFromViewportRange({ start: 4, end: 10 })
      );

      // Break the assertion down
      expect(emptyBufferStart && emptyBufferStart.left).toEqual(0);
      expect(emptyBufferStart && emptyBufferStart.width).toBeCloseTo(16.66666);
    });

    it('in range during and before', () => {
      //           0  1  2  3  4  5  6  7  8  9 10
      //  registered        |-----------------|
      //  samples                 |--------|
      //  viewport |--------------|
      //  empty             |-----|
      const { emptyBufferStart } = getIndicatorPositions(
        propsFromViewportRange({ start: 0, end: 5 })
      );

      // Break the assertion down
      expect(emptyBufferStart).toEqual({ left: 60, width: 40 });
    });

    it('is on screen when zoomed all the way out', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  registered        |-----------------|
      //  samples                 |--------|
      //  viewport |------------------------------|
      //  empty             |-----|
      const { emptyBufferStart } = getIndicatorPositions(
        propsFromViewportRange({ start: 0, end: 10 })
      );
      // It takes up 30% of the view.
      expect(emptyBufferStart).toEqual({ left: 30, width: 20 });
    });

    it('is 100% on screen zoomed far into emptyBufferStart time', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  registered        |-----------------|
      //  samples                 |--------|
      //  viewport           |--|
      //  empty              |--|
      const { emptyBufferStart } = getIndicatorPositions(
        propsFromViewportRange({ start: 3.5, end: 4.5 })
      );
      // It takes up 100% of the view.
      expect(emptyBufferStart).toEqual({ left: 0, width: 100 });
    });

    it('is not shown when the viewport isn’t in range before', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  registered        |-----------------|
      //  samples                 |--------|
      //  viewport |-----|
      //  empty             none in range
      const { emptyBufferStart } = getIndicatorPositions(
        propsFromViewportRange({ start: 0, end: 2 })
      );
      // It takes up 100% of the view.
      expect(emptyBufferStart).toEqual(null);
    });

    it('is not shown when the viewport isn’t in range after', () => {
      //           0  1  2  3  4  5  6  7  8  9  10
      //  registered        |-----------------|
      //  samples                 |--------|
      //  viewport                   |-----|
      //  empty             none in range
      const { emptyBufferStart } = getIndicatorPositions(
        propsFromViewportRange({ start: 6, end: 8 })
      );
      // It takes up 100% of the view.
      expect(emptyBufferStart).toEqual(null);
    });
  });
});
