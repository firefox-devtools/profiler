import { combineReducers } from 'redux';
import { createSelector } from 'reselect';
import type { IconWithClassName } from './types';

function classNameFromUrl(url) {
  return url.replace(/[/:.+>< ~()#,]/g, '_');
}

function favicons(state: Set<string>, action: Action) {
  switch (action.type) {
    case 'ICON_HAS_LOADED':
      return new Set([...state, action.icon]);
    case 'ICON_IN_ERROR': // nothing to do
    default:
      return state;
  }
}

const iconsStateReducer: Reducer<IconsState> = combineReducers({ favicons });
export default iconsStateReducer;

export const getIcons = (state: State): Set<string> => state.icons.favicons;
export const getIconForNode = (state: State, node): string => getIcons(state).has(node.icon) ? node.icon : null;
export const getIconClassNameForNode = createSelector(
  getIcons, (state, node) => node,
  (icons, node) => (icons.has(node.icon) ? classNameFromUrl(node.icon) : null)
);
export const getIconsWithClassNames: (State => IconWithClassName[]) = createSelector(
  getIcons,
  icons => [...icons].map(icon => ({ icon, className: classNameFromUrl(icon) }))
);

