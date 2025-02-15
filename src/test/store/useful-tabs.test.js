/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { selectedThreadSelectors } from '../../selectors/per-thread';

import { storeWithProfile } from '../fixtures/stores';
import {
  getMarkerTableProfile,
  getProfileFromTextSamples,
  getProfileWithMarkers,
  getNetworkMarkers,
  getProfileWithJsTracerEvents,
  getMergedProfileFromTextSamples,
  getProfileWithUnbalancedNativeAllocations,
  addActiveTabInformationToProfile,
} from '../fixtures/profiles/processed-profile';
import { changeTimelineTrackOrganization } from 'firefox-profiler/actions/receive-profile';
import { getEmptySamplesTableWithEventDelay } from '../../profile-logic/data-structures';

describe('getUsefulTabs', function () {
  it('hides the network chart and JS tracer when no data is in the thread', function () {
    const { profile } = getProfileFromTextSamples('A');
    const { getState } = storeWithProfile(profile);
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'calltree',
      'function-list',
      'flame-graph',
      'stack-chart',
      'marker-chart',
      'marker-table',
    ]);
  });

  it('shows the network chart when network markers are present in the thread', function () {
    const profile = getProfileWithMarkers(getNetworkMarkers());
    const { getState } = storeWithProfile(profile);
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'marker-chart',
      'marker-table',
      'network-chart',
    ]);
  });

  it('shows the js tracer when it is available in a thread', function () {
    const profile = getProfileWithJsTracerEvents([['A', 0, 10]]);
    const { getState } = storeWithProfile(profile);
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'marker-chart',
      'marker-table',
      'js-tracer',
    ]);
  });

  it('shows only the call tree when a diffing track is selected', function () {
    const { profile } = getMergedProfileFromTextSamples(['A  B  C', 'A  B  B']);
    const { getState, dispatch } = storeWithProfile(profile);
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'calltree',
      'function-list',
      'flame-graph',
      'stack-chart',
      'marker-chart',
      'marker-table',
    ]);

    dispatch({
      type: 'SELECT_TRACK',
      selectedThreadIndexes: new Set([2]),
      selectedTab: 'calltree',
      lastNonShiftClickInformation: null,
    });
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'calltree',
    ]);
  });

  it('shows the network chart when network markers are present in the active tab view', function () {
    const { profile, parentInnerWindowIDsWithChildren, firstTabTabID } =
      addActiveTabInformationToProfile(
        getProfileWithMarkers(getNetworkMarkers())
      );
    // Adding the parent innerWindowID to the first thread's first sample, so
    // this thread will be inluded in the active tab view.
    profile.threads[0].frameTable.innerWindowID[0] =
      parentInnerWindowIDsWithChildren;
    const { dispatch, getState } = storeWithProfile(profile);

    // Switch to the active tab view.
    dispatch(
      changeTimelineTrackOrganization({
        type: 'active-tab',
        tabID: firstTabTabID,
      })
    );

    // Check the tabs and make sure that the network chart is there.
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'marker-chart',
      'marker-table',
      'network-chart',
    ]);
  });

  it('shows sample related tabs even when there are only allocation samples in the profile', function () {
    const { profile } = getProfileWithUnbalancedNativeAllocations();
    for (const thread of profile.threads) {
      thread.samples = getEmptySamplesTableWithEventDelay();
    }
    const { getState } = storeWithProfile(profile);
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'calltree',
      'flame-graph',
      'stack-chart',
      'marker-chart',
      'marker-table',
    ]);
  });

  it('hides sample related tabs when there is no sample data in the profile', function () {
    const profile = getMarkerTableProfile();
    const { getState } = storeWithProfile(profile);
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'marker-chart',
      'marker-table',
    ]);
  });

  it('hides sample related tabs when samples contain only the (root) frame', function () {
    const { profile } = getProfileFromTextSamples('(root)');
    const { getState } = storeWithProfile(profile);
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'marker-chart',
      'marker-table',
    ]);
  });

  it('works when the first sample is null', () => {
    const { profile } = getProfileFromTextSamples('A  B');
    profile.threads[0].samples.stack[0] = null;

    const { getState } = storeWithProfile(profile);
    expect(selectedThreadSelectors.getUsefulTabs(getState())).toEqual([
      'calltree',
      'flame-graph',
      'stack-chart',
      'marker-chart',
      'marker-table',
    ]);
  });
});
