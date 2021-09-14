/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { TimelineTrackThread } from 'firefox-profiler/components/timeline/TrackThread';
import { render, screen, fireEvent } from '@testing-library/react';
import { ensureExists } from 'firefox-profiler/utils/flow';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileFromTextSamples,
  addCpuUsageValues,
} from '../fixtures/profiles/processed-profile';
import {
  getMouseEvent,
  addRootOverlayElement,
  removeRootOverlayElement,
} from '../fixtures/utils';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';

import type {
  Profile,
  IndexIntoSamplesTable,
  CssPixels,
  ThreadCPUDeltaUnit,
} from 'firefox-profiler/types';

// The following constants determine the size of the drawn graph.
const SAMPLE_COUNT = 4;
const PIXELS_PER_SAMPLE = 40;
const GRAPH_WIDTH = Math.floor(PIXELS_PER_SAMPLE * SAMPLE_COUNT);
const GRAPH_HEIGHT = 10;
function getSamplesPixelPosition(
  sampleIndex: IndexIntoSamplesTable,
  samplePosition: 'before' | 'after' = 'before'
): CssPixels {
  const quarterSample = PIXELS_PER_SAMPLE / 4;
  // Compute the pixel position of either first or the second part of the sample.
  // "sampleIndex * PIXELS_PER_SAMPLE" corresponds to the center of the sample,
  //  we need to +/- quarter sample to find these places in the sample:
  //
  //                       before     after
  //                       50% CPU    100% CPU
  //                           v         v
  // +--------------------+--------------------+--------------------+
  // |                    |          //////////|                    |
  // +--------------------+////////////////////+--------------------+
  const beforeOrAfter =
    samplePosition === 'before' ? -quarterSample : +quarterSample;
  return sampleIndex * PIXELS_PER_SAMPLE + beforeOrAfter;
}

