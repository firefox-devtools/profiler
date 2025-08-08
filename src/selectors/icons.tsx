/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type {
  IconsWithClassNames,
  Selector,
  DangerousSelectorWithArguments,
} from 'firefox-profiler/types';

/**
 * A simple selector into the icon state.
 * It returns a map that matches icon to the icon class name.
 */
export const getIconsWithClassNames: Selector<IconsWithClassNames> = (state) =>
  state.icons;

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
  if (icon === null) {
    return '';
  }
  const icons = getIconsWithClassNames(state);
  return icons.get(icon) ?? '';
};
