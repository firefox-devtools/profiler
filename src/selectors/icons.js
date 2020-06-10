/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import type {
  IconWithClassName,
  IconState,
  Selector,
  DangerousSelectorWithArguments,
} from 'firefox-profiler/types';

/**
 * A simple selector into the icon state.
 */
export const getIcons: Selector<IconState> = state => state.icons;

/**
 * In order to load icons without multiple requests, icons are created through
 * CSS. This function gets the CSS class name for a icon url. This function
 * does not perform any memoization, and updates every time. It could be updated
 * to memoize.
 */
export const getIconClassName: DangerousSelectorWithArguments<
  string,
  string | null
> = (state, icon) => {
  const icons = getIcons(state);
  return icon !== null && icons.has(icon) ? _classNameFromUrl(icon) : '';
};

/**
 * This functions returns an object with both the icon URL and the class name.
 */
export const getIconsWithClassNames: Selector<
  IconWithClassName[]
> = createSelector(getIcons, icons =>
  [...icons].map(icon => ({ icon, className: _classNameFromUrl(icon) }))
);

/**
 * Transforms a URL into a valid CSS class name.
 */
function _classNameFromUrl(url): string {
  return url.replace(/[/:.+>< ~()#,]/g, '_');
}
