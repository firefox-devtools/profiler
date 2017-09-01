/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import sinon from 'sinon';
import { blankStore } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import * as UrlStateSelectors from '../../reducers/url-state';
import { getView } from '../../reducers/app';
import {
  receiveProfileFromAddon,
  retrieveProfileFromAddon,
  retrieveProfileFromStore,
  retrieveProfileFromUrl,
} from '../../actions/receive-profile';

import preprocessedProfile from '../fixtures/profiles/profile-2d-canvas.json';
import exampleProfile from '../fixtures/profiles/example-profile';

describe('actions/receive-profile', function() {
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

  describe('receiveProfileFromAddon', function() {
    it('can take a profile from an addon and save it to state', function() {
      const store = blankStore();

      const initialProfile = ProfileViewSelectors.getProfile(store.getState());
      expect(initialProfile).toBeTruthy();
      expect(initialProfile.threads).toHaveLength(0);
      store.dispatch(receiveProfileFromAddon(preprocessedProfile));
      expect(ProfileViewSelectors.getProfile(store.getState())).toBe(
        preprocessedProfile
      );
    });
  });

  describe('retrieveProfileFromAddon', function() {
    let geckoProfiler;
    let clock;

    beforeEach(function() {
      clock = sinon.useFakeTimers();

      geckoProfiler = {
        getProfile: () => Promise.resolve(exampleProfile()),
        getSymbolTable: () => Promise.resolve(),
      };
      window.geckoProfilerPromise = Promise.resolve(geckoProfiler);
    });

    afterEach(function() {
      clock.restore();

      geckoProfiler = null;
      delete window.geckoProfilerPromise;
    });

    it('can retrieve a profile from the addon', async function() {
      const store = blankStore();
      await store.dispatch(retrieveProfileFromAddon());

      const state = store.getState();
      expect(getView(state)).toEqual({ phase: 'PROFILE' });
      expect(ProfileViewSelectors.getDisplayRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
      expect(UrlStateSelectors.getThreadOrder(state)).toEqual([0, 2, 1]); // 1 is last because it's the Compositor thread
      expect(ProfileViewSelectors.getProfile(state).threads).toHaveLength(3); // not empty
    });

    it('displays a warning after 30 seconds', async function() {
      const store = blankStore();

      const states = await observeStoreStateChanges(store, () => {
        const dispatchResultPromise = store.dispatch(
          retrieveProfileFromAddon()
        );
        clock.tick(30000); // this will triggers the timeout synchronously, before the profiler promise's then is run.
        return dispatchResultPromise;
      });
      const views = states.map(state => getView(state));

      const errorMessage =
        'We were unable to connect to the Gecko profiler add-on within thirty seconds. This might be because the profile is big or your machine is slower than usual. Still waiting...';

      expect(views.slice(0, 3)).toEqual([
        {
          phase: 'INITIALIZING',
          additionalData: { attempt: null, message: errorMessage },
        }, // when the error happens
        { phase: 'INITIALIZING' }, // when we could connect to the addon but waiting for the profile
        { phase: 'PROFILE' }, // yay, we got a profile!
      ]);

      const state = store.getState();
      expect(getView(state)).toEqual({ phase: 'PROFILE' });
      expect(ProfileViewSelectors.getDisplayRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
      expect(UrlStateSelectors.getThreadOrder(state)).toEqual([0, 2, 1]); // 1 is last because it's the Compositor thread
      expect(ProfileViewSelectors.getProfile(state).threads).toHaveLength(3); // not empty
    });
  });

  describe('retrieveProfileFromStore', function() {
    const fetch403Response = { ok: false, status: 403 };
    const fetch500Response = { ok: false, status: 500 };
    const fetch200Response = {
      ok: true,
      status: 200,
      json: () => Promise.resolve(exampleProfile()),
    };

    beforeEach(function() {
      // The stub makes it easy to return different values for different
      // arguments. Here we define the default return value because there is no
      // argument specified.
      window.fetch = sinon.stub();
      window.fetch.resolves(fetch403Response);

      sinon.stub(window, 'setTimeout').yieldsAsync(); // will call its argument asynchronously
    });

    afterEach(function() {
      delete window.fetch;
      window.setTimeout.restore();
    });

    it('can retrieve a profile from the web and save it to state', async function() {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const expectedUrl = `https://profile-store.commondatastorage.googleapis.com/${hash}`;
      window.fetch.withArgs(expectedUrl).resolves(fetch200Response);

      const store = blankStore();
      await store.dispatch(retrieveProfileFromStore(hash));

      const state = store.getState();
      expect(getView(state)).toEqual({ phase: 'PROFILE' });
      expect(ProfileViewSelectors.getDisplayRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
      expect(UrlStateSelectors.getThreadOrder(state)).toEqual([0, 2, 1]); // 1 is last because it's the Compositor thread
      expect(ProfileViewSelectors.getProfile(state).threads.length).toBe(3); // not empty
    });

    it('requests several times in case of 403', async function() {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const expectedUrl = `https://profile-store.commondatastorage.googleapis.com/${hash}`;
      // The first call will still be a 403 -- remember, it's the default return value.
      window.fetch
        .withArgs(expectedUrl)
        .onSecondCall()
        .resolves(fetch200Response);

      const store = blankStore();
      const views = (await observeStoreStateChanges(store, () =>
        store.dispatch(retrieveProfileFromStore(hash))
      )).map(state => getView(state));

      const errorMessage = 'Profile not found on remote server.';
      expect(views).toEqual([
        { phase: 'INITIALIZING' },
        {
          phase: 'INITIALIZING',
          additionalData: {
            attempt: { count: 1, total: 11 },
            message: errorMessage,
          },
        },
        { phase: 'PROFILE' },
      ]);

      const state = store.getState();
      expect(ProfileViewSelectors.getDisplayRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
      expect(UrlStateSelectors.getThreadOrder(state)).toEqual([0, 2, 1]); // 1 is last because it's the Compositor thread
      expect(ProfileViewSelectors.getProfile(state).threads.length).toBe(3); // not empty
    });

    it('fails in case the profile cannot be found after several tries', async function() {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const store = blankStore();
      const views = (await observeStoreStateChanges(store, () =>
        store.dispatch(retrieveProfileFromStore(hash))
      )).map(state => getView(state));

      const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const errorMessage = 'Profile not found on remote server.';
      expect(views).toEqual([
        { phase: 'INITIALIZING' },
        ...steps.map(step => ({
          phase: 'INITIALIZING',
          additionalData: {
            attempt: { count: step, total: 11 },
            message: errorMessage,
          },
        })),
        { phase: 'FATAL_ERROR', error: expect.any(Error) },
      ]);
    });

    it('fails in case the fetch returns a server error', async function() {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      window.fetch.resolves(fetch500Response);

      const store = blankStore();
      await store.dispatch(retrieveProfileFromStore(hash));
      expect(getView(store.getState())).toEqual({
        phase: 'FATAL_ERROR',
        error: expect.any(Error),
      });
    });
  });

  describe('retrieveProfileFromUrl', function() {
    const fetch403Response = { ok: false, status: 403 };
    const fetch500Response = { ok: false, status: 500 };
    const fetch200Response = {
      ok: true,
      status: 200,
      json: () => Promise.resolve(exampleProfile()),
    };

    beforeEach(function() {
      // The stub makes it easy to return different values for different
      // arguments. Here we define the default return value because there is no
      // argument specified.
      window.fetch = sinon.stub();
      window.fetch.resolves(fetch403Response);

      sinon.stub(window, 'setTimeout').yieldsAsync(); // will call its argument asynchronously
    });

    afterEach(function() {
      delete window.fetch;
      window.setTimeout.restore();
    });

    it('can retrieve a profile from the web and save it to state', async function() {
      const expectedUrl = 'https://profiles.club/shared.json';
      window.fetch.withArgs(expectedUrl).resolves(fetch200Response);

      const store = blankStore();
      await store.dispatch(retrieveProfileFromUrl(expectedUrl));

      const state = store.getState();
      expect(getView(state)).toEqual({ phase: 'PROFILE' });
      expect(ProfileViewSelectors.getDisplayRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
      expect(UrlStateSelectors.getThreadOrder(state)).toEqual([0, 2, 1]); // 1 is last because it's the Compositor thread
      expect(ProfileViewSelectors.getProfile(state).threads.length).toBe(3); // not empty
    });

    it('requests several times in case of 403', async function() {
      const expectedUrl = 'https://profiles.club/shared.json';
      // The first call will still be a 403 -- remember, it's the default return value.
      window.fetch
        .withArgs(expectedUrl)
        .onSecondCall()
        .resolves(fetch200Response);

      const store = blankStore();
      const views = (await observeStoreStateChanges(store, () =>
        store.dispatch(retrieveProfileFromUrl(expectedUrl))
      )).map(state => getView(state));

      const errorMessage = 'Profile not found on remote server.';
      expect(views).toEqual([
        { phase: 'INITIALIZING' },
        {
          phase: 'INITIALIZING',
          additionalData: {
            attempt: { count: 1, total: 11 },
            message: errorMessage,
          },
        },
        { phase: 'PROFILE' },
      ]);

      const state = store.getState();
      expect(ProfileViewSelectors.getDisplayRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
      expect(UrlStateSelectors.getThreadOrder(state)).toEqual([0, 2, 1]); // 1 is last because it's the Compositor thread
      expect(ProfileViewSelectors.getProfile(state).threads.length).toBe(3); // not empty
    });

    it('fails in case the profile cannot be found after several tries', async function() {
      const expectedUrl = 'https://profiles.club/shared.json';
      const store = blankStore();
      const views = (await observeStoreStateChanges(store, () =>
        store.dispatch(retrieveProfileFromUrl(expectedUrl))
      )).map(state => getView(state));

      const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const errorMessage = 'Profile not found on remote server.';
      expect(views).toEqual([
        { phase: 'INITIALIZING' },
        ...steps.map(step => ({
          phase: 'INITIALIZING',
          additionalData: {
            attempt: { count: step, total: 11 },
            message: errorMessage,
          },
        })),
        { phase: 'FATAL_ERROR', error: expect.any(Error) },
      ]);
    });

    it('fails in case the fetch returns a server error', async function() {
      const expectedUrl = 'https://profiles.club/shared.json';
      window.fetch.resolves(fetch500Response);

      const store = blankStore();
      await store.dispatch(retrieveProfileFromUrl(expectedUrl));
      expect(getView(store.getState())).toEqual({
        phase: 'FATAL_ERROR',
        error: expect.any(Error),
      });
    });
  });
});
