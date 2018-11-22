/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { NetworkPayload } from '../../types/markers';

import React, { Fragment } from 'react';
import { Provider } from 'react-redux';
import MarkersTooltipContents from '../../components/shared/MarkerTooltipContents';
import renderer from 'react-test-renderer';
import { storeWithProfile } from '../fixtures/stores';
import {
  addMarkersToThreadWithCorrespondingSamples,
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
    addMarkersToThreadWithCorrespondingSamples(profile.threads[0], [
      [
        'DOMEvent',
        10.5,
        {
          type: 'tracing',
          category: 'DOMEvent',
          eventType: 'commandupdate',
          interval: 'start',
          phase: 2,
        },
      ],
      [
        'DOMEvent',
        11.3,
        {
          type: 'tracing',
          category: 'DOMEvent',
          eventType: 'commandupdate',
          interval: 'end',
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
          category: 'Paint',
          interval: 'start',
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
            bytes_tenured: 1366368,
            bytes_used: 2061384,
            cells_allocated_nursery: 26578,
            cells_allocated_tenured: 12172,
            cells_tenured: 15853,
            cur_capacity: 16776832,
            phase_times: {
              CancelIonCompilations: 0,
              CheckHashTables: 0,
              ClearNursery: 1295,
              ClearStoreBuffer: 153,
              CollectToFP: 3000,
              FreeMallocedBuffers: 0,
              MarkDebugger: 1,
              MarkRuntime: 38,
              ObjectsTenuredCallback: 0,
              Pretenure: 4,
              Sweep: 9,
              SweepCaches: 6,
              Total: 8351,
              TraceCells: 1928,
              TraceGenericEntries: 391,
              TraceSlots: 1478,
              TraceValues: 0,
              TraceWholeCells: 38,
              UpdateJitActivations: 0,
            },
            reason: 'FULL_CELL_PTR_BUFFER',
            status: 'complete',
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
            added_chunks: 50,
            allocated_bytes: 48377856,
            major_gc_number: 1,
            max_pause: 74.026,
            minor_gc_number: 16,
            minor_gcs: 8,
            mmu_20ms: 0,
            mmu_50ms: 0,
            nonincremental_reason: 'GCBytesTrigger',
            phase_times: {
              barrier: 805,
              'barrier.unmark_gray': 775,
              evict_nursery_for_major_gc: 1321,
              'evict_nursery_for_major_gc.mark_roots': 95,
              'evict_nursery_for_major_gc.mark_roots.mark_stack': 30,
              mark: 29205,
              'mark.mark_roots': 407,
              'mark.mark_roots.mark_ccws': 215,
              'mark.mark_roots.mark_compartments': 83,
              'mark.mark_roots.mark_embedding': 50,
              'mark.mark_roots.mark_stack': 35,
              minor_gc: 203571,
              'minor_gc.mark_roots': 1993,
              'minor_gc.mark_roots.mark_stack': 1536,
              prepare: 9133,
              'prepare.join_parallel_tasks': 0,
              'prepare.mark_discard_code': 0,
              'prepare.purge': 6449,
              sweep: 31785,
              'sweep.destroy': 281,
              'sweep.finalize_end': 29,
              'sweep.finalize_start': 20,
              'sweep.finalize_start.weak_compartment_callback': 4,
              'sweep.finalize_start.weak_zones_callback': 14,
              'sweep.sweep_compartments': 10800,
              'sweep.sweep_compartments.join_parallel_tasks': 118,
              'sweep.sweep_compartments.sweep_breakpoint': 0,
              'sweep.sweep_compartments.sweep_discard_code': 0,
              'sweep.sweep_compartments.sweep_jit_data': 1223,
              'sweep.sweep_compartments.sweep_misc': 1,
              'sweep.sweep_compartments.sweep_types': 9422,
              'sweep.sweep_compartments.sweep_types.sweep_types_begin': 1,
              'sweep.sweep_compartments.sweep_types.sweep_types_end': 0,
              'sweep.sweep_mark': 16656,
              'sweep.sweep_mark.sweep_mark_gray': 12307,
              'sweep.sweep_mark.sweep_mark_gray_weak': 203,
              'sweep.sweep_mark.sweep_mark_incoming_black': 0,
              'sweep.sweep_mark.sweep_mark_incoming_gray': 0,
              'sweep.sweep_mark.sweep_mark_weak': 4142,
              'sweep.sweep_object': 0,
              'sweep.sweep_regexp_shared': 0,
              'sweep.sweep_script': 0,
              'sweep.sweep_shape': 1125,
              'sweep.sweep_string': 0,
              wait_background_thread: 13911,
            },
            reason: 'ALLOC_TRIGGER',
            scc_sweep_max_pause: 1.294,
            scc_sweep_total: 1.294,
            slice_number: 25,
            slices: 2,
            status: 'completed',
            store_buffer_overflows: 1,
            timestamp: 0,
            total_compartments: 19,
            total_time: 85.578,
            total_zones: 4,
            zones_collected: 1,
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
            pause: 5.23,
            budget: '11ms',
            initial_state: 'Initial',
            final_state: 'Final',
            major_gc_number: 1,
            page_faults: 1,
            start_timestamp: 17,
            phase_times: {
              mark: 10046,
              wait_background_thread: 0,
            },
            trigger_amount: 279224320,
            trigger_threshold: 256916275,
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
            stack: funcNames.indexOf('nsRefreshDriver::AddStyleFlushObserver'),
          },
        },
      ],
      [
        'Styles',
        19,
        {
          type: 'tracing',
          category: 'Paint',
          interval: 'end',
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
            stack: funcNames.indexOf('nsRefreshDriver::AddStyleFlushObserver'),
          },
        },
      ],
      [
        'Load 31: http://wikia.com/',
        18670.5141769375,
        // Coerce all of the Network payload objects to the NetworkPayload type to help
        // surface helpful Flow error messages.
        ({
          type: 'Network',
          startTime: 18670.5141769375,
          endTime: 18736.9210449375,
          id: 107838038867999,
          status: 'STATUS_REDIRECT',
          pri: -20,
          count: 0,
          URI: 'http://www.wikia.com/',
          RedirectURI:
            'Load 1234: http://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
          dur: 10.5,
          name: '',
          title: '',
        }: NetworkPayload),
      ],
      [
        'Load 1234: http://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        111.0,
        ({
          type: 'Network',
          startTime: 13382.453655062502,
          endTime: 13587.6919060625,
          id: 1234,
          status: 'STATUS_STOP',
          pri: 8,
          count: 47027,
          URI:
            'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
          requestStart: 11143.294456,
          responseStart: 11172.047379,
          responseEnd: 11175.561877,
          RedirectURI: '',
          dur: 10.5,
          name: '',
          title: '',
        }: NetworkPayload),
      ],
      [
        'Load 31: http://wikia.com/',
        10.5,
        ({
          type: 'Network',
          startTime: 10.5,
          endTime: 111.0,
          id: 1234,
          pri: 8,
          status: 'STATUS_START',
          URI: 'http://wikia.com/',
          RedirectURI: '',
          dur: 10.5,
          name: '',
          title: '',
        }: NetworkPayload),
      ],
      [
        'Load 1234: http://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        111.0,
        ({
          type: 'Network',
          startTime: 111.0,
          endTime: 121.5,
          id: 1234,
          pri: 8,
          status: 'STATUS_READING',
          RedirectURI: '',
          URI: '',
          dur: 10.5,
          name: '',
          title: '',
        }: NetworkPayload),
      ],
      [
        'ConstructRootFrame',
        112.5,
        {
          type: 'tracing',
          category: 'Frame Construction',
          interval: 'start',
        },
      ],
      [
        'ConstructRootFrame',
        113.3,
        {
          type: 'tracing',
          category: 'Frame Construction',
          interval: 'end',
        },
      ],
    ]);
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
