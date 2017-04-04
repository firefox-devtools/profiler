// @flow
import type { Action, ThunkAction } from './types';

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

function getIcon(icon: string): Promise<IconRequestResult> {
  if (icons.has(icon)) {
    return Promise.resolve('cached');
  }

  icons.add(icon);

  const result = new Promise(resolve => {
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

export function iconStartLoading(icon: string): ThunkAction {
  return dispatch => {
    getIcon(icon).then(result => {
      switch (result) {
        case 'loaded':
          dispatch(iconHasLoaded(icon));
          break;
        case 'error':
          dispatch(iconIsInError(icon));
          break;
        case 'cached':
          // nothing to do
      }
    });
  };
}
