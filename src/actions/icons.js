/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  Action,
  ThunkAction,
  IconWithClassName,
} from 'firefox-profiler/types';

export function iconHasLoaded(iconWithClassName: {
  readonly icon: string,
  readonly className: string,
}): Action {
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
let iconCounter = 0;

type IconRequestResult =
  | { type: 'error' | 'cached' }
  | {
      type: 'loaded',
      iconWithClassName: IconWithClassName,
    };

async function _getIcon(icon: string): Promise<IconRequestResult> {
  if (icons.has(icon)) {
    return Promise.resolve({ type: 'cached' });
  }

  icons.add(icon);

  // New class name for an icon. They are guaranteed to be unique, that's why
  // just increment the icon counter and return that string.
  const className = `favicon-${++iconCounter}`;

  const result = new Promise((resolve) => {
    const image = new Image();
    image.src = icon;
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      resolve({ type: 'loaded', iconWithClassName: { icon, className } });
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
 * Batch load the data url icons.
 *
 * We don't need to check if they are valid images or not, so we can omit doing
 * this extra work for these icons. Just add them directly to our cache and state.
 */
export function batchLoadDataUrlIcons(
  iconsToAdd: Array<string | null>
): ThunkAction<void> {
  return (dispatch) => {
    const newIcons = [];
    for (const icon of iconsToAdd) {
      if (!icon || icons.has(icon)) {
        continue;
      }

      icons.add(icon);

      // New class name for an icon. They are guaranteed to be unique, that's why
      // just increment the icon counter and return that string.
      const className = `favicon-${++iconCounter}`;
      newIcons.push({ icon, className });
    }

    dispatch({
      type: 'ICON_BATCH_ADD',
      icons: newIcons,
    });
  };
}

/**
 * Only use it in tests!
 */
export function _resetIconCounter() {
  iconCounter = 0;
}
