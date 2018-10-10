/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getTracingMarkers } from '../../profile-logic/marker-data';
import { processProfile } from '../../profile-logic/process-profile';
import getGeckoProfile from '.././fixtures/profiles/gecko-profile';

describe('getTracingMarkers', function() {
  const profile = processProfile(getGeckoProfile());
  const thread = profile.threads[0];
  const tracingMarkers = getTracingMarkers(thread.markers, thread.stringTable);

  it('creates 11 tracing markers given the test data', function() {
    expect(tracingMarkers.length).toEqual(11);
  });
  it('creates a tracing marker even if there is no start or end time', function() {
    expect(tracingMarkers[1]).toMatchObject({
      start: 2,
      dur: 0,
      name: 'VsyncTimestamp',
      title: null,
    });
  });
  it('should create a tracing marker', function() {
    expect(tracingMarkers[2]).toMatchObject({
      start: 3,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
  });
  it('should fold the two reflow markers into one tracing marker', function() {
    expect(tracingMarkers.length).toEqual(11);
    expect(tracingMarkers[2]).toMatchObject({
      start: 3,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
  });
  it('should fold the two Rasterize markers into one tracing marker, after the reflow tracing marker', function() {
    expect(tracingMarkers[3]).toMatchObject({
      start: 4,
      dur: 1,
      name: 'Rasterize',
      title: null,
    });
  });
  it('should create a tracing marker for the MinorGC startTime/endTime marker', function() {
    expect(tracingMarkers[5]).toMatchObject({
      start: 11,
      dur: 1,
      name: 'MinorGC',
      title: null,
    });
  });
  it('should create a tracing marker for the DOMEvent marker', function() {
    expect(tracingMarkers[4]).toMatchObject({
      dur: 1,
      name: 'DOMEvent',
      start: 9,
      title: null,
    });
  });
  it('should create a tracing marker for the marker UserTiming', function() {
    expect(tracingMarkers[6]).toMatchObject({
      dur: 1,
      name: 'UserTiming',
      start: 12,
      title: null,
    });
  });
  it('should handle tracing markers without a start', function() {
    expect(tracingMarkers[0]).toMatchObject({
      start: -1,
      dur: 2, // This duration doesn't represent much and won't be displayed anyway
      name: 'Rasterize',
      title: null,
    });
  });
  it('should handle tracing markers without an end', function() {
    expect(tracingMarkers[9]).toMatchObject({
      start: 20,
      dur: Infinity,
      name: 'Rasterize',
      title: null,
    });
  });
  it('should handle nested tracing markers correctly', function() {
    expect(tracingMarkers[7]).toMatchObject({
      start: 13,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
    expect(tracingMarkers[8]).toMatchObject({
      start: 14,
      dur: 1,
      name: 'Reflow',
      title: null,
    });
  });
  it('should handle arbitrary event tracing markers correctly', function() {
    expect(tracingMarkers[10]).toMatchObject({
      start: 21,
      dur: 0,
      name: 'ArbitraryName',
      title: null,
      data: { category: 'ArbitraryCategory', type: 'tracing' },
    });
  });
});