describe('SampleTooltipContents', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  beforeEach(addRootOverlayElement);
  afterEach(removeRootOverlayElement);

  function getProfileWithCPU(
    threadCPUDelta: Array<number | null>,
    threadCPUDeltaUnit: ThreadCPUDeltaUnit
  ): Profile {
    const { profile } = getProfileFromTextSamples(`
      A    A    A              A
      B    B    B              B
      Cjs  Cjs  H[cat:Layout]  H[cat:Layout]
      D    F    I[cat:Idle]
      Ejs  Ejs
    `);
    // Let's put some values for CPU usage.
    addCpuUsageValues(profile, threadCPUDelta, threadCPUDeltaUnit);

    return profile;
  }

  function setup(
    profile: Profile,
    hoveredSampleIndex: number,
    hoveredSamplePosition: 'before' | 'after' = 'before'
  ) {
    const store = storeWithProfile(profile);
    const threadsKey = 0;

    // WithSize uses requestAnimationFrame
    const flushRafCalls = mockRaf();
    const { container } = render(
      <Provider store={store}>
        <TimelineTrackThread
          threadsKey={threadsKey}
          trackType="expanded"
          trackName="Test Track"
        />
      </Provider>
    );
    flushRafCalls();

    const canvas = ensureExists(
      container.querySelector('.threadActivityGraphCanvas'),
      `Couldn't find the activity graph canvas, with selector .threadActivityGraphCanvas`
    );

    fireEvent(
      canvas,
      getMouseEvent('mousemove', {
        offsetX: getSamplesPixelPosition(
          hoveredSampleIndex,
          hoveredSamplePosition
        ),
        offsetY: GRAPH_HEIGHT * 0.9,
      })
    );
    flushRafCalls();

    const getTooltip = () =>
      ensureExists(
        document.querySelector('.tooltip'),
        `Couldn't find the tooltip element, with selector .tooltip`
      );

    return { getTooltip };
  }

  it('renders the sample tooltip properly', () => {
    const { profile } = getProfileFromTextSamples(`
      _main
      XRE_main
      XREMain::XRE_main
      XREMain::XRE_mainRun
      nsAppStartup::Run
      nsAppShell::Run
      ChildViewMouseTracker::MouseMoved
      nsChildView::DispatchEvent
      nsView::HandleEvent
      nsViewManager::DispatchEvent
      mozilla::PresShell::HandleEvent
      mozilla::PresShell::HandlePositionedEvent
      mozilla::PresShell::HandleEventInternal
      mozilla::EventStateManager::PreHandleEvent
      mozilla::EventStateManager::GenerateMouseEnterExit
      mozilla::EventStateManager::NotifyMouseOut
      mozilla::EventStateManager::SetContentState
      mozilla::EventStateManager::UpdateAncestorState
      mozilla::dom::Element::RemoveStates
      nsDocument::ContentStateChanged
      mozilla::PresShell::ContentStateChanged
      mozilla::GeckoRestyleManager::ContentStateChanged
      mozilla::GeckoRestyleManager::PostRestyleEvent
      nsRefreshDriver::AddStyleFlushObserver[cat:Layout]
    `);
    // There is only one sample in the profile
    const hoveredSampleIndex = 0;

    const { getTooltip } = setup(profile, hoveredSampleIndex, 'after');
    expect(getTooltip()).toMatchSnapshot();
  });

  it('renders the sample with µs CPU usage information properly', () => {
    const profile = getProfileWithCPU([null, 400, 1000, 500], 'µs');

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    const { getTooltip } = setup(profile, hoveredSampleIndex);

    const cpuUsage = ensureExists(screen.getByText(/CPU/).nextElementSibling);
    expect(cpuUsage).toHaveTextContent('40% (average over 1.0ms)');
    expect(getTooltip()).toMatchSnapshot();
  });

  it('renders the sample with ns CPU usage information properly', () => {
    const profile = getProfileWithCPU([null, 600000, 1000000, 500000], 'ns');

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    const { getTooltip } = setup(profile, hoveredSampleIndex);

    const cpuUsage = ensureExists(screen.getByText(/CPU/).nextElementSibling);
    expect(cpuUsage).toHaveTextContent('60% (average over 1.0ms)');
    expect(getTooltip()).toMatchSnapshot();
  });

  it('renders the sample with "variable CPU cycles" CPU usage information properly', () => {
    const profile = getProfileWithCPU(
      [null, 800, 900, 500],
      'variable CPU cycles'
    );

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    const { getTooltip } = setup(profile, hoveredSampleIndex);

    const cpuUsage = ensureExists(screen.getByText(/CPU/).nextElementSibling);
    expect(cpuUsage).toHaveTextContent('89% (average over 1.0ms)');
    expect(getTooltip()).toMatchSnapshot();
  });

  it('renders the CPU usage properly for the first part of the sample', () => {
    const profile = getProfileWithCPU([null, 460, 1000, 500], 'µs');

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    // Hovering the first part of the sample.
    setup(profile, hoveredSampleIndex, 'before');

    const cpuUsage = ensureExists(screen.getByText(/CPU/).nextElementSibling);
    expect(cpuUsage).toHaveTextContent('46% (average over 1.0ms)');
  });

  it('renders the CPU usage properly for the second part of the sample', () => {
    const profile = getProfileWithCPU([null, 400, 580, 1000], 'µs');

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    // Hovering the second part of the sample.
    setup(profile, hoveredSampleIndex, 'after');

    const cpuUsage = ensureExists(screen.getByText(/CPU/).nextElementSibling);
    expect(cpuUsage).toHaveTextContent('58% (average over 1.0ms)');
  });

  it('renders the CPU usage properly for the first part of the sample with irregular sample times', () => {
    // Normally there should be 4 samples in the profile. But second sample
    // takes spaces for 2 samples.
    const profile = getProfileWithCPU([null, 800, 1000], 'µs');
    profile.threads[0].samples.time = [0, 2, 3];
    profile.threads[0].samples.length = 3;

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    // Hovering the second part of the sample.
    setup(profile, hoveredSampleIndex, 'before');

    const cpuUsage = ensureExists(screen.getByText(/CPU/).nextElementSibling);
    expect(cpuUsage).toHaveTextContent('40% (average over 1.0ms)');
  });

  it('renders the CPU usage properly for the second part of the sample with when there is a missing sample', () => {
    // Normally there should be 4 samples in the profile. But third sample
    // takes spaces for 2 samples.
    const profile = getProfileWithCPU([null, 1000, 800], 'µs');
    profile.threads[0].samples.time = [0, 1, 3];
    profile.threads[0].samples.length = 3;

    // We should make sure that the CPU heights are rendered correctly even
    // though we have missing samples:
    //                          this is the checked location
    //        100%              v
    //  //////////////////                40%
    //  //////////////////////////////////////////////////////
    // +-----------------+-----------------+-----------------+
    //                   ^100% CPU         ^ missing sample  ^ 40% CPU
    //                    sample                               sample

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    // Hovering the second part of the sample.
    setup(profile, hoveredSampleIndex, 'after');

    const cpuUsage = ensureExists(screen.getByText(/CPU/).nextElementSibling);
    expect(cpuUsage).toHaveTextContent('40% (average over 1.0ms)');
  });
});
