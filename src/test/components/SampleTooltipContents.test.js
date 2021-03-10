/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import { Provider } from 'react-redux';
import { SampleTooltipContents } from 'firefox-profiler/components/shared/SampleTooltipContents';
import { render } from '@testing-library/react';
import {
  getCategories,
  getThreadSelectorsFromThreadsKey,
  getMaxThreadCPUDelta,
  getSampleUnits,
  getProfileInterval,
} from 'firefox-profiler/selectors';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileFromTextSamples,
  addCpuUsageValues,
} from '../fixtures/profiles/processed-profile';

import type { Profile } from 'firefox-profiler/types';

describe('SampleTooltipContents', function() {
  function setup(profile: Profile, hoveredSampleIndex: number) {
    const store = storeWithProfile(profile);
    const state = store.getState();
    const threadSelectors = getThreadSelectorsFromThreadsKey(0);
    const fullThread = threadSelectors.getRangeFilteredThread(state);
    const categories = getCategories(state);
    const sampleUnits = getSampleUnits(state);
    const maxThreadCPUDelta = getMaxThreadCPUDelta(state);
    const interval = getProfileInterval(state);

    render(
      <Provider store={store}>
        <SampleTooltipContents
          sampleIndex={hoveredSampleIndex}
          fullThread={fullThread}
          categories={categories}
          sampleUnits={sampleUnits}
          maxThreadCPUDelta={maxThreadCPUDelta}
          interval={interval}
        />
      </Provider>
    );
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

    setup(profile, hoveredSampleIndex);
    expect(document.body).toMatchSnapshot();
  });

  it('renders the sample with µs CPU usage information properly', () => {
    const { profile } = getProfileFromTextSamples(`
      A    A    A              A
      B    B    B              B
      Cjs  Cjs  H[cat:Layout]  H[cat:Layout]
      D    F    I[cat:Idle]
      Ejs  Ejs
    `);
    // Let's put some values for CPU usage.
    addCpuUsageValues(profile, [null, 400, 1000, 500], 'µs');

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    setup(profile, hoveredSampleIndex);

    expect(document.body).toMatchSnapshot();
  });

  it('renders the sample with ns CPU usage information properly', () => {
    const { profile } = getProfileFromTextSamples(`
      A    A    A              A
      B    B    B              B
      Cjs  Cjs  H[cat:Layout]  H[cat:Layout]
      D    F    I[cat:Idle]
      Ejs  Ejs
    `);
    // Let's put some values for CPU usage.
    addCpuUsageValues(profile, [null, 600000, 1000000, 500000], 'ns');

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    setup(profile, hoveredSampleIndex);

    expect(document.body).toMatchSnapshot();
  });

  it('renders the sample with "variable CPU cycles" CPU usage information properly', () => {
    const { profile } = getProfileFromTextSamples(`
      A    A    A              A
      B    B    B              B
      Cjs  Cjs  H[cat:Layout]  H[cat:Layout]
      D    F    I[cat:Idle]
      Ejs  Ejs
    `);
    // Let's put some values for CPU usage.
    addCpuUsageValues(profile, [null, 800, 1000, 500], 'variable CPU cycles');

    // Let's check the second threadCPUDelta value
    const hoveredSampleIndex = 1;
    setup(profile, hoveredSampleIndex);

    expect(document.body).toMatchSnapshot();
  });
});
