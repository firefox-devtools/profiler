/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getSelectedTab } from 'firefox-profiler/selectors/url-state';
import type { State } from 'firefox-profiler/types';

export const VIEW_CONTEXT_START = '<current_view>';

/**
 * Describe what the user is looking at, for the end of each user message.
 * `status` is the profiler-cli `status` output (selected thread, committed
 * ranges, filters).
 */
export function buildViewContext(state: State, status: string): string {
  return `${VIEW_CONTEXT_START}\nSelected tab: ${getSelectedTab(state)}\n${status}\n</current_view>`;
}
