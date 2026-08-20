/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for extracting `CompositorScreenshot` payloads.
 *
 * Screenshot markers have no marker schema (#5303), so before these behaviours
 * existed `marker info` reported no fields at all for them and the image data
 * URL — stored as a string table index — was unreachable from the CLI.
 */

import { ProfileQuerier } from 'firefox-profiler/profile-query';
import { getProfileWithMarkers } from '../../fixtures/profiles/processed-profile';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import { storeWithProfile } from '../../fixtures/stores';
import {
  screenshotFileExtension,
  SCREENSHOT_MARKER_TYPE,
} from 'firefox-profiler/profile-query/screenshot';
import type { Profile } from 'firefox-profiler/types';

// A 1x1 JPEG, base64-encoded. Small but genuinely decodable.
const JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDIzNP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EAKHAAAEC/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';
const DATA_URL = `data:image/jpeg;base64,${JPEG_BASE64}`;

/**
 * Build a profile with screenshot markers whose `url` really points into the
 * string table, mirroring how Gecko stores them.
 */
function getProfileWithScreenshots(): Profile {
  const profile = getProfileWithMarkers([
    [
      'CompositorScreenshot',
      10,
      20,
      {
        type: 'CompositorScreenshot',
        // Resolved to DATA_URL through the string table below.
        url: 0,
        windowID: '0x1',
        windowWidth: 1280,
        windowHeight: 951,
      } as any,
    ],
    [
      'CompositorScreenshot',
      20,
      30,
      {
        type: 'CompositorScreenshot',
        url: 0,
        windowID: '0x1',
        windowWidth: 1280,
        windowHeight: 951,
      } as any,
    ],
    // A second, concurrently-captured window.
    [
      'CompositorScreenshot',
      5,
      40,
      {
        type: 'CompositorScreenshot',
        url: 0,
        windowID: '0x2',
        windowWidth: 800,
        windowHeight: 600,
      } as any,
    ],
    // Window-destroyed markers share the payload type but carry no image.
    [
      'CompositorScreenshotWindowDestroyed',
      40,
      null,
      {
        type: 'CompositorScreenshot',
        windowID: '0x2',
        url: undefined,
      } as any,
    ],
  ]);

  // Point string index 0 at the data URL the markers reference.
  profile.shared.stringArray[0] = DATA_URL;
  return profile;
}

function makeQuerier(profile: Profile): ProfileQuerier {
  const store = storeWithProfile(profile);
  const rootRange = getProfileRootRange(store.getState());
  return new ProfileQuerier(store, rootRange);
}

/**
 * The marker handles matching `searchString`, in chronological order.
 */
async function getMarkerHandles(
  querier: ProfileQuerier,
  searchString: string
): Promise<string[]> {
  const result = await querier.threadMarkers(undefined, {
    searchString,
    list: true,
  });
  const flatMarkers = result.flatMarkers ?? [];
  expect(flatMarkers.length).toBeGreaterThan(0);
  return flatMarkers.map((marker) => marker.handle);
}

/**
 * The handle of the screenshot marker starting at `startTime` (ms, relative to
 * the profile start). Picking by time rather than by list position keeps these
 * assertions readable, since the flat list is chronological across windows.
 */
async function getScreenshotHandleAt(
  querier: ProfileQuerier,
  startTime: number
): Promise<string> {
  const result = await querier.threadMarkers(undefined, {
    searchString: SCREENSHOT_MARKER_TYPE,
    list: true,
  });
  const rootStart = getProfileRootRange(querier._store.getState()).start;
  const match = (result.flatMarkers ?? []).find(
    (marker) => Math.abs(marker.start - rootStart - startTime) < 0.001
  );
  if (!match) {
    throw new Error(`No screenshot marker starting at ${startTime}ms`);
  }
  return match.handle;
}

describe('CompositorScreenshot extraction', function () {
  describe('markerInfo', function () {
    it('exposes the data URL and window size for a screenshot marker', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      // The first frame of window 0x1, captured at 1280x951. Times are relative
      // to the profile root range, which starts at the earliest marker -- so
      // window 0x2's frame sits at -5 and this one lands at 0.
      const handle = await getScreenshotHandleAt(querier, 0);

      const info = await querier.markerInfo(handle);

      // The payload data must be reachable, so `--json | base64 -d` works.
      expect(info.screenshot).toBeDefined();
      expect(info.screenshot?.url).toBe(DATA_URL);
      expect(info.screenshot?.mimeType).toBe('image/jpeg');
      expect(info.screenshot?.base64).toBe(JPEG_BASE64);
      expect(info.screenshot?.windowWidth).toBe(1280);
      expect(info.screenshot?.windowHeight).toBe(951);

      // The base64 payload really decodes to a JPEG (FF D8 FF magic bytes).
      const bytes = Buffer.from(info.screenshot?.base64 ?? '', 'base64');
      expect(bytes.length).toBeGreaterThan(0);
      expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xff, 0xd8, 0xff]);
    });

    it('reports raw payload keys for markers with no schema', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      const [handle] = await getMarkerHandles(querier, SCREENSHOT_MARKER_TYPE);
      const info = await querier.markerInfo(handle);

      // Screenshot markers have no schema, so `fields` stays empty; without
      // `rawFields` the payload would look absent entirely.
      const rawKeys = (info.rawFields ?? []).map((field) => field.key);
      expect(rawKeys).toEqual(
        expect.arrayContaining([
          'url',
          'windowID',
          'windowWidth',
          'windowHeight',
        ])
      );

      // The string-table index is resolved, not printed as a number...
      const urlField = info.rawFields?.find((field) => field.key === 'url');
      expect(urlField?.value.startsWith('data:image/jpeg;base64,')).toBe(true);
      // ...and truncated so it does not flood the terminal.
      expect(urlField?.truncated).toBe(true);
      expect(urlField?.value.length).toBeLessThan(DATA_URL.length);
    });
  });

  describe('markerScreenshot', function () {
    it('extracts the image for a screenshot marker', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      const [handle] = await getMarkerHandles(querier, SCREENSHOT_MARKER_TYPE);

      const result = await querier.markerScreenshot(handle);
      expect(result.type).toBe('marker-screenshot');
      expect(result.screenshot.base64).toBe(JPEG_BASE64);
      expect(screenshotFileExtension(result.screenshot)).toBe('jpg');
    });

    it('rejects a window-destroyed marker, which carries no image', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      const [handle] = await getMarkerHandles(
        querier,
        'CompositorScreenshotWindowDestroyed'
      );

      await expect(querier.markerScreenshot(handle)).rejects.toThrow(
        /carries no image/
      );
    });
  });

  describe('screenshots', function () {
    it('returns the frame covering an instant, one per window', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      const rootRange = getProfileRootRange(querier._store.getState());

      // t=25ms is covered by the 20-30ms frame of window 0x1 and by the
      // 5-40ms frame of window 0x2.
      const result = await querier.screenshots({ at: '25ms' });

      expect(result.screenshots).toHaveLength(2);
      const windowIDs = result.screenshots
        .map((entry) => entry.screenshot.windowID)
        .sort();
      expect(windowIDs).toEqual(['0x1', '0x2']);

      // Every returned frame really spans the requested instant.
      const at = rootRange.start + 25;
      for (const entry of result.screenshots) {
        expect(entry.start).toBeLessThanOrEqual(at);
        expect(entry.end ?? entry.start).toBeGreaterThanOrEqual(at);
      }

      // The window-destroyed marker must not be counted as a screenshot.
      expect(result.totalScreenshotCount).toBe(3);
    });

    it('returns every frame overlapping a range', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      const result = await querier.screenshots({ range: '0ms,45ms' });

      // All three image-carrying frames overlap the full range.
      expect(result.screenshots).toHaveLength(3);
      // Results are ordered by time.
      const starts = result.screenshots.map((entry) => entry.start);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });

    it('flags a preceding frame as stale rather than passing it off as the frame at the instant', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      const rootStart = getProfileRootRange(querier._store.getState()).start;

      // Window 0x1's last frame ends at 36ms and it is never destroyed, so at
      // t=50ms it is the last thing that window painted — useful, but not the
      // frame at that instant, so it must say so.
      const result = await querier.screenshots({ at: '50ms' });

      expect(result.screenshots.length).toBeGreaterThan(0);
      for (const entry of result.screenshots) {
        expect(entry.isFallback).toBe(true);
        // Reported staleness matches the gap between the frame's end and the
        // requested instant.
        const end = entry.end ?? entry.start;
        expect(entry.staleByMs).toBeCloseTo(rootStart + 50 - end, 3);
        expect(entry.staleByMs).toBeGreaterThan(0);
      }
    });

    it('drops windows destroyed before the instant', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());

      // Window 0x2 is destroyed at 35ms (fixture time 40ms). Its last frame is
      // not "what was on screen" at 50ms — that window no longer existed.
      const result = await querier.screenshots({ at: '50ms' });

      const windowIDs = result.screenshots.map(
        (entry) => entry.screenshot.windowID
      );
      expect(windowIDs).not.toContain('0x2');
      expect(windowIDs).toEqual(['0x1']);
    });

    it('resolves each window independently, mixing covering and stale frames', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      const rootStart = getProfileRootRange(querier._store.getState()).start;

      // At t=20ms window 0x2's 0-35ms frame spans the instant, while window
      // 0x1's frames (5-15ms, 15-36ms) — pick a time where only one window
      // covers, to prove the choice is per window and not all-or-nothing.
      const result = await querier.screenshots({ at: '20ms' });
      const at = rootStart + 20;

      // Every window is represented at most once, and each entry's isFallback
      // reflects that window's own frame, not a global decision.
      const byWindow = new Map(
        result.screenshots.map((entry) => [entry.screenshot.windowID, entry])
      );
      expect(byWindow.size).toBe(result.screenshots.length);
      for (const entry of result.screenshots) {
        const covers = entry.start <= at && (entry.end ?? entry.start) >= at;
        expect(entry.isFallback ?? false).toBe(!covers);
      }
    });

    it('requires exactly one of --at and --range', async function () {
      const querier = makeQuerier(getProfileWithScreenshots());
      await expect(querier.screenshots({})).rejects.toThrow(
        /Pass --at .* or --range/
      );
      await expect(
        querier.screenshots({ at: '1ms', range: '0ms,2ms' })
      ).rejects.toThrow(/only one/);
      await expect(querier.screenshots({ range: '5ms,1ms' })).rejects.toThrow(
        /end is before start/
      );
    });
  });
});
