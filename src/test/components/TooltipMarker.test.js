/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import { Provider } from 'react-redux';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { TooltipMarker } from '../../components/tooltip/Marker';
import { storeWithProfile } from '../fixtures/stores';
import {
  addMarkersToThreadWithCorrespondingSamples,
  getProfileFromTextSamples,
  getNetworkMarkers,
  getProfileWithMarkers,
  getProfileWithEventDelays,
  addActiveTabInformationToProfile,
  markTabIdsAsPrivateBrowsing,
} from '../fixtures/profiles/processed-profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getSelectedThreadsKey } from 'firefox-profiler/selectors/url-state';
import { changeSelectedThreads } from 'firefox-profiler/actions/profile-view';
import { getEmptyThread } from '../../profile-logic/data-structures';
import { ensureExists } from 'firefox-profiler/utils/flow';
import type { NetworkPayload } from 'firefox-profiler/types';

describe('TooltipMarker', function () {
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

    // Connect pages to some of the markers so that we render URLs in
    // some tooltips.
    // We have 2 pages with the same URL to check that the inner
    // window id will be displayed in that case to disambiguate, and 1
    // page with a unique URL, that will be displayed without inner
    // window id.
    const tabID = 123123;
    const innerWindowID = 1;
    profile.pages = [
      {
        tabID: tabID,
        innerWindowID: innerWindowID,
        url: 'https://developer.mozilla.org/en-US/',
        embedderInnerWindowID: 0,
      },
      {
        tabID: tabID + 1,
        innerWindowID: innerWindowID + 1,
        url: 'about:blank',
        embedderInnerWindowID: 0,
      },
      {
        tabID: tabID + 2,
        innerWindowID: innerWindowID + 2,
        url: 'about:blank',
        embedderInnerWindowID: 0,
      },
      {
        tabID: tabID + 3,
        innerWindowID: innerWindowID + 3,
        url: 'https://example.org',
        embedderInnerWindowID: 0,
        isPrivateBrowsing: true,
      },
    ];
    profile.threads[0].name = 'Main Thread';

    // Now add some markers to the profile.
    // Enumerate through all of the switch arms of the tooltip for coverage.
    addMarkersToThreadWithCorrespondingSamples(
      profile.threads[0],
      profile.shared,
      [
        [
          'DOMEvent',
          10.5,
          11.3,
          {
            type: 'DOMEvent',
            eventType: 'commandupdate',
            innerWindowID: innerWindowID,
          },
        ],
        [
          'DOMEvent',
          10.6,
          11.1,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: innerWindowID + 1,
          },
        ],
        [
          'DOMEvent',
          10.7,
          11.2,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: innerWindowID + 2,
          },
        ],
        [
          'DOMEvent',
          10.8,
          11.3,
          {
            type: 'DOMEvent',
            eventType: 'load',
            innerWindowID: innerWindowID + 3,
          },
        ],
        [
          'UserTiming',
          12.5,
          12.5,
          {
            type: 'UserTiming',
            name: 'foobar',
            entryType: 'mark',
          },
        ],
        [
          'NotifyDidPaint',
          14.5,
          null,
          {
            type: 'tracing',
            category: 'Paint',
          },
        ],
        [
          'GCMinor',
          15.5,
          null,
          {
            type: 'GCMinor',
            // nursery is only present in newer profile format.
            nursery: {
              bytes_tenured: 1366368,
              bytes_used: 2061384,
              cells_allocated_nursery: 26578,
              cells_allocated_tenured: 12172,
              cells_tenured: 15853,
              tenured_allocation_rate: 190000000,
              strings_tenured: 10000,
              strings_deduplicated: 1234,
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
          null,
          {
            type: 'GCMajor',
            timings: {
              added_chunks: 50,
              allocated_bytes: 48377856,
              post_heap_size: 38051840,
              pre_malloc_heap_size: 24188928,
              post_malloc_heap_size: 12683946,
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
          null,
          {
            type: 'GCSlice',
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
        // This bailout marker was present around Firefox 72.
        [
          'Bailout_ShapeGuard after getelem on line 3666 of resource://foo.js -> resource://bar.js:3662',
          10,
        ],
        // This bailout marker was present in Firefox 82.
        [
          'BailoutKind::ArgumentCheck at Uninitialized on line 388 of self-hosted:388',
          10,
        ],
        // This is an old-style invalidation marker. This was changed to a Text marker without
        // a version bump between Gecko profile version 20-21.
        ['Invalidate http://mozilla.com/script.js:1234', 10],
        // This is a bailout text marker, as of Gecko profile version 20-21, Firefox 83.
        [
          'Bailout',
          10,
          null,
          {
            type: 'Text',
            name: 'NonObjectInput at JumpTarget on line 27 of https://profiler.firefox.com/701f018d7923ccd65ba7.bundle.js:27',
          },
        ],
        // This is a Invalidate text marker, as of Gecko profile version 20-21
        [
          'Invalidate',
          10,
          null,
          {
            type: 'Text',
            name: 'https://profiler.firefox.com/701f018d7923ccd65ba7.bundle.js:198:23518',
          },
        ],
        [
          'Styles',
          18.5,
          19,
          {
            type: 'tracing',
            category: 'Paint',
            cause: {
              tid: 4444,
              time: 17.0,
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
          },
        ],
        [
          'TimeToFirstInteractive (TTFI)',
          21.4,
          null,
          {
            type: 'Text',
            name: 'TTFI after 100.01ms (longTask was 100.001ms)',
          },
        ],
        [
          'Log',
          21.7,
          null,
          {
            type: 'Log',
            name: 'Random log message',
            module: 'RandomModule',
          },
        ],
        [
          'Styles',
          20.0,
          20.5,
          {
            type: 'Styles',
            category: 'Paint',
            elementsTraversed: 100,
            elementsStyled: 50,
            elementsMatched: 10,
            stylesShared: 15,
            stylesReused: 20,
            cause: {
              tid: 4445,
              time: 19.5,
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
          },
        ],
        [
          'NotifyDidPaint',
          112.5,
          113.3,
          {
            type: 'tracing',
            category: 'Paint',
          },
        ],
        [
          'FileIO',
          114,
          115,
          {
            type: 'FileIO',
            source: 'PoisonIOInterposer',
            filename: '/foo/bar',
            operation: 'create/open',
            cause: {
              tid: 4446,
              time: 17.0,
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
          },
        ],
        [
          'FileIO (non-profiled thread)',
          114.5,
          115,
          {
            type: 'FileIO',
            source: 'PoisonIOInterposer',
            filename: '/foo/bar',
            operation: 'create/open',
            cause: {
              tid: 4447,
              time: 17.0,
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
            threadId: 123,
          },
        ],
        [
          'IPC',
          120,
          null,
          {
            type: 'IPC',
            startTime: 120,
            endTime: 120,
            otherPid: '2222',
            messageSeqno: 1,
            messageType: 'PContent::Msg_PreferenceUpdate',
            side: 'parent',
            direction: 'sending',
            phase: 'endpoint',
            sync: false,
            niceDirection: 'sending to 2222',
          },
        ],
        [
          'IPC',
          121,
          null,
          {
            type: 'IPC',
            startTime: 121,
            endTime: 121,
            otherPid: '2222',
            messageSeqno: 1,
            messageType: 'PContent::Msg_PreferenceUpdate',
            side: 'parent',
            direction: 'sending',
            phase: 'transferStart',
            sync: false,
            niceDirection: 'sending to 2222',
          },
        ],
        [
          'PreferenceRead',
          114.9,
          null,
          {
            type: 'PreferenceRead',
            prefAccessTime: 114.9,
            prefName: 'layout.css.dpi',
            prefKind: 'User',
            prefType: 'Int',
            prefValue: '-1',
          },
        ],
        [
          'PlayAudio',
          115,
          null,
          {
            type: 'MediaSample',
            sampleStartTimeUs: 3632654500,
            sampleEndTimeUs: 3632674500,
          },
        ],
        [
          'RefreshObserver',
          122,
          126,
          {
            type: 'Text',
            name: 'Scrollbar fade animation [Style]',
            cause: {
              time: 125, // This time is later than the marker's start time
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
          },
        ],
      ]
    );
    const store = storeWithProfile(profile);
    const state = store.getState();
    const threadIndex = getSelectedThreadsKey(state);
    const getMarker = selectedThreadSelectors.getMarkerGetter(state);
    const markerIndexes =
      selectedThreadSelectors.getFullMarkerListIndexes(state);

    markerIndexes.forEach((markerIndex) => {
      const marker = getMarker(markerIndex);
      const { container } = render(
        <Provider store={store}>
          <TooltipMarker
            markerIndex={markerIndex}
            marker={marker}
            threadsKey={threadIndex}
            className="propClass"
            restrictHeightWidth={true}
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
    const { secondTabTabID } = addActiveTabInformationToProfile(profile);
    markTabIdsAsPrivateBrowsing(profile, [secondTabTabID]);

    const store = storeWithProfile(profile);
    const state = store.getState();

    const getMarker = selectedThreadSelectors.getMarkerGetter(state);
    const markerIndexes =
      selectedThreadSelectors.getFullMarkerListIndexes(state);

    // We render the first marker.
    const marker = getMarker(markerIndexes[0]);

    return render(
      <Provider store={store}>
        <TooltipMarker
          markerIndex={markerIndexes[0]}
          marker={marker}
          threadsKey={0}
          className="propClass"
          restrictHeightWidth={true}
        />
      </Provider>
    );
  }

  function getValueForProperty(propertyName: string): string {
    const labelElement = screen.getByText(propertyName + ':');
    const valueElement = ensureExists(labelElement.nextSibling);
    return valueElement.textContent;
  }

  describe('renders properly redirect network markers', () => {
    function redirectMarker(payloadOverrides?: $Shape<NetworkPayload>) {
      return {
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
          contentType: ('': null | string),
          ...payloadOverrides,
        },
      };
    }

    it('without additional redirection information', () => {
      const { container } = setupWithPayload(
        getNetworkMarkers(redirectMarker())
      );

      expect(container.firstChild).toMatchSnapshot();
    });

    ['Permanent', 'Internal', 'Temporary'].forEach((redirectType) => {
      it(`for a ${redirectType} redirection`, () => {
        const { container } = setupWithPayload(
          getNetworkMarkers(
            redirectMarker({ redirectType, isHttpToHttpsRedirect: false })
          )
        );

        expect(container.firstChild).toMatchSnapshot();
      });
    });

    it('for an internal redirection from a HSTS header', () => {
      const { container } = setupWithPayload(
        getNetworkMarkers(
          redirectMarker({
            redirectType: 'Permanent',
            isHttpToHttpsRedirect: true,
          })
        )
      );

      expect(container.firstChild).toMatchSnapshot();
    });
  });

  it('renders properly normal network markers', () => {
    const { container } = setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
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
          contentType: 'image/jpeg',
        },
      })
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the page information for network markers', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          innerWindowID: 11111111111,
        },
      })
    );

    expect(getValueForProperty('Page')).toBe('https://www.cnn.com/');
  });

  it('renders page information for private pages in network markers', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          innerWindowID: 11111111114,
          isPrivateBrowsing: true,
        },
      })
    );

    expect(getValueForProperty('Page')).toBe(
      'https://profiler.firefox.com/ (private)'
    );
    expect(getValueForProperty('Private Browsing')).toBe('Yes');
  });

  it('renders page information for HTTP/1.0 pages in network markers', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          httpVersion: 'http/1.0',
        },
      })
    );

    expect(getValueForProperty('HTTP Version')).toBe('1.0');
  });

  it('renders page information for HTTP/1.1 pages in network markers', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          httpVersion: 'http/1.1',
        },
      })
    );

    expect(getValueForProperty('HTTP Version')).toBe('1.1');
  });

  it('renders page information for HTTP/2.0 pages in network markers', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          httpVersion: 'h2',
        },
      })
    );

    expect(getValueForProperty('HTTP Version')).toBe('2');
  });

  it('renders page information for HTTP/3.0 pages in network markers', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          httpVersion: 'h3',
        },
      })
    );

    expect(getValueForProperty('HTTP Version')).toBe('3');
  });

  it('renders page information for pages with one class of service flag', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          classOfService: 'Leader',
        },
      })
    );

    expect(getValueForProperty('Class of Service')).toBe('Leader');
  });

  it('does not render a hidden field in a marker', () => {
    setupWithPayload([
      [
        'Marker with hidden string',
        1,
        2,
        {
          type: 'MarkerWithHiddenField',
          hiddenString: 'test',
        },
      ],
    ]);

    expect(screen.queryByText('Hidden string')).not.toBeInTheDocument();
  });

  it('renders page information for pages with multiple class of service flags', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          classOfService: 'Unblocked | Throttleable | TailForbidden',
        },
      })
    );

    expect(getValueForProperty('Class of Service')).toBe(
      'Unblocked | Throttleable | TailForbidden'
    );
  });

  it('renders page information for pages with request status', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          requestStatus: 'NS_OK',
        },
      })
    );

    expect(getValueForProperty('Request Status')).toBe('NS_OK');
  });

  it('renders page information for pages with response status code', () => {
    setupWithPayload(
      getNetworkMarkers({
        id: 1235,
        startTime: 19000,
        fetchStart: 19200.2,
        endTime: 20433.8,
        uri: 'https://example.org/index.html',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          contentType: 'text/html',
          responseStatus: 403,
        },
      })
    );

    expect(getValueForProperty('Response Status Code')).toBe('403');
  });

  it('renders properly network markers with a preconnect part', () => {
    const { container } = setupWithPayload(
      getNetworkMarkers({
        startTime: 19000,
        fetchStart: 19201,
        endTime: 20433,
        id: 1235,
        uri: 'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
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
          contentType: 'image/jpeg',
        },
      })
    );

    const preconnectTitle = screen.getByText(/preconnect/i);
    expect(preconnectTitle).toBeInTheDocument();
    expect(preconnectTitle).toMatchSnapshot();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders properly network markers with a preconnect part containing only the domain lookup', () => {
    const { container } = setupWithPayload(
      getNetworkMarkers({
        startTime: 19000,
        fetchStart: 19201,
        endTime: 20433,
        id: 1235,
        uri: 'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          domainLookupStart: 10000,
          domainLookupEnd: 10100,
          requestStart: 19300,
          responseStart: 19400,
          responseEnd: 20200,
          contentType: 'image/jpeg',
        },
      })
    );

    const preconnectTitle = screen.getByText(/preconnect/i);
    expect(preconnectTitle).toBeInTheDocument();
    expect(preconnectTitle).toMatchSnapshot();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders properly network markers where content type is blank', () => {
    const { container } = setupWithPayload(
      getNetworkMarkers({
        startTime: 19000,
        fetchStart: 19201,
        endTime: 20433,
        id: 1235,
        uri: 'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          domainLookupStart: 10000,
          domainLookupEnd: 10100,
          requestStart: 19300,
          responseStart: 19400,
          responseEnd: 20200,
          contentType: '',
        },
      })
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders properly network markers where content type is missing', () => {
    const { container } = setupWithPayload(
      getNetworkMarkers({
        startTime: 19000,
        fetchStart: 19201,
        endTime: 20433,
        id: 1235,
        uri: 'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          cache: 'Hit',
          pri: 8,
          count: 47027,
          domainLookupStart: 10000,
          domainLookupEnd: 10100,
          requestStart: 19300,
          responseStart: 19400,
          responseEnd: 20200,
          contentType: null,
        },
      })
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders properly network markers that were aborted', () => {
    const { container } = setupWithPayload(
      getNetworkMarkers({
        startTime: 19000,
        fetchStart: 19201,
        endTime: 20433,
        id: 1235,
        uri: 'https://img.buzzfeed.com/buzzfeed-static/static/2018-04/29/11/tmp/buzzfeed-prod-web-02/tmp-name-2-18011-1525016782-0_dblwide.jpg?output-format=auto&output-quality=auto&resize=625:*',
        payload: {
          contentType: null,
          cache: 'Unresolved',
          status: 'STATUS_CANCEL',
        },
      })
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders profiled off-main thread FileIO markers properly', () => {
    const threadId = 123456;
    // First, create a profile with one stack, so that the stack table contains
    // something that we can refer to from the FileIO marker cause.
    const {
      profile,
      funcNamesPerThread: [funcNames],
    } = getProfileFromTextSamples(`
      _main
      XRE_main
      XREMain::XRE_main
      mozilla::GeckoRestyleManager::PostRestyleEvent
      nsRefreshDriver::AddStyleFlushObserver
    `);

    // Add another thread with the thread Id we are going to refer from the marker.
    profile.threads.push(getEmptyThread({ name: 'Renderer', tid: threadId }));

    addMarkersToThreadWithCorrespondingSamples(
      profile.threads[0],
      profile.shared,
      [
        [
          'FileIO (non-main thread)',
          114.5,
          115,
          {
            type: 'FileIO',
            source: 'PoisonIOInterposer',
            filename: '/foo/bar',
            operation: 'create/open',
            cause: {
              tid: 4448,
              time: 17.0,
              stack: funcNames.indexOf(
                'nsRefreshDriver::AddStyleFlushObserver'
              ),
            },
            threadId: threadId,
          },
        ],
      ]
    );

    const store = storeWithProfile(profile);
    const state = store.getState();
    const threadIndex = getSelectedThreadsKey(state);
    const getMarker = selectedThreadSelectors.getMarkerGetter(state);
    const markerIndexes =
      selectedThreadSelectors.getFullMarkerListIndexes(state);

    // Render the first marker
    const marker = getMarker(markerIndexes[0]);
    const { container } = render(
      <Provider store={store}>
        <TooltipMarker
          markerIndex={markerIndexes[0]}
          marker={marker}
          threadsKey={threadIndex}
          className="propClass"
          restrictHeightWidth={true}
        />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('shows a tooltip for Jank markers', function () {
    const eventDelay = [
      0, 20, 40, 60, 70,
      // break point
      0, 20, 40,
    ];

    const profile = getProfileWithEventDelays(eventDelay);
    const store = storeWithProfile(profile);
    const { getState } = store;
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());

    const { container } = render(
      <Provider store={store}>
        <TooltipMarker
          markerIndex={0}
          marker={getMarker(0)}
          threadsKey={0}
          restrictHeightWidth={true}
        />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('shows image of CompositorScreenshot markers', function () {
    const { profile, stringTable } = getProfileFromTextSamples(`A`);
    const thread = profile.threads[0];

    const screenshotUrl = 'Screenshot Url';
    const screenshotUrlIndex = stringTable.indexForString(screenshotUrl);
    addMarkersToThreadWithCorrespondingSamples(thread, profile.shared, [
      [
        'CompositorScreenshot',
        1,
        2,
        {
          type: 'CompositorScreenshot',
          url: screenshotUrlIndex,
          windowID: 'XXX',
          windowWidth: 600,
          windowHeight: 300,
        },
      ],
    ]);

    const store = storeWithProfile(profile);
    const { getState } = store;
    const getMarker = selectedThreadSelectors.getMarkerGetter(getState());

    const { container } = render(
      <Provider store={store}>
        <TooltipMarker
          markerIndex={0}
          marker={getMarker(0)}
          threadsKey={0}
          restrictHeightWidth={true}
        />
      </Provider>
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the tooltip of CompositorScreenshotWindowDestroyed', () => {
    setupWithPayload([
      [
        'CompositorScreenshotWindowDestroyed',
        1,
        2,
        {
          type: 'CompositorScreenshot',
          windowID: 'XXX',
          url: undefined,
        },
      ],
    ]);

    expect(document.body).toMatchSnapshot();
  });

  it('shows the source thread for markers from a merged thread', function () {
    // We construct a profile that has 2 threads from 2 different tabs.
    const tab1Domain = 'https://mozilla.org';
    const tab2Domain = 'https://letsencrypt.org';
    const { profile, stringTable } = getProfileFromTextSamples(`A`, `A`);
    profile.threads[0] = {
      ...profile.threads[0],
      name: 'GeckoMain',
      processName: 'Isolated Web Content',
      'eTLD+1': tab1Domain,
    };
    profile.threads[1] = {
      ...profile.threads[1],
      name: 'GeckoMain',
      processName: 'Isolated Web Content',
      'eTLD+1': tab2Domain,
    };

    const innerWindowID1 = 1;
    const tabID1 = 10;
    const innerWindowID2 = 2;
    const tabID2 = 11;
    profile.pages = [
      {
        tabID: tabID1,
        innerWindowID: innerWindowID1,
        url: 'https://developer.mozilla.org/en-US/',
        embedderInnerWindowID: 0,
      },
      {
        tabID: tabID2,
        innerWindowID: innerWindowID2,
        url: 'https://letsencrypt.org/',
        embedderInnerWindowID: 0,
      },
    ];

    addMarkersToThreadWithCorrespondingSamples(
      profile.threads[0],
      profile.shared,
      [
        [
          'DOMEvent',
          1,
          2,
          {
            type: 'DOMEvent',
            eventType: 'click',
            innerWindowID: innerWindowID1,
          },
        ],
      ]
    );

    const screenshotUrl = 'Screenshot Url';
    const screenshotUrlIndex = stringTable.indexForString(screenshotUrl);
    addMarkersToThreadWithCorrespondingSamples(
      profile.threads[1],
      profile.shared,
      [
        [
          'DOMEvent',
          2,
          3,
          {
            type: 'DOMEvent',
            eventType: 'pageload',
            innerWindowID: innerWindowID2,
          },
        ],

        [
          'CompositorScreenshot',
          3,
          4,
          {
            type: 'CompositorScreenshot',
            url: screenshotUrlIndex,
            windowID: 'XXX',
            windowWidth: 600,
            windowHeight: 300,
          },
        ],
      ]
    );

    const store = storeWithProfile(profile);
    store.dispatch(changeSelectedThreads(new Set([0, 1])));

    const getMarker = selectedThreadSelectors.getMarkerGetter(store.getState());
    const threadsKey = getSelectedThreadsKey(store.getState());

    // We over on top of the first marker
    const { rerender } = render(
      <Provider store={store}>
        <TooltipMarker
          markerIndex={0}
          marker={getMarker(0)}
          threadsKey={threadsKey}
          restrictHeightWidth={true}
        />
      </Provider>
    );

    expect(document.body).toMatchSnapshot();

    // This simulates hovering on top of the other marker.
    rerender(
      <Provider store={store}>
        <TooltipMarker
          markerIndex={1}
          marker={getMarker(1)}
          threadsKey={threadsKey}
          restrictHeightWidth={true}
        />
      </Provider>
    );
    expect(document.body).toMatchSnapshot();

    // What about the compositor screenshot?
    rerender(
      <Provider store={store}>
        <TooltipMarker
          markerIndex={2}
          marker={getMarker(2)}
          threadsKey={threadsKey}
          restrictHeightWidth={true}
        />
      </Provider>
    );
    const trackTitle = screen.getByText('Track:');
    const trackInfo = trackTitle.nextSibling;
    expect(trackInfo).toHaveTextContent(tab2Domain);
  });
});
