/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action, ThunkAction } from 'firefox-profiler/types';
import sha1 from 'firefox-profiler/utils/sha1';

export function iconHasLoaded(iconWithClassName: [string, string]): Action {
  return {
    type: 'ICON_HAS_LOADED',
    iconWithClassName,
  };
}

export function iconIsInError(icon: string): Action {
  return {
    type: 'ICON_IN_ERROR',
    icon,
  };
}

const icons: Set<string> = new Set();

type IconRequestResult =
  | {| type: 'error' | 'cached' |}
  | {| type: 'loaded', iconWithClassName: [string, string] |};

async function _getIcon(icon: string): Promise<IconRequestResult> {
  if (icons.has(icon)) {
    return Promise.resolve({ type: 'cached' });
  }

  icons.add(icon);
  const className = await _classNameFromUrl(icon);

  const result = new Promise((resolve) => {
    const image = new Image();
    image.src = icon;
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      resolve({ type: 'loaded', iconWithClassName: [icon, className] });
    };
    image.onerror = () => {
      resolve({ type: 'error' });
    };
  });

  return result;
}

export function iconStartLoading(icon: string): ThunkAction<Promise<void>> {
  return (dispatch) => {
    return _getIcon(icon).then((result) => {
      switch (result.type) {
        case 'loaded':
          dispatch(iconHasLoaded(result.iconWithClassName));
          break;
        case 'error':
          dispatch(iconIsInError(icon));
          break;
        case 'cached':
          // nothing to do
          break;
        default:
          throw new Error(`Unknown icon load result ${result.type}`);
      }
    });
  };
}

/**
 * Transforms a URL into a valid CSS class name.
 */
async function _classNameFromUrl(url): Promise<string> {
  return url.startsWith('data:image/')
    ? 'dataUrl' + (await sha1(url))
    : url.replace(/[/:.+>< ~()#,]/g, '_');
}
