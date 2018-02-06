/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import sinon from 'sinon';
import { blankStore } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import * as UrlStateSelectors from '../../reducers/url-state';
import { getView } from '../../reducers/app';
import {
  viewProfile,
  retrieveProfileFromAddon,
  retrieveProfileFromStore,
  retrieveProfileOrZipFromUrl,
  _fetchProfile,
} from '../../actions/receive-profile';

import preprocessedProfile from '../fixtures/profiles/profile-2d-canvas.json';
import getGeckoProfile from '../fixtures/profiles/gecko-profile';
import { getEmptyProfile } from '../../profile-logic/profile-data';
import JSZip from 'jszip';
import { serializeProfile } from '../../profile-logic/process-profile';

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

  describe('viewProfile', function() {
    it('can take a profile and view it', function() {
      const store = blankStore();

      expect(() => {
        ProfileViewSelectors.getProfile(store.getState());
      }).toThrow();

      const initialProfile = ProfileViewSelectors.getProfileOrNull(
        store.getState()
      );
      expect(initialProfile).toBeNull();
      store.dispatch(viewProfile(preprocessedProfile));
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
        getProfile: () => Promise.resolve(getGeckoProfile()),
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
      expect(getView(state)).toEqual({ phase: 'DATA_LOADED' });
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
        { phase: 'DATA_LOADED' }, // yay, we got a profile!
      ]);

      const state = store.getState();
      expect(getView(state)).toEqual({ phase: 'DATA_LOADED' });
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
      headers: {
        get: () => 'appliciation/json',
      },
      json: () => Promise.resolve(getGeckoProfile()),
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
      expect(getView(state)).toEqual({ phase: 'DATA_LOADED' });
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
        { phase: 'DATA_LOADED' },
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

  describe('retrieveProfileOrZipFromUrl', function() {
    const fetch403Response = { ok: false, status: 403 };
    const fetch500Response = { ok: false, status: 500 };
    const fetch200Response = {
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      json: () => Promise.resolve(getGeckoProfile()),
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
      await store.dispatch(retrieveProfileOrZipFromUrl(expectedUrl));

      const state = store.getState();
      expect(getView(state)).toEqual({ phase: 'DATA_LOADED' });
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
        store.dispatch(retrieveProfileOrZipFromUrl(expectedUrl))
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
        { phase: 'DATA_LOADED' },
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
        store.dispatch(retrieveProfileOrZipFromUrl(expectedUrl))
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
      await store.dispatch(retrieveProfileOrZipFromUrl(expectedUrl));
      expect(getView(store.getState())).toEqual({
        phase: 'FATAL_ERROR',
        error: expect.any(Error),
      });
    });
  });

  /**
   * _fetchProfile is a helper function for the actions, but it is tested separately
   * since it has a decent amount of complexity around different issues with loading
   * in different support URL formats. It's mainly testing what happens when JSON
   * and zip file is sent, and what happens when things fail.
   */
  describe('_fetchProfile', function() {
    beforeEach(function() {
      window.fetch = sinon.stub();
      sinon.stub(window, 'setTimeout').yieldsAsync(); // will call its argument asynchronously
    });

    afterEach(function() {
      delete window.fetch;
      window.setTimeout.restore();
    });

    /**
     * This helper function encapsulates various configurations for the type of content
     * as well and response headers.
     */
    async function configureFetch(obj: {
      url: string,
      contentType?: string,
      isZipped?: true,
      isJSON?: true,
      arrayBuffer?: () => Promise<Uint8Array>,
      json?: () => Promise<mixed>,
    }) {
      const { url, contentType, isZipped, isJSON } = obj;
      const profile = getEmptyProfile();
      let arrayBuffer = obj.arrayBuffer;
      let json = obj.json;

      if (isZipped) {
        const zip = new JSZip();
        zip.file('profile.json', serializeProfile(profile));
        const buffer = await zip.generateAsync({ type: 'uint8array' });
        arrayBuffer = () => buffer;
        json = () => Promise.reject(new Error('Not JSON'));
      }

      if (isJSON) {
        arrayBuffer = () => Promise.reject(new Error('Unhandled mock'));
        json = () => Promise.resolve(profile);
      }

      const zippedProfileResponse = {
        ok: true,
        status: 200,
        json,
        arrayBuffer,
        headers: {
          get: (name: string) => {
            switch (name) {
              case 'content-type':
                return contentType;
              default:
                throw new Error(
                  "Unhandled stub for fetch's response.headers.get"
                );
            }
          },
        },
      };
      window.fetch.withArgs(url).resolves(zippedProfileResponse);
      const reportError = jest.fn();
      const args = {
        url,
        onTemporaryError: () => {},
        reportError,
      };

      // Return fetch's args, based on the inputs.
      return { profile, args, reportError };
    }

    it('fetches a normal profile with the correct content-type headers', async function() {
      const { profile, args } = await configureFetch({
        url: 'https://example.com/profile.json',
        contentType: 'application/json',
        isJSON: true,
      });

      const { profile: profileFetched } = await _fetchProfile(args);
      expect(profileFetched).toEqual(profile);
    });

    it('fetches a zipped profile with correct content-type headers', async function() {
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.zip',
        contentType: 'application/zip',
        isZipped: true,
      });

      const { zip } = await _fetchProfile(args);
      expect(zip).toBeTruthy();
      expect(reportError.mock.calls.length).toBe(0);
    });

    it('fetches a zipped profile with incorrect content-type headers, but .zip extension', async function() {
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.zip',
        isZipped: true,
      });

      const { zip } = await _fetchProfile(args);
      expect(zip).toBeTruthy();
      expect(reportError.mock.calls.length).toBe(0);
    });

    it('fetches a profile with incorrect content-type headers, but .json extension', async function() {
      const { profile, args, reportError } = await configureFetch({
        url: 'https://example.com/profile.json',
        isJSON: true,
      });

      const { profile: profileFetched } = await _fetchProfile(args);
      expect(profileFetched).toEqual(profile);
      expect(reportError.mock.calls.length).toBe(0);
    });

    it('fetches a profile with incorrect content-type headers, no known extension, and attempts to JSON parse it it', async function() {
      const { profile, args, reportError } = await configureFetch({
        url: 'https://example.com/profile.file',
        isJSON: true,
      });

      const { profile: profileFetched } = await _fetchProfile(args);
      expect(profileFetched).toEqual(profile);
      expect(reportError.mock.calls.length).toBe(0);
    });

    it('fails if a bad zip file is passed in', async function() {
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.file',
        contentType: 'application/zip',
        arrayBuffer: () => Promise.resolve(new Uint8Array([0, 1, 2, 3])),
      });

      let userFacingError;
      try {
        await _fetchProfile(args);
      } catch (error) {
        userFacingError = error;
      }
      expect(userFacingError).toMatchSnapshot();
      expect(reportError.mock.calls.length).toBeGreaterThan(0);
      expect(reportError.mock.calls).toMatchSnapshot();
    });

    it('fails if a bad profile JSON is passed in', async function() {
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.json',
        contentType: 'application/json',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      let userFacingError;
      try {
        await _fetchProfile(args);
      } catch (error) {
        userFacingError = error;
      }
      expect(userFacingError).toMatchSnapshot();
      expect(reportError.mock.calls.length).toBeGreaterThan(0);
      expect(reportError.mock.calls).toMatchSnapshot();
    });

    it('fails if a bad profile JSON is passed in, with no content type', async function() {
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.json',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      let userFacingError;
      try {
        await _fetchProfile(args);
      } catch (error) {
        userFacingError = error;
      }
      expect(userFacingError).toMatchSnapshot();
      expect(reportError.mock.calls.length).toBeGreaterThan(0);
      expect(reportError.mock.calls).toMatchSnapshot();
    });

    it('fails if a completely unknown file is passed in', async function() {
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.unknown',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      let userFacingError;
      try {
        await _fetchProfile(args);
      } catch (error) {
        userFacingError = error;
      }
      expect(userFacingError).toMatchSnapshot();
      expect(reportError.mock.calls.length).toBeGreaterThan(0);
      expect(reportError.mock.calls).toMatchSnapshot();
    });
  });
});
