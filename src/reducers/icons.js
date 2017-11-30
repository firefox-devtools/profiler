/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import type { Action } from '../types/actions';
import type { IconWithClassName, State, Reducer } from '../types/reducers';
import type { CallNodeDisplayData } from '../types/profile-derived';

function classNameFromUrl(url) {
  return url.replace(/[/:.+>< ~()#,]/g, '_');
}

function favicons(state: Set<string> = new Set(), action: Action) {
  switch (action.type) {
    case 'ICON_HAS_LOADED':
      return new Set([...state, action.icon]);
    case 'ICON_IN_ERROR': // nothing to do
    default:
      return state;
  }
}

const iconsStateReducer: Reducer<Set<string>> = favicons;
export default iconsStateReducer;

export const getIcons = (state: State) => state.icons;

export const getIconForCallNode = (
  state: State,
  displayData: CallNodeDisplayData
) => {
  // Without an intermediary variable, flow doesn't seem to be able to refine
  // displayData.icon type from `string | null` to `string`.
  // See https://github.com/facebook/flow/issues/3715
  const icons = getIcons(state);
  return displayData.icon !== null && icons.has(displayData.icon)
    ? displayData.icon
    : null;
};

export const getIconClassNameForCallNode = createSelector(
  getIcons,
  (state, displayData: CallNodeDisplayData) => displayData,
  (icons, displayData: CallNodeDisplayData) =>
    displayData.icon !== null && icons.has(displayData.icon)
      ? classNameFromUrl(displayData.icon)
      : null
);

export const getIconsWithClassNames: State => IconWithClassName[] = createSelector(
  getIcons,
  icons => [...icons].map(icon => ({ icon, className: classNameFromUrl(icon) }))
);
