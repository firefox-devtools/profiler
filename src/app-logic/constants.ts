/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { MarkerPhase } from 'firefox-profiler/types';

// The current version of the Gecko profile format.
// Please don't forget to update the gecko profile format changelog in
// `docs-developer/CHANGELOG-formats.md`.
export const GECKO_PROFILE_VERSION = 32;

// The current version of the "processed" profile format.
// Please don't forget to update the processed profile format changelog in
// `docs-developer/CHANGELOG-formats.md`.
export const PROCESSED_PROFILE_VERSION = 60;

// The following are the margin sizes for the left and right of the timeline. Independent
// components need to share these values.
export const TIMELINE_MARGIN_RIGHT = 15;
export const TIMELINE_MARGIN_LEFT = 150;

// Export the value for tests, and for computing the max height of the timeline
// for the splitter.
export const FULL_TRACK_SCREENSHOT_HEIGHT = 50;

// The following values are for network track.
export const TRACK_NETWORK_ROW_HEIGHT = 5;
export const TRACK_NETWORK_ROW_REPEAT = 7;
export const TRACK_NETWORK_HEIGHT =
  TRACK_NETWORK_ROW_HEIGHT * TRACK_NETWORK_ROW_REPEAT;

// The following values are for memory track.
export const TRACK_MEMORY_GRAPH_HEIGHT = 25;
export const TRACK_MEMORY_MARKERS_HEIGHT = 15;
export const TRACK_MEMORY_HEIGHT =
  TRACK_MEMORY_GRAPH_HEIGHT + TRACK_MEMORY_MARKERS_HEIGHT;
export const TRACK_MEMORY_LINE_WIDTH = 2;
export const TRACK_MEMORY_DEFAULT_COLOR = 'orange';

// The following values are for the bandwidth track.
export const TRACK_BANDWIDTH_HEIGHT = 25;
export const TRACK_BANDWIDTH_LINE_WIDTH = 2;
export const TRACK_BANDWIDTH_DEFAULT_COLOR = 'blue';

// The following values are for experimental event delay track.
export const TRACK_EVENT_DELAY_HEIGHT = 40;
export const TRACK_EVENT_DELAY_LINE_WIDTH = 2;

// The following values are for IPC track.
export const TRACK_IPC_MARKERS_HEIGHT = 25;
export const TRACK_IPC_HEIGHT = TRACK_IPC_MARKERS_HEIGHT;

// The following values are the defaults for marker tracks
export const TRACK_MARKER_HEIGHT = 25;
export const TRACK_MARKER_LINE_WIDTH = 2;
export const TRACK_MARKER_DEFAULT_COLOR = 'grey';

// Height of the blank area in process track.
export const TRACK_PROCESS_BLANK_HEIGHT = 30;

// Height of timeline ruler.
export const TIMELINE_RULER_HEIGHT = 20;

// Height of the power track.
export const TRACK_POWER_HEIGHT = 25;
export const TRACK_POWER_LINE_WIDTH = 2;
export const TRACK_POWER_DEFAULT_COLOR = 'grey';

// Height of the process cpu track.
export const TRACK_PROCESS_CPU_HEIGHT = 25;
export const TRACK_PROCESS_CPU_LINE_WIDTH = 2;

// JS Tracer has very high fidelity information, and needs a more fine-grained zoom.
export const JS_TRACER_MAXIMUM_CHART_ZOOM = 0.001;

// The following values are for the visual progress tracks.
export const TRACK_VISUAL_PROGRESS_HEIGHT = 40;
export const TRACK_VISUAL_PROGRESS_LINE_WIDTH = 2;

// =============================================================================
// Storage and server-related constants
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// For the 2 values GOOGLE_STORAGE_BUCKET and PROFILER_SERVER_ORIGIN, several
// values are possible, so that you can easily switch between existing server
// (both local or remote).
//
// GOOGLE_STORAGE_BUCKET
// ---------------------
// This defines which bucket we fetch profile data at load time.

// Google storage bucket, where production profile data is stored:
export const GOOGLE_STORAGE_BUCKET = 'profile-store';

// You can also use one of the following values instead:
// To use the bucket used by the server deployment for the main branch:
// export const GOOGLE_STORAGE_BUCKET = 'moz-fx-dev-firefoxprofiler-bucket';

// To use the bucket developers usually use on their local working copy:
// export const GOOGLE_STORAGE_BUCKET = 'profile-store-julien-dev';

// PROFILER_SERVER_ORIGIN
// ----------------------
// This defines our server-side endpoint. This is currently used to publish
// profiles and manage shortlinks.

// This is the production server:
export const PROFILER_SERVER_ORIGIN = 'https://api.profiler.firefox.com';

// This is the deployment from the main branch:
// export const PROFILER_SERVER_ORIGIN = 'https://dev.firefoxprofiler.nonprod.cloudops.mozgcp.net';

// This is your local server:
// export const PROFILER_SERVER_ORIGIN = 'http://localhost:5252';

// SYMBOL_SERVER_URL
// -----------------
// Can be overridden with the URL parameter `symbolServer=SERVERURL`.
// You can change this to run a local symbol server (for example using profiler-symbol-server [1])
// and set it to e.g. 'http://localhost:8000/'.
//
// [1] https://github.com/mstange/profiler-symbol-server/

// This is the default server.
export const SYMBOL_SERVER_URL = 'https://symbolication.services.mozilla.com';

// See the MarkerPhase type for more information.
export const INSTANT: MarkerPhase = 0;
export const INTERVAL: MarkerPhase = 1;
export const INTERVAL_START: MarkerPhase = 2;
export const INTERVAL_END: MarkerPhase = 3;
