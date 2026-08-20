/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Extraction of `CompositorScreenshot` marker payloads.
 *
 * Screenshot markers store their image as a `data:` URL in the profile's string
 * table, so `payload.url` is an *index*, not a string (see `ScreenshotPayload`
 * in `src/types/markers.ts`). These helpers resolve that index and split the
 * data URL so callers can write the image to disk.
 */

import { getProfile, getStringTable } from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import type { Marker, ThreadIndex } from 'firefox-profiler/types';
import type { StringTable } from 'firefox-profiler/utils/string-table';
import type { Store } from '../types/store';
import type { ThreadMap } from './thread-map';
import type { MarkerMap } from './marker-map';
import type {
  ScreenshotData,
  ScreenshotEntry,
  ScreenshotsResult,
  MarkerScreenshotResult,
  ElidedString,
  ElidedScreenshotData,
} from './types';

export const SCREENSHOT_MARKER_TYPE = 'CompositorScreenshot';

/**
 * Resolve a screenshot marker payload into a `ScreenshotData`.
 *
 * Returns null when the marker is not a screenshot, or is a
 * `CompositorScreenshotWindowDestroyed` marker — those share the
 * `CompositorScreenshot` payload type but carry no image (`url` is undefined).
 */
export function getScreenshotData(
  marker: Marker,
  stringTable: StringTable
): ScreenshotData | null {
  const data = marker.data;
  if (!data || data.type !== SCREENSHOT_MARKER_TYPE) {
    return null;
  }

  // Window-destroyed markers have `url: void`.
  const urlIndex = (data as any).url;
  if (urlIndex === undefined || urlIndex === null) {
    return null;
  }

  // `url` is an index into the string table, not a string. Be tolerant of an
  // already-resolved string in case an importer inlines it.
  const url =
    typeof urlIndex === 'number' ? stringTable.getString(urlIndex) : urlIndex;
  if (typeof url !== 'string' || url === '') {
    return null;
  }

  const screenshot: ScreenshotData = { url };

  // Parse "data:image/jpeg;base64,<payload>".
  const base64Marker = ';base64,';
  const base64Index = url.indexOf(base64Marker);
  if (url.startsWith('data:') && base64Index !== -1) {
    screenshot.mimeType = url.slice('data:'.length, base64Index);
    screenshot.base64 = url.slice(base64Index + base64Marker.length);
  }

  const { windowWidth, windowHeight, windowID } = data as any;
  if (typeof windowWidth === 'number') {
    screenshot.windowWidth = windowWidth;
  }
  if (typeof windowHeight === 'number') {
    screenshot.windowHeight = windowHeight;
  }
  if (windowID !== undefined) {
    screenshot.windowID = String(windowID);
  }

  return screenshot;
}

/**
 * A file extension for a screenshot, derived from its MIME type.
 * Defaults to `jpg` since Gecko captures screenshots as JPEG.
 */
export function screenshotFileExtension(screenshot: ScreenshotData): string {
  const mimeType = screenshot.mimeType;
  if (!mimeType) {
    return 'jpg';
  }
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default: {
      // "image/avif" -> "avif"
      const slash = mimeType.indexOf('/');
      const subtype = slash === -1 ? mimeType : mimeType.slice(slash + 1);
      return /^[a-z0-9]+$/.test(subtype) ? subtype : 'jpg';
    }
  }
}

/**
 * Replace a long string with a `{ elided, length, preview }` stand-in.
 *
 * Same shape as the elision `thread markers --list --json` applies to
 * `CompositorScreenshot.url`, so every command that can return a screenshot
 * agrees on how the blob is represented.
 */
export function elideString(value: string): ElidedString {
  return { elided: true, length: value.length, preview: value.slice(0, 64) };
}

/**
 * A `ScreenshotData` with its image bytes replaced by elision stand-ins.
 *
 * `--json` exists to be piped into `jq`; one frame is tens of kilobytes of
 * base64 and `screenshots` returns one per window, so the bytes are never
 * inlined. They are reachable as files via `-o`. Elision is keyed by field
 * identity rather than size, matching `--list --json`.
 */
