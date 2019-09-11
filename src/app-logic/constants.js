/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// The current version of the Gecko profile format.
export const GECKO_PROFILE_VERSION = 16;

// The current version of the "processed" profile format.
export const PROCESSED_PROFILE_VERSION = 24;

// The following are the margin sizes for the left and right of the timeline. Independent
// components need to share these values.
export const TIMELINE_MARGIN_RIGHT = 15;
export const TIMELINE_MARGIN_LEFT = 150;

export const TIMELINE_SETTINGS_HEIGHT = 26;

// Export the value for tests, and for computing the max height of the timeline
// for the splitter.
export const TRACK_SCREENSHOT_HEIGHT = 50;

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

// Height of the blank area in process track.
export const TRACK_PROCESS_BLANK_HEIGHT = 30;

// Height of timeline ruler.
export const TIMELINE_RULER_HEIGHT = 20;
