import createStore from '../../content/create-store';
import { receiveProfileFromAddon } from '../../content/actions/receive-profile';
import exampleProfile from './profiles/timings-with-js';
import { preprocessProfile } from '../../content/preprocess-profile';

export function blankStore() {
  return createStore();
}

export function storeWithProfile() {
  const store = createStore();
  store.dispatch(receiveProfileFromAddon(preprocessProfile(exampleProfile)));
  return store;
}