export function elideScreenshotData(
  screenshot: ScreenshotData
): ElidedScreenshotData {
  const { base64, ...rest } = screenshot;
  return {
    ...rest,
    url: elideString(screenshot.url),
    base64: base64 === undefined ? undefined : elideString(base64),
  };
}

/**
 * Extract the screenshot image for a single marker handle.
 */
export function collectMarkerScreenshot(
  store: Store,
  markerMap: MarkerMap,
  threadMap: ThreadMap,
  markerHandle: string
): MarkerScreenshotResult {
  const state = store.getState();
  const { threadIndexes, markerIndex } =
    markerMap.markerForHandle(markerHandle);

  const threadSelectors = getThreadSelectors(threadIndexes);
  const fullMarkerList = threadSelectors.getFullMarkerList(state);
  const marker = fullMarkerList[markerIndex];
  if (!marker) {
    throw new Error(`Marker ${markerHandle} not found`);
  }

  const markerType = marker.data?.type;
  if (markerType !== SCREENSHOT_MARKER_TYPE) {
    throw new Error(
      `Marker ${markerHandle} is a "${markerType ?? 'payload-less'}" marker, not a ${SCREENSHOT_MARKER_TYPE} marker. ` +
        `Find screenshot markers with: thread markers --search ${SCREENSHOT_MARKER_TYPE} --list`
    );
  }

  const stringTable = getStringTable(state);
  const screenshot = getScreenshotData(marker, stringTable);
  if (!screenshot) {
    throw new Error(
      `Marker ${markerHandle} is a ${SCREENSHOT_MARKER_TYPE} marker but carries no image ` +
        `(window-destroyed markers only record a window ID).`
    );
  }

  return {
    type: 'marker-screenshot',
    markerHandle,
    threadHandle: threadMap.handleForThreadIndexes(threadIndexes),
    friendlyThreadName: threadSelectors.getFriendlyThreadName(state),
    start: marker.start,
    end: marker.end,
    screenshot,
  };
}

/**
 * Every thread index in the profile that could hold screenshot markers.
 */
function getAllThreadIndexes(store: Store): ThreadIndex[] {
  const profile = getProfile(store.getState());
  return profile.threads.map((_thread, threadIndex) => threadIndex);
}

/**
 * The time at which each window was destroyed, keyed the same way as
 * `windowKey`. `CompositorScreenshotWindowDestroyed` markers carry a `windowID`
 * but no image, so they are the only record that a window went away.
 */
function collectWindowDestroyTimes(
  store: Store,
  threadMap: ThreadMap
): Map<string, number> {
  const state = store.getState();
  const destroyTimes = new Map<string, number>();

  for (const threadIndex of getAllThreadIndexes(store)) {
    const threadIndexes = new Set([threadIndex]);
    const fullMarkerList =
      getThreadSelectors(threadIndexes).getFullMarkerList(state);
    let threadHandle: string | null = null;

    for (const marker of fullMarkerList) {
      const data = marker.data;
      if (
        data?.type !== SCREENSHOT_MARKER_TYPE ||
        marker.name !== 'CompositorScreenshotWindowDestroyed'
      ) {
        continue;
      }
      const windowID = (data as any).windowID;
      if (windowID === undefined) {
        continue;
      }
      if (threadHandle === null) {
        threadHandle = threadMap.handleForThreadIndexes(threadIndexes);
      }
      const key = windowKey(threadHandle, String(windowID));
      // Keep the earliest destroy time for a window ID, in case an ID is reused.
      const previous = destroyTimes.get(key);
      if (previous === undefined || marker.start < previous) {
        destroyTimes.set(key, marker.start);
      }
    }
  }

  return destroyTimes;
}

/** Key identifying one window within one thread. */
function windowKey(threadHandle: string, windowID: string | undefined): string {
  return `${threadHandle}:${windowID ?? ''}`;
}

