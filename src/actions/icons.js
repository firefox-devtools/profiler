/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action, ThunkAction } from 'firefox-profiler/types';

export function iconHasLoaded(icon: string): Action {
  return {
    type: 'ICON_HAS_LOADED',
    icon,
  };
}

export function iconIsInError(icon: string): Action {
  return {
    type: 'ICON_IN_ERROR',
    icon,
  };
}

const icons: Set<string> = new Set();

type IconRequestResult = 'loaded' | 'error' | 'cached';

function _getIcon(icon: string): Promise<IconRequestResult> {
  if (icons.has(icon)) {
    return Promise.resolve('cached');
  }

  icons.add(icon);

  const result = new Promise((resolve) => {
    const image = new Image();
    image.src = icon;
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      resolve('loaded');
    };
    image.onerror = () => {
      resolve('error');
    };
  });

  return result;
}

export function iconStartLoading(icon: string): ThunkAction<Promise<void>> {
  return (dispatch) => {
    return _getIcon(icon).then((result) => {
      switch (result) {
        case 'loaded':
          dispatch(iconHasLoaded(icon));
          break;
        case 'error':
          dispatch(iconIsInError(icon));
          break;
        case 'cached':
          // nothing to do
          break;
        default:
          throw new Error(`Unknown icon load result ${result}`);
      }
    });
  };
}
