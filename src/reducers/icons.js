/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import type { Action } from '../actions/types';
import type { IconWithClassName, State, Reducer } from './types';
import type { Node } from '../../common/types/profile-derived';

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

export const getIconForNode = (state: State, node: Node) => {
  // Without an intermediary variable, flow doesn't seem to be able to refine
  // node.icon type from `string | null` to `string`.
  // See https://github.com/facebook/flow/issues/3715
  const icons = getIcons(state);
  return (node.icon !== null && icons.has(node.icon)
    ? node.icon
    : null);
};

export const getIconClassNameForNode = createSelector(
  getIcons, (state, node) => node,
  (icons, node) =>
    (node.icon !== null && icons.has(node.icon)
      ? classNameFromUrl(node.icon)
      : null)
);

export const getIconsWithClassNames: (State => IconWithClassName[]) = createSelector(
  getIcons,
  icons => [...icons].map(icon => ({ icon, className: classNameFromUrl(icon) }))
);

