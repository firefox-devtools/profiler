/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Importer for the "streamed profile" format (JSON Lines / .jsonl).
 *
 * This format is produced by tools like resourcemonitor.py and streams one
 * JSON object per line:
 *
 *   Line 1:  {"type":"meta", ...}   — profile metadata (markerSchema, categories, etc.)
 *   Line 2:  {"type":"thread", ...} — thread declaration and structure
 *   Line 3+: {"type":"marker", ...} — one marker per line
 *
 * Threads must be declared before any markers that belong to them. The
 * importer passes through meta and thread objects from the input, only
 * adding the parsed marker columnar arrays and the stringArray populated
 * from marker names. The producing tool is responsible for emitting a
 * structure that matches its declared preprocessedProfileVersion, including
 * any required tables (stackTable, frameTable, etc.). The standard profile
 * upgraders then migrate the result to the current version.
 *
 * ## Future extensibility (comments only — nothing is implemented yet):
 *
 * - In the future there may be one JSON Lines file streamed *per process*,
 *   not just one global file. The importer would then need to merge multiple
 *   files or accept a list of streams.
 *
 * - "type": "counter" and "type": "sample" lines are expected to be added
 *   when streaming profiles that contain more than just markers (e.g. CPU
 *   sampling data, performance counters).
 *
 * - A `tid` (thread ID) attribute is expected to be included in each line
 *   in the future to route markers to different threads. When `tid` is
 *   absent, the marker belongs to the first declared thread.
 *
 * - The current resource-usage profiles are a simple case: single process,
 *   single thread. But the format is designed to support multi-process,
 *   multi-thread profiles in the future.
 */

import type { MarkerPhase } from 'firefox-profiler/types/gecko-profile';
import { INSTANT, INTERVAL } from 'firefox-profiler/app-logic/constants';
import { StringTable } from 'firefox-profiler/utils/string-table';

/**
 * Detect whether the input string is a streamed profile in JSON Lines format.
 * The first line always starts with {"type":"meta" (the "type" key is
 * guaranteed to be the first key), so we can detect the format by checking
 * for this prefix without parsing the entire line.
 */
export function isStreamedProfileFormat(profile: string): boolean {
  return profile.startsWith('{"type":"meta"');
}

/**
 * Convert a streamed profile (JSON Lines) string into a profile object
 * that the standard profile upgraders can process. The meta and thread
 * objects are passed through from the input; the importer only builds
 * the marker columnar arrays and the stringArray.
 */
export function convertStreamedProfile(profileText: string): any {
  const lines = profileText.split('\n').filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    throw new Error('Streamed profile is empty.');
  }

  // --- Parse meta line ---
  const metaObj = JSON.parse(lines[0]);
  if (metaObj.type !== 'meta') {
    throw new Error('First line of streamed profile must be a "meta" object.');
  }

  const { type: _metaType, ...meta } = metaObj;

  // --- Parse remaining lines ---
  // Threads must be declared (via type=thread lines) before markers can
  // reference them. Currently there is only one thread per file; in the
  // future, markers will use a `tid` field to target a specific thread.
  const version = meta.preprocessedProfileVersion ?? 0;

  // Marker names in the streamed format are human-readable strings. The
  // importer interns them into a stringArray with numeric indices, as
  // expected by the processed profile format. Before version 56 the
  // stringArray lives on each thread; from version 56 onward it is shared
  // across all threads in profile.shared.stringArray.
  const useSharedStringArray = version >= 56;
  const stringArray: string[] = [];
  const stringTable = StringTable.withBackingArray(stringArray);

  let thread: Record<string, any> | null = null;

  for (let i = 1; i < lines.length; i++) {
    const lineObj = JSON.parse(lines[i]);

    switch (lineObj.type) {
      case 'thread': {
        const { type: _type, ...threadObj } = lineObj;
        if (!useSharedStringArray) {
          threadObj.stringArray = stringArray;
        }
        threadObj.markers = {
          name: [] as number[],
          startTime: [] as Array<number | null>,
          endTime: [] as Array<number | null>,
          phase: [] as MarkerPhase[],
          category: [] as number[],
          data: [] as Array<any>,
          length: 0,
        };
        thread = threadObj;
        break;
      }
      case 'marker': {
        if (thread === null) {
          throw new Error(
            'Streamed profile contains a marker before any thread declaration.'
          );
        }
        // Future: use lineObj.tid to look up the target thread.
        const { markers } = thread;
        markers.name.push(stringTable.indexForString(lineObj.name));
        markers.startTime.push(lineObj.startTime ?? null);
        const endTime: number | null = lineObj.endTime ?? null;
        markers.endTime.push(endTime);
        markers.phase.push(endTime === null ? INSTANT : INTERVAL);
        markers.category.push(lineObj.category ?? 0);
        markers.data.push(lineObj.data ?? null);
        markers.length++;
        break;
      }
      default:
        // Future: handle "counter", "sample", and other line types here.
        break;
    }
  }

  if (thread === null) {
    throw new Error('Streamed profile contains no thread declaration.');
  }

  const profile: any = {
    meta,
    libs: [],
    threads: [thread],
  };

  if (useSharedStringArray) {
    profile.shared = { stringArray };
  }

  return profile;
}
