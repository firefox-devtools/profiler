/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import { Provider } from 'react-redux';
import { TooltipMarker } from '../../components/tooltip/Marker';
import { render } from 'react-testing-library';
import { storeWithProfile } from '../fixtures/stores';
import {
  addMarkersToThreadWithCorrespondingSamples,
  getProfileFromTextSamples,
  getNetworkMarkers,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getSelectedThreadIndex } from '../../selectors/url-state';

describe('TooltipMarker', function() {
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

    // Connect a page to one of the markers so that we render a URL in
    // its tooltip.
    const docShellId = '{c03a6ebd-2430-7949-b25b-95ba9776bdbf}';
    const docshellHistoryId = 1;
    profile.pages = [
      {
        docshellId: docShellId,
        historyId: docshellHistoryId,
        url: 'https://developer.mozilla.org/en-US/',
        isSubFrame: false,
      },
    ];
    profile.threads[0].name = 'Main Thread';

    // Now add some markers to the profile.
    // Enumerate through all of the switch arms of the tooltip for coverage.
    addMarkersToThreadWithCorrespondingSamples(
      profile.threads[0],
      [
        [
          'DOMEvent',
          10.5,
          {
            type: 'tracing',
            category: 'DOMEvent',
            eventType: 'commandupdate',
            interval: 'start',
            phase: 2,
            docShellId,
            docshellHistoryId,
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
              post_heap_size: 38051840,
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
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
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
          'TTFI',
          21.4,
          {
            type: 'Text',
            name: 'TTFI after 100.01ms (longTask was 100.001ms)',
            startTime: 21.4,
            endTime: 21.4,
          },
        ],
        [
          'Log',
          21.7,
          {
            type: 'Log',
            name: 'Random log message',
            module: 'RandomModule',
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
        [
          'FileIO',
          114,
          {
            type: 'FileIO',
            startTime: 114,
            endTime: 115,
            source: 'PoisonIOInterposer',
            filename: '/foo/bar',
            operation: 'create/open',
            cause: {
              time: 17.0,
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
          },
        ],
      ],
      profile.meta.interval
    );
    const store = storeWithProfile(profile);
    const state = store.getState();
    const threadIndex = getSelectedThreadIndex(state);
    const getMarker = selectedThreadSelectors.getMarkerGetter(state);
    const markerIndexes = selectedThreadSelectors.getFullMarkerListIndexes(
      state
    );

    markerIndexes.forEach(markerIndex => {
      const marker = getMarker(markerIndex);
      const { container } = render(
        <Provider store={store}>
          <TooltipMarker
            marker={marker}
            threadIndex={threadIndex}
            className="propClass"
          />
        </Provider>
      );

      expect(container.firstChild).toMatchSnapshot(
        // Markers are ordered by start time, but for markers with the same start
        // time the order is implementation-dependent. As a result we use a unique
        // name for snapshots so that we don't depend on the resulting order in
        // this test, as this isn't important.
        `${marker.name}-${marker.start}`
      );
    });
  });

  // In this setup function, we'll render only the first derived marker. But
  // there can be several raw markers as sources, that will be merged in our
  // processing pipeline.
  function setupWithPayload(markers) {
    const profile = getProfileWithMarkers(markers);

    const store = storeWithProfile(profile);
    const state = store.getState();

    const getMarker = selectedThreadSelectors.getMarkerGetter(state);
    const markerIndexes = selectedThreadSelectors.getFullMarkerListIndexes(
      state
    );

    // We render the first marker.
    const marker = getMarker(markerIndexes[0]);

    return render(
      <Provider store={store}>
        <TooltipMarker marker={marker} threadIndex={0} className="propClass" />
      </Provider>
    );
  }

  it('renders properly redirect network markers', () => {
    const { container } = setupWithPayload(
      getNetworkMarkers({
        id: 1234,
        startTime: 10.5,
        fetchStart: 111.0,
        endTime: 18736.6,
        uri: 'http://www.wikia.com/',
        payload: {
          status: 'STATUS_REDIRECT',
          cache: 'any string could be here',
          pri: -20,
          count: 0,
          RedirectURI:
            'http://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625',
        },
      })
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders properly normal network markers', () => {
    const { container } = setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri:
          'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          domainLookupStart: 19050,
          domainLookupEnd: 19060,
          connectStart: 19200,
          tcpConnectEnd: 19205,
          secureConnectionStart: 19250,
          connectEnd: 19290,
          requestStart: 19300.8,
          responseStart: 19400.2,
          responseEnd: 20200,
        },
      })
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders properly network markers with a preconnect part', () => {
    const { container, getByText } = setupWithPayload(
      getNetworkMarkers({
        startTime: 19000,
        fetchStart: 19201,
        endTime: 20433,
        id: 1235,
        uri:
          'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          domainLookupStart: 10000,
          domainLookupEnd: 10100,
          connectStart: 10200,
          tcpConnectEnd: 10210,
          secureConnectionStart: 10211,
          connectEnd: 10220,
          requestStart: 19300,
          responseStart: 19400,
          responseEnd: 20200,
        },
      })
    );

    const preconnectTitle = getByText(/preconnect/i);
    expect(preconnectTitle).toBeTruthy();
    expect(preconnectTitle).toMatchSnapshot();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders properly network markers with a preconnect part containing only the domain lookup', () => {
    const { container, getByText } = setupWithPayload(
      getNetworkMarkers({
        startTime: 19000,
        fetchStart: 19201,
        endTime: 20433,
        id: 1235,
        uri:
          'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          domainLookupStart: 10000,
          domainLookupEnd: 10100,
          requestStart: 19300,
          responseStart: 19400,
          responseEnd: 20200,
        },
      })
    );

    const preconnectTitle = getByText(/preconnect/i);
    expect(preconnectTitle).toBeTruthy();
    expect(preconnectTitle).toMatchSnapshot();
    expect(container.firstChild).toMatchSnapshot();
  });
});
