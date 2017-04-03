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

const icons: Map<string, Promise<string | null>> = new Map();

function getIcon(icon: string): Promise<string | null> {
  if (!icon) {
    return Promise.resolve(null);
  }

  if (icons.has(icon)) {
    return icons.get(icon);
  }

  const result = new Promise(resolve => {
    const image = new Image();
    image.src = icon;
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      resolve(icon);
    };
    image.onerror = () => {
      resolve(null);
    };
  });

  icons.set(icon, result);
  return result;
}

export function iconStartLoading(icon: string): ThunkAction {
  return dispatch => {
    getIcon(icon).then(result => {
      if (result) {
        dispatch(iconHasLoaded(icon));
      } else {
        dispatch(iconIsInError(icon));
      }
    });
  };
}
