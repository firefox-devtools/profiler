import { assert } from 'chai';
import sinon from 'sinon';
import { blankStore } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../content/reducers/profile-view';
import { getView } from '../../content/reducers/app';
import { receiveProfileFromAddon, retrieveProfileFromWeb } from '../../content/actions/receive-profile';

import preprocessedProfile from '../fixtures/profiles/profile-2d-canvas.json';
import exampleProfile from '../fixtures/profiles/example-profile';

describe('actions/receive-profile', function () {
  describe('receiveProfileFromAddon', function () {
    it('can take a profile from an addon and save it to state', function () {
      const store = blankStore();

      const initialProfile = ProfileViewSelectors.getProfile(store.getState());
      assert.ok(initialProfile, 'A blank profile initially exists');
      assert.lengthOf(initialProfile.threads, 0, 'The blank profile contains no data');
      store.dispatch(receiveProfileFromAddon(preprocessedProfile));
      assert.strictEqual(ProfileViewSelectors.getProfile(store.getState()), preprocessedProfile, 'The passed in profile is saved in state.');
    });
  });

  describe('retrieveProfileFromWeb', function () {
    const fetch404Response = { ok: false, status: 404 };
    const fetch500Response = { ok: false, status: 500 };
    const fetch200Response = {
      ok: true, status: 200,
      json: () => Promise.resolve(exampleProfile),
    };

    beforeEach(function () {
      // The stub makes it easy to return different values for different
      // arguments. Here we define the default return value because there is no
      // argument specified.
      global.fetch = sinon.stub();
      global.fetch.resolves(fetch404Response);

      sinon.stub(global, 'setTimeout').yieldsAsync(); // will call its argument asynchronously
    });

    afterEach(function () {
      delete global.fetch;
      global.setTimeout.restore();
    });

    /**
     * This function allows to observe all state changes in a Redux store while
     * something's going on.
     * @param {ReduxStore} store
     * @param {() => Promise<any>} func Process that will be started while
     * observing the store.
     * @returns {Promise<State[]>} All states that happened while waiting for
     * the end of func.
     */
    async function observeStoreStateChanges(store, func) {
      const states = [];
      const unsubscribe = store.subscribe(() => {
        states.push(store.getState());
      });

      await func();

      unsubscribe();
      return states;
    }

    it('can retrieve a profile from the web and save it to state', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const expectedUrl = `https://profile-store.commondatastorage.googleapis.com/${hash}`;
      global.fetch.withArgs(expectedUrl).resolves(fetch200Response);

      const store = blankStore();
      await store.dispatch(retrieveProfileFromWeb(hash));

      const state = store.getState();
      assert.deepEqual(getView(state), { phase: 'PROFILE' });
      assert.deepEqual(ProfileViewSelectors.getDisplayRange(state), { start: 0, end: 1007 });
      assert.deepEqual(ProfileViewSelectors.getThreadOrder(state), [0, 2, 1]); // 1 is last because it's the Compositor thread
      assert.lengthOf(ProfileViewSelectors.getProfile(state).threads, 3); // not empty
    });

    it('requests several times in case of 404', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const expectedUrl = `https://profile-store.commondatastorage.googleapis.com/${hash}`;
      // The first call will still be a 404 -- remember, it's the default return value.
      global.fetch.withArgs(expectedUrl).onSecondCall().resolves(fetch200Response);

      const store = blankStore();
      const views = (await observeStoreStateChanges(
        store,
        () => store.dispatch(retrieveProfileFromWeb(hash))
      )).map(state => getView(state));

      assert.deepEqual(
        views,
        [
          { phase: 'INITIALIZING' },
          { phase: 'INITIALIZING', additionalData: { attempt: { count: 1, total: 11 }}},
          { phase: 'PROFILE' },
        ]
      );

      const state = store.getState();
      assert.deepEqual(ProfileViewSelectors.getDisplayRange(state), { start: 0, end: 1007 });
      assert.deepEqual(ProfileViewSelectors.getThreadOrder(state), [0, 2, 1]); // 1 is last because it's the Compositor thread
      assert.lengthOf(ProfileViewSelectors.getProfile(state).threads, 3); // not empty
    });

    it('fails in case the profile cannot be found after several tries', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const store = blankStore();
      const views = (await observeStoreStateChanges(
        store,
        () => store.dispatch(retrieveProfileFromWeb(hash))
      )).map(state => getView(state));

      const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      assert.deepEqual(
        views,
        [
          { phase: 'INITIALIZING' },
          ...steps.map(step => ({ phase: 'INITIALIZING', additionalData: { attempt: { count: step, total: 11 }}})),
          // errors do not have any inherited properties so we don't need to specify the actual error for deepEqual to succeed
          { phase: 'FATAL_ERROR', error: new Error() },
        ]
      );
    });

    it('fails in case the fetch returns a server error', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      global.fetch.resolves(fetch500Response);

      const store = blankStore();
      await store.dispatch(retrieveProfileFromWeb(hash));
      // errors do not have any inherited properties so we don't need to specify the actual error for deepEqual to succeed
      assert.deepEqual(getView(store.getState()), { phase: 'FATAL_ERROR', error: new Error() });
    });
  });
});
