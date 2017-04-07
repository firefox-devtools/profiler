import { assert } from 'chai';
import sinon from 'sinon';
import { blankStore } from './fixtures/stores';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import { getView } from '../../reducers/app';
import { receiveProfileFromAddon, retrieveProfileFromWeb } from '../receive-profile';

import preprocessedProfile from '../../../common/test/fixtures/profile-2d-canvas.json';
import exampleProfile from '../../../../test/example-profile';

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
    let sandbox;

    const fetch404Response = { ok: false, status: 404 };
    const fetch500Response = { ok: false, status: 500 };
    const fetch200Response = {
      ok: true, status: 200,
      json: () => Promise.resolve(exampleProfile),
    };

    beforeEach(function () {
      sandbox = sinon.sandbox.create();
      sandbox.useFakeTimers();

      global.fetch = sinon.stub();
      global.fetch.resolves(fetch404Response);
    });

    afterEach(function () {
      sandbox.restore();
      sandbox = null;

      delete global.fetch;
    });

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
      global.fetch.withArgs(expectedUrl).onCall(1).resolves(fetch200Response);

      const store = blankStore();
      const dispatchPromise = store.dispatch(retrieveProfileFromWeb(hash));
      await global.fetch.lastCall.returnValue;

      assert.deepEqual(
        getView(store.getState()),
        { phase: 'INITIALIZING', additionalData: { attempt: { count: 1, total: 11 }}}
      );

      sandbox.clock.tick(1000);
      await dispatchPromise;

      const state = store.getState();
      assert.deepEqual(getView(state), { phase: 'PROFILE' });
      assert.deepEqual(ProfileViewSelectors.getDisplayRange(state), { start: 0, end: 1007 });
      assert.deepEqual(ProfileViewSelectors.getThreadOrder(state), [0, 2, 1]); // 1 is last because it's the Compositor thread
      assert.lengthOf(ProfileViewSelectors.getProfile(state).threads, 3); // not empty
    });

    it('fails in case the profile cannot be found after several tries', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const store = blankStore();
      const dispatchPromise = store.dispatch(retrieveProfileFromWeb(hash));
      for (let i = 1; i < 11; i++) {
        await global.fetch.lastCall.returnValue;

        assert.deepEqual(
          getView(store.getState()),
          { phase: 'INITIALIZING', additionalData: { attempt: { count: i, total: 11 }}}
        );

        sandbox.clock.tick(1000);
        await Promise.resolve(); // hack because the code uses a promise to wait 1 second
      }

      await dispatchPromise;

      assert.deepEqual(getView(store.getState()), { phase: 'FATAL_ERROR' });
    });

    it('fails in case the fetch returns a server error', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      global.fetch.resolves(fetch500Response);

      const store = blankStore();
      await store.dispatch(retrieveProfileFromWeb(hash));
      assert.deepEqual(getView(store.getState()), { phase: 'FATAL_ERROR' });
    });
  });
});
