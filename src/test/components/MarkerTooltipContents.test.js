/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { Fragment } from 'react';
import { Provider } from 'react-redux';
import MarkersTooltipContents from '../../components/shared/MarkerTooltipContents';
import renderer from 'react-test-renderer';
import { storeWithProfile } from '../fixtures/stores';
import {
  addMarkersToProfileReplacingSamples,
  getProfileFromTextSamples,
} from '../fixtures/profiles/make-profile';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';

describe('MarkerTooltipContents', function() {
  it('renders tooltips for various markers', () => {
    // First, create a profile with one stack, so that the stack table contains
    // something that we can refer to from the CauseBacktrace of a marker.
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
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
      nsRefreshDriver::AddStyleFlushObserver
    `);

    profile.threads[0].name = 'Main Thread';

    // Now add some markers to the profile.
    // Enumerate through all of the switch arms of the tooltip for coverage.
    addMarkersToProfileReplacingSamples(
      [
        [
          'DOMEvent',
          10.5,
          {
            type: 'DOMEvent',
            startTime: 10.5,
            endTime: 11.3,
            eventType: 'commandupdate',
            phase: 2,
          },
        ],
        [
          'UserTiming',
          12.5,
          {
            type: 'UserTiming',
            startTime: 12.5,
            endTime: 12.5,
            name: 'foobar',
            entryType: 'mark',
          },
        ],
        [
          'NotifyDidPaint',
          14.5,
          {
            type: 'tracing',
            startTime: 14.5,
            endTime: 14.5,
            category: 'Paint',
            interval: 'start',
            name: 'NotifyDidPaint',
          },
        ],
        [
          'GCMinor',
          15.5,
          {
            type: 'GCMinor',
            startTime: 15.5,
            endTime: 15.5,
            // nursery is only present in newer profile format.
            nursery: {
              reason: 'CC_WAITING',
              status: 'complete',
              bytes_tenured: 4 * 1024 * 1024,
              bytes_used: 8 * 1024 * 1024,
              new_capacity: 16 * 1024 * 1024,
              lazy_capacity: 12 * 1024 * 1024,
              phase_times: {},
            },
          },
        ],
        [
          'GCMajor',
          16.5,
          {
            type: 'GCMajor',
            startTime: 16.5,
            endTime: 16.5,
            timings: {
              status: 'completed',
              max_pause: 103.65,
              total_time: 157.215,
              reason: 'CC_WAITING',
              zones_collected: 3,
              total_zones: 5,
              total_compartments: 79,
              minor_gcs: 9,
              store_buffer_overflows: 5,
              slices: 13,
              scc_sweep_total: 160,
              scc_sweep_max_pause: 150,
              nonincremental_reason: 'Non incremental reason',
              allocated_bytes: 16 * 1024 * 1024,
              added_chunks: 5,
              removed_chunks: 2,
              major_gc_number: 1,
              minor_gc_number: 2,
              slice_number: 5,
              mmu_20ms: 0,
              mmu_50ms: 0,
              phase_times: {},
            },
          },
        ],
        [
          'GCSlice',
          17.5,
          {
            type: 'GCSlice',
            startTime: 17.5,
            endTime: 17.5,
            timings: {
              reason: 'CC_WAITING',
              slice: 1,
              pause: 5,
              when: 17.5,
              budget: 11,
              initial_state: 'Initial',
              final_state: 'Final',
              major_gc_number: 1,
              page_faults: 1,
              start_timestamp: 17,
              end_timestamp: 17,
              phase_times: {},
            },
          },
        ],
        [
          'Bailout_ShapeGuard after getelem on line 3666 of resource://foo.js -> resource://bar.js:3662',
          10,
          null,
        ],
        ['Invalidate http://mozilla.com/script.js:1234', 10, null],
        [
          'Styles',
          18.5,
          {
            type: 'tracing',
            category: 'Paint',
            interval: 'start',
            cause: {
              time: 17.0,
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
            // The startTime and endTime properties are currently required by
            // our flow type annotations, but those annotations are wrong:
            // Actual Gecko profiles won't have these properties in their
            // tracing markers. The flow types should really be fixed, but I had
            // some trouble when I tried to do that so I deferred it to some
            // later point.
            startTime: 18.5,
            endTime: 18.5,
          },
        ],
        [
          'Styles',
          19,
          {
            type: 'tracing',
            category: 'Paint',
            interval: 'end',
            // startTime and endTime should be unnecessary, see above
            startTime: 18.5,
            endTime: 18.5,
          },
        ],
        [
          'Styles',
          20.5,
          {
            type: 'Styles',
            category: 'Paint',
            startTime: 20.0,
            endTime: 20.5,
            elementsTraversed: 100,
            elementsStyled: 50,
            elementsMatched: 10,
            stylesShared: 15,
            stylesReused: 20,
            cause: {
              time: 19.5,
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
          },
        ],
      ],
      profile
    );
    const store = storeWithProfile(profile);
    const state = store.getState();
    const threadIndex = getSelectedThreadIndex(state);
    const tracingMarkers = selectedThreadSelectors.getTracingMarkers(state);

    expect(
      renderer.create(
        <Provider store={store}>
          <Fragment>
            {tracingMarkers.map((marker, i) => (
              <MarkersTooltipContents
                key={i}
                marker={marker}
                threadIndex={threadIndex}
                className="propClass"
              />
            ))}
          </Fragment>
        </Provider>
      )
    ).toMatchSnapshot();
  });
});
