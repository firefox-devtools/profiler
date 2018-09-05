/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import sinon from 'sinon';

import { blankStore } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../reducers/profile-view';
import * as ZippedProfilesSelectors from '../../reducers/zipped-profiles';
import { getView } from '../../reducers/app';
import {
  viewProfile,
  retrieveProfileFromAddon,
  retrieveProfileFromStore,
  retrieveProfileOrZipFromUrl,
  retrieveProfileFromFile,
  _fetchProfile,
} from '../../actions/receive-profile';

import getGeckoProfile from '../fixtures/profiles/gecko-profile';
import { getEmptyProfile } from '../../profile-logic/profile-data';
import JSZip from 'jszip';
import { serializeProfile } from '../../profile-logic/process-profile';
import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';
import { getHumanReadableTracks } from '../fixtures/profiles/tracks';

// Mocking SymbolStoreDB
import exampleSymbolTable from '../fixtures/example-symbol-table';
import SymbolStoreDB from '../../profile-logic/symbol-store-db';
jest.mock('../../profile-logic/symbol-store-db');

import { TextDecoder } from 'util';

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
      const emptyProfile = getEmptyProfile();
      store.dispatch(viewProfile(emptyProfile));
      expect(ProfileViewSelectors.getProfile(store.getState())).toBe(
        emptyProfile
      );
    });

    function getProfileWithIdleAndWorkThread() {
      const { profile } = getProfileFromTextSamples(
        'idle idle idle idle idle idle idle',
        'work work work work work work work'
      );

      const [idleThread, workThread] = profile.threads;
      const idleCategoryIndex = profile.meta.categories.length;
      profile.meta.categories.push({ name: 'Idle', color: '#fff' });
      workThread.name = 'Work Thread';
      idleThread.name = 'Idle Thread';
      idleThread.stackTable.category = idleThread.stackTable.category.map(
        () => idleCategoryIndex
      );
      return { profile, idleThread, workThread };
    }

    it('will hide threads with idle samples', function() {
      const store = blankStore();
      const { profile } = getProfileWithIdleAndWorkThread();

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [process]',
        '  - hide [thread Idle Thread]',
        '  - show [thread Work Thread] SELECTED',
      ]);
    });

    it('will not hide the Windows GPU thread', function() {
      const store = blankStore();
      const {
        profile,
        idleThread,
        workThread,
      } = getProfileWithIdleAndWorkThread();
      idleThread.name = 'GeckoMain';
      idleThread.processType = 'default';
      idleThread.pid = 0;
      workThread.name = 'GeckoMain';
      workThread.processType = 'default';
      idleThread.pid = 1;

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain default]',
      ]);
    });

    it('will not hide the Compositor thread', function() {
      const store = blankStore();
      const {
        profile,
        idleThread,
        workThread,
      } = getProfileWithIdleAndWorkThread();
      idleThread.name = 'Compositor';
      idleThread.processType = 'default';
      workThread.name = 'GeckoMain';
      workThread.processType = 'default';

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        '  - show [thread Compositor]',
      ]);
    });

    it('will not hide a main thread', function() {
      const store = blankStore();
      const {
        profile,
        idleThread,
        workThread,
      } = getProfileWithIdleAndWorkThread();
      idleThread.name = 'GeckoMain';
      idleThread.processType = 'default';
      idleThread.pid = 0;
      workThread.name = 'GeckoMain';
      workThread.processType = 'default';
      workThread.pid = 1;

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        'show [thread GeckoMain default]',
      ]);
    });
  });

  describe('retrieveProfileFromAddon', function() {
    let geckoProfiler;
    let clock;

    beforeEach(function() {
      clock = sinon.useFakeTimers();

      geckoProfiler = {
        getProfile: () => Promise.resolve(getGeckoProfile()),
        getSymbolTable: () =>
          Promise.reject(new Error('No symbol tables available')),
      };
      window.fetch = sinon.stub();
      fetch.rejects(new Error('No symbolication API in place'));
      window.geckoProfilerPromise = Promise.resolve(geckoProfiler);

      // This is a mock implementation because of the `mock` call above, but
      // Flow doesn't know this.
      (SymbolStoreDB: any).mockImplementation(() => ({
        getSymbolTable: jest.fn().mockResolvedValue(exampleSymbolTable),
      }));

      window.TextDecoder = TextDecoder;
    });

    afterEach(function() {
      clock.restore();

      geckoProfiler = null;
      delete window.geckoProfilerPromise;
      delete window.TextDecoder;
      delete window.requestIdleCallback;
      delete window.fetch;
    });

    it('can retrieve a profile from the addon', async function() {
      const store = blankStore();
      await store.dispatch(retrieveProfileFromAddon());

      const state = store.getState();
      expect(getView(state)).toEqual({ phase: 'DATA_LOADED' });
      expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
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
      expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
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
      expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
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
      expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
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
      expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
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
      expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
        start: 0,
        end: 1007,
      });
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

  describe('retrieveProfileFromFile', function() {
    /**
     * Bypass all of Flow's checks, and mock out the file interface.
     */
    function mockFile({ type, payload }): File {
      const file = {
        type,
        _payload: payload,
      };
      return (file: any);
    }

    /**
     * Bypass all of Flow's checks, and mock out the file reader.
     */
    function mockFileReader(mockFile: File) {
      const payload = (mockFile: any)._payload;
      return {
        asText: () => Promise.resolve((payload: string)),
        asArrayBuffer: () => Promise.resolve((payload: ArrayBuffer)),
      };
    }

    async function setupTestWithFile(mockFileOptions) {
      const file = mockFile(mockFileOptions);
      const { dispatch, getState } = blankStore();
      await dispatch(retrieveProfileFromFile(file, mockFileReader));
      const view = getView(getState());
      return { getState, dispatch, view };
    }

    it('can load json with a good mime type', async function() {
      const profile = getEmptyProfile();
      profile.meta.product = 'JSON Test';

      const { getState, view } = await setupTestWithFile({
        type: 'application/json',
        payload: serializeProfile(profile),
      });
      expect(view.phase).toBe('DATA_LOADED');
      expect(ProfileViewSelectors.getProfile(getState()).meta.product).toEqual(
        'JSON Test'
      );
    });

    it('can load json with an empty mime type', async function() {
      const profile = getEmptyProfile();
      profile.meta.product = 'JSON Test';

      const { getState, view } = await setupTestWithFile({
        type: '',
        payload: serializeProfile(profile),
      });
      expect(view.phase).toBe('DATA_LOADED');
      expect(ProfileViewSelectors.getProfile(getState()).meta.product).toEqual(
        'JSON Test'
      );
    });

    it('will give an error when unable to parse json', async function() {
      const { view } = await setupTestWithFile({
        type: 'application/json',
        payload: '{}',
      });
      expect(view.phase).toBe('FATAL_ERROR');

      expect(
        // Coerce into the object to access the error property.
        (view: Object).error
      ).toMatchSnapshot();
    });

    xit('can load gzipped json', async function() {
      // TODO - See issue #1023. The zee-worker is failing to compress/decompress
      // the profile.
    });

    xit('will give an error when unable to parse gzipped profiles', async function() {
      // TODO - See issue #1023. The zee-worker is failing to compress/decompress
      // the profile.
    });

    it('can load a zipped profile', async function() {
      const zip = new JSZip();
      zip.file('profile.json', serializeProfile(getEmptyProfile()));
      const array = await zip.generateAsync({ type: 'uint8array' });

      // Create a new ArrayBuffer instance and copy the data into it, in order
      // to work around https://github.com/facebook/jest/issues/6248
      const bufferCopy = new ArrayBuffer(array.buffer.byteLength);
      new Uint8Array(bufferCopy).set(new Uint8Array(array.buffer));

      const { getState, view } = await setupTestWithFile({
        type: 'application/zip',
        payload: bufferCopy,
      });
      expect(view.phase).toBe('DATA_LOADED');
      const zipInStore = ZippedProfilesSelectors.getZipFile(getState());
      if (zipInStore === null) {
        throw new Error('Expected zipInStore to exist.');
      }
      expect(zipInStore.files['profile.json']).toBeTruthy();
    });

    it('will give an error when unable to decompress a zipped profile', async function() {
      const { view } = await setupTestWithFile({
        type: 'application/zip',
        payload: new ArrayBuffer(10),
      });
      expect(view.phase).toBe('FATAL_ERROR');
      expect(
        // Coerce into the object to access the error property.
        (view: Object).error
      ).toMatchSnapshot();
    });
  });
});
