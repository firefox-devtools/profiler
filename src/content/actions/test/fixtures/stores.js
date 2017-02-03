import createStore from '../../../create-store';
import { receiveProfileFromAddon } from '../../';
import exampleProfile from '../../../../../test/timings-with-js';
import { preprocessProfile } from '../../../preprocess-profile';

export function blankStore() {
  return createStore();
}

export function storeWithProfile() {
  const store = createStore();
  store.dispatch(receiveProfileFromAddon(preprocessProfile(exampleProfile)));
  return store;
}
