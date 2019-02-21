/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { stripIndent } from 'common-tags';
import type { GetState } from '../types/store';
import { getProfile } from '../selectors/profile';
import { selectedThreadSelectors } from '../selectors/per-thread';

// Despite providing a good libdef for Object.defineProperty, Flow still
// special-cases the `value` property: if it's missing it throws an error. Using
// this indirection seems to work around this issue.
// See https://github.com/facebook/flow/issues/285
const defineProperty = Object.defineProperty;

/**
 * This function adds various values from the Redux Store to the window object so that
 * people can access useful things.
 */
export function addDataToWindowObject(
  getState: GetState,
  target: Object = window
) {
  defineProperty(target, 'profile', {
    enumerable: true,
    get() {
      return getProfile(getState());
    },
  });

  defineProperty(target, 'filteredThread', {
    enumerable: true,
    get() {
      return selectedThreadSelectors.getPreviewFilteredThread(getState());
    },
  });

  defineProperty(target, 'callTree', {
    enumerable: true,
    get() {
      return selectedThreadSelectors.getCallTree(getState());
    },
  });
}

export function logFriendlyPreamble() {
  /**
   * Provide a friendly message to the end user to notify them that they can access certain
   * values from the global window object. These variables are set in an ad-hoc fashion
   * throughout the code.
   */
  const intro = `font-size: 130%;`;
  const bold = `font-weight: bold;`;
  const link = `font-style: italic; text-decoration: underline;`;
  const reset = '';
  console.log(
    // This is gratuitous, I know:
    [
      '%c                  __ _     _             _ ',
      '                 / _| |   | |           | |',
      ' _ __   ___ _ __| |_| |__ | |_ _ __ ___ | |',
      "| '_ \\ / _ \\ '__|  _| '_ \\| __| '_ ` _ \\| |",
      '| |_) |  __/ |  | |_| | | | |_| | | | | | |',
      '| .__/ \\___|_|  |_(_)_| |_|\\__|_| |_| |_|_|',
      '| |                                        ',
      '|_|                                        ',
    ].join('\n'),
    'font-family: monospace;'
  );

  console.log(
    stripIndent`
      %cThe following profiler information is available via the console:%c

      %cwindow.profile%c - The currently loaded profile
      %cwindow.filteredThread%c - The current filtered thread
      %cwindow.callTree%c - The call tree of the current filtered thread

      The profile format is documented here:
      %chttps://github.com/firefox-devtools/profiler/blob/master/docs-developer/processed-profile-format.md%c

      The CallTree class's source code is available here:
      %chttps://github.com/firefox-devtools/profiler/blob/master/src/profile-logic/call-tree.js%c
    `,
    intro,
    reset,
    bold,
    reset,
    bold,
    reset,
    bold,
    reset,
    link,
    reset,
    link,
    reset
  );
}