/**
 * Find screenshots at an instant or over a range, across all threads.
 *
 * For `at`, resolves each window independently: if one of that window's frames
 * spans the instant, that is the frame that was on screen. Screenshot markers
 * are intervals running from one composite to the next, so a spanning frame is
 * an exact answer.
 *
 * A window with no spanning frame falls back to its latest preceding frame,
 * which is the last thing that window painted — useful, but not literally the
 * frame at that instant, so it is flagged `isFallback` with `staleByMs`. Windows
 * destroyed before the instant are dropped entirely: their last frame is not
 * "what was on screen", it is a window that no longer existed.
 */
export function collectScreenshots(
  store: Store,
  markerMap: MarkerMap,
  threadMap: ThreadMap,
  options: { at?: number; range?: { start: number; end: number } }
): ScreenshotsResult {
  const state = store.getState();
  const stringTable = getStringTable(state);

  let totalScreenshotCount = 0;
  const candidates: ScreenshotEntry[] = [];

  for (const threadIndex of getAllThreadIndexes(store)) {
    const threadIndexes = new Set([threadIndex]);
    const threadSelectors = getThreadSelectors(threadIndexes);
    const fullMarkerList = threadSelectors.getFullMarkerList(state);

    let threadHandle: string | null = null;
    let friendlyThreadName: string | null = null;

    for (
      let markerIndex = 0;
      markerIndex < fullMarkerList.length;
      markerIndex++
    ) {
      const marker = fullMarkerList[markerIndex];
      if (marker.data?.type !== SCREENSHOT_MARKER_TYPE) {
        continue;
      }
      const screenshot = getScreenshotData(marker, stringTable);
      if (!screenshot) {
        // Window-destroyed marker: no image.
        continue;
      }
      totalScreenshotCount++;

      // Screenshot markers are intervals; treat a missing end as an instant.
      const start = marker.start;
      const end = marker.end ?? marker.start;

      if (options.range) {
        // Any overlap with the requested range.
        if (start > options.range.end || end < options.range.start) {
          continue;
        }
      } else if (options.at !== undefined) {
        // Keep every frame starting at or before the instant: the covering
        // frame, plus earlier ones used as a fallback when none covers it.
        if (start > options.at) {
          continue;
        }
      }

      if (threadHandle === null) {
        threadHandle = threadMap.handleForThreadIndexes(threadIndexes);
        friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
      }

      candidates.push({
        markerHandle: markerMap.handleForMarker(threadIndexes, markerIndex),
        threadHandle,
        friendlyThreadName: friendlyThreadName as string,
        start,
        end: marker.end,
        screenshot,
      });
    }
  }

  let screenshots: ScreenshotEntry[];
  if (options.at !== undefined) {
    const at = options.at;
    const destroyTimes = collectWindowDestroyTimes(store, threadMap);

    // Resolve each window on its own: a frame spanning the instant if the window
    // has one, otherwise that window's latest preceding frame.
    const bestByWindow = new Map<string, ScreenshotEntry>();
    for (const entry of candidates) {
      const key = windowKey(entry.threadHandle, entry.screenshot.windowID);

      // Drop windows that were already destroyed at the requested instant.
      const destroyedAt = destroyTimes.get(key);
      if (destroyedAt !== undefined && destroyedAt <= at) {
        continue;
      }

      const covers = entry.start <= at && (entry.end ?? entry.start) >= at;
      const previous = bestByWindow.get(key);
      if (previous === undefined) {
        bestByWindow.set(key, entry);
        continue;
      }
      const previousCovers =
        previous.start <= at && (previous.end ?? previous.start) >= at;
      // A spanning frame always beats a preceding one; between two of the same
      // kind, the later one is closer to the instant.
      if ((covers && !previousCovers) || entry.start > previous.start) {
        bestByWindow.set(key, entry);
      }
    }

    screenshots = [...bestByWindow.values()].map((entry) => {
      const end = entry.end ?? entry.start;
      if (entry.start <= at && end >= at) {
        return entry;
      }
      // Preceding frame, not a spanning one: say so, and by how much.
      return { ...entry, isFallback: true, staleByMs: at - end };
    });
  } else {
    screenshots = candidates;
  }

  screenshots.sort((a, b) => a.start - b.start);

  return {
    type: 'screenshots',
    at: options.at,
    range: options.range,
    totalScreenshotCount,
    screenshots,
  };
}
