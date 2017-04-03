// @flow
import type { Action, ThunkAction } from './types';

export function iconHasLoaded(icon): Action {
  return {
    type: 'ICON_HAS_LOADED',
    icon,
  };
}

export function iconIsInError(icon): Action {
  return {
    type: 'ICON_IN_ERROR',
    icon,
  };
}

const icons = new Map();

function getIconForNode(node) {
  if (!node.icon) {
    return Promise.resolve(null);
  }

  if (icons.has(node.icon)) {
    return icons.get(node.icon);
  }

  const result = new Promise(resolve => {
    const image = new Image();
    image.src = node.icon;
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      resolve(node.icon);
    };
    image.onerror = () => {
      resolve(null);
    };
  });

  icons.set(node.icon, result);
  return result;
}

export function iconStartLoad(icon): ThunkAction {
  return dispatch => {
    getIconForNode(icon)
  };
}
