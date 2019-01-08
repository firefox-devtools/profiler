/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { deriveMarkersFromRawMarkerTable } from '../../profile-logic/marker-data';
import { processProfile } from '../../profile-logic/process-profile';
import { createGeckoProfile } from '.././fixtures/profiles/gecko-profile';

describe('deriveMarkersFromRawMarkerTable', function() {
  const profile = processProfile(createGeckoProfile());
  const thread = profile.threads[0]; // This is the parent process main thread
  const contentThread = profile.threads[2]; // This is the content process main thread
  const markers = deriveMarkersFromRawMarkerTable(
    thread.markers,
    thread.stringTable,
    thread.samples.time[0]
  );
  const contentMarkers = deriveMarkersFromRawMarkerTable(
    contentThread.markers,
    contentThread.stringTable,
    thread.samples.time[0]
  );

  it('creates a reasonable processed profile', function() {
    expect(thread.name).toBe('GeckoMain');
    expect(thread.processType).toBe('default');
    expect(contentThread.name).toBe('GeckoMain');
    expect(contentThread.processType).toBe('tab');
  });
  it('creates 12 markers given the test data', function() {
    expect(markers.length).toEqual(12);
  });
  it('creates a marker even if there is no start or end time', function() {
    expect(markers[1]).toMatchObject({
      start: 2,
      dur: 0,
      name: 'VsyncTimestamp',
      title: null,
    });
  });
  it('should create a marker', function() {
    expect(markers[2]).toMatchObject({
      start: 3,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
  });
  it('should fold the two reflow markers into one marker', function() {
    expect(markers.length).toEqual(12);
    expect(markers[2]).toMatchObject({
      start: 3,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
  });
  it('should fold the two Rasterize markers into one marker, after the reflow marker', function() {
    expect(markers[3]).toMatchObject({
      start: 4,
      dur: 1,
      name: 'Rasterize',
      title: null,
    });
  });
  it('should create a marker for the MinorGC startTime/endTime marker', function() {
    expect(markers[5]).toMatchObject({
      start: 11,
      dur: 1,
      name: 'MinorGC',
      title: null,
    });
  });
  it('should create a marker for the DOMEvent marker', function() {
    expect(markers[4]).toMatchObject({
      dur: 1,
      name: 'DOMEvent',
      start: 9,
      title: null,
    });
  });
  it('should create a marker for the marker UserTiming', function() {
    expect(markers[6]).toMatchObject({
      dur: 1,
      name: 'UserTiming',
      start: 12,
      title: null,
    });
  });
  it('should handle markers without a start', function() {
    expect(markers[0]).toMatchObject({
      start: 0, // Truncated to the time of the first captured sample.
      dur: 1,
      name: 'Rasterize',
      title: null,
    });
  });
  it('should handle markers without an end', function() {
    expect(markers[9]).toMatchObject({
      start: 20,
      dur: Infinity,
      name: 'Rasterize',
      title: null,
    });
  });
  it('should handle nested markers correctly', function() {
    expect(markers[7]).toMatchObject({
      start: 13,
      dur: 5,
      name: 'Reflow',
      title: null,
    });
    expect(markers[8]).toMatchObject({
      start: 14,
      dur: 1,
      name: 'Reflow',
      title: null,
    });
  });
  it('should handle arbitrary event markers correctly', function() {
    expect(markers[10]).toMatchObject({
      start: 21,
      dur: 0,
      name: 'ArbitraryName',
      title: null,
      data: { category: 'ArbitraryCategory', type: 'tracing' },
    });
  });
  it('shifts content process marker times correctly', function() {
    expect(thread.processStartupTime).toBe(0);
    expect(contentThread.processStartupTime).toBe(1000);
    expect(markers[11]).toEqual({
      data: {
        type: 'Network',
        startTime: 22,
        endTime: 24,
        id: 388634410746504,
        status: 'STATUS_STOP',
        pri: -20,
        count: 37838,
        URI: 'https://github.com/rustwasm/wasm-bindgen/issues/2',
        domainLookupStart: 22.1,
        domainLookupEnd: 22.2,
        connectStart: 22.3,
        tcpConnectEnd: 22.4,
        secureConnectionStart: 22.5,
        connectEnd: 22.6,
        requestStart: 22.7,
        responseStart: 22.8,
        responseEnd: 22.9,
      },
      dur: 2,
      name: 'Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5',
      start: 22,
      title: null,
    });
    expect(contentMarkers[11]).toEqual({
      data: {
        type: 'Network',
        startTime: 1022,
        endTime: 1024,
        id: 388634410746504,
        status: 'STATUS_STOP',
        pri: -20,
        count: 37838,
        URI: 'https://github.com/rustwasm/wasm-bindgen/issues/2',
        domainLookupStart: 1022.1,
        domainLookupEnd: 1022.2,
        connectStart: 1022.3,
        tcpConnectEnd: 1022.4,
        secureConnectionStart: 1022.5,
        connectEnd: 1022.6,
        requestStart: 1022.7,
        responseStart: 1022.8,
        responseEnd: 1022.9,
      },
      dur: 2,
      name: 'Load 32: https://github.com/rustwasm/wasm-bindgen/issues/5',
      start: 1022,
      title: null,
    });
  });
});
