/**
 * @jest-environment jsdom
 */
import * as urlStateReducers from '../content/reducers/url-state';
import { stateFromLocation } from '../content/url-handling';
import { blankStore } from './fixtures/stores';
import exampleProfile from './fixtures/profiles/example-profile';
import { processProfile } from '../content/process-profile';
import { receiveProfileFromStore } from '../content/actions/receive-profile';

describe('selectedThread', function () {
  function storeWithThread(threadIndex) {
    const store = blankStore();
    const urlState = stateFromLocation({
      pathname: '/public/1ecd7a421948995171a4bb483b7bcc8e1868cc57/calltree/',
      search: `?thread=${threadIndex}`,
      hash: '',
    });
    store.dispatch({ type: '@@urlenhancer/updateURLState', urlState });

    return store;
  }

  it('selects the right thread when receiving a profile from web', function () {
    const profile = processProfile(exampleProfile);

    const store = storeWithThread(1);
    store.dispatch(receiveProfileFromStore(profile));

    expect(urlStateReducers.getSelectedThreadIndex(store.getState())).toBe(1);
  });

  it('selects a default thread when a wrong thread has been requested', function () {
    const profile = processProfile(exampleProfile);

    const store = storeWithThread(100);
    store.dispatch(receiveProfileFromStore(profile));

    // "2" is the content process' main tab
    expect(urlStateReducers.getSelectedThreadIndex(store.getState())).toBe(2);
  });
});
