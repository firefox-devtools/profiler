/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Profile } from '../../types/profile';

import sinon from 'sinon';

import { getEmptyProfile } from '../../profile-logic/data-structures';
import { viewProfileFromPathInZipFile } from '../../actions/zipped-profiles';
import { blankStore } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../selectors/profile';
import * as ZippedProfilesSelectors from '../../selectors/zipped-profiles';
import * as UrlStateSelectors from '../../selectors/url-state';
import { getView } from '../../selectors/app';
import {
  viewProfile,
  retrieveProfileFromAddon,
  retrieveProfileFromStore,
  retrieveProfileOrZipFromUrl,
  retrieveProfileFromFile,
  retrieveProfilesToCompare,
  _fetchProfile,
} from '../../actions/receive-profile';
import { SymbolsNotFoundError } from '../../profile-logic/errors';

import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import JSZip from 'jszip';
import { serializeProfile } from '../../profile-logic/process-profile';
import {
  getProfileFromTextSamples,
  addMarkersToThreadWithCorrespondingSamples,
} from '../fixtures/profiles/processed-profile';
import { getHumanReadableTracks } from '../fixtures/profiles/tracks';

import { compress } from '../../utils/gz';

// Mocking SymbolStoreDB. By default the functions will return undefined, which
// will make the symbolication move forward with some bogus information.
// If you need to simulate that it doesn't have the information, use the
// function simulateSymbolStoreHasNoCache defined below.
import SymbolStoreDB from '../../profile-logic/symbol-store-db';
jest.mock('../../profile-logic/symbol-store-db');

// Mocking expandUrl
// We mock this module because it's tested more properly in its unit
// tests and it isn't necessary to run through it in this test file.  Moreover
// it makes it easier to mock `fetch` calls that fetch a profile from a store.
import { expandUrl } from '../../utils/shorten-url';
jest.mock('../../utils/shorten-url');

import { TextEncoder, TextDecoder } from 'util';

function simulateSymbolStoreHasNoCache() {
  // SymbolStoreDB is a mock, but Flow doesn't know this. That's why we use
  // `any` so that we can use `mockImplementation`.
  (SymbolStoreDB: any).mockImplementation(() => ({
    getSymbolTable: jest
      .fn()
      .mockImplementation((debugName, breakpadId) =>
        Promise.reject(
          new SymbolsNotFoundError(
            'The requested library does not exist in the database.',
            { debugName, breakpadId }
          )
        )
      ),
  }));
}

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
      const profile = _getSimpleProfile();
      store.dispatch(viewProfile(profile));
      expect(ProfileViewSelectors.getProfile(store.getState())).toBe(profile);
    });

    it('will be a fatal error if a profile has no threads', function() {
      const store = blankStore();
      expect(getView(store.getState()).phase).toBe('INITIALIZING');
      const emptyProfile = getEmptyProfile();

      // Stop console.error from spitting out an error message:
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

      store.dispatch(viewProfile(emptyProfile));
      expect(getView(store.getState()).phase).toBe('FATAL_ERROR');
      expect(spy).toHaveBeenCalled();
    });

    function getProfileWithIdleAndWorkThread() {
      const { profile } = getProfileFromTextSamples(
        `A[cat:Idle]  A[cat:Idle]  A[cat:Idle]  A[cat:Idle]  A[cat:Idle]`,
        `work  work  work  work  work  work  work`
      );

      const [idleThread, workThread] = profile.threads;
      const idleCategoryIndex = profile.meta.categories.length;
      profile.meta.categories.push({
        name: 'Idle',
        color: '#fff',
        subcategories: ['Other'],
      });
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

    it('will hide idle content threads with no RefreshDriverTick markers', function() {
      const store = blankStore();
      const { profile } = getProfileFromTextSamples(
        `A[cat:Idle]  A[cat:Idle]  A[cat:Idle]  A[cat:Idle]  A[cat:Idle]`,
        `work  work  work  work  work  work  work`,
        `C[cat:Idle]  C[cat:Idle]  C[cat:Idle]  C[cat:Idle]  C[cat:Idle]`
      );

      profile.threads.forEach((thread, threadIndex) => {
        thread.name = 'GeckoMain';
        thread.processType = 'tab';
        thread.pid = threadIndex;
      });

      addMarkersToThreadWithCorrespondingSamples(
        profile.threads[1],
        [
          [
            'RefreshDriverTick',
            0,
            { type: 'tracing', category: 'Paint', interval: 'start' },
          ],
        ],
        profile.meta.interval
      );

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'hide [thread GeckoMain tab]',
        'show [thread GeckoMain tab] SELECTED',
        'hide [thread GeckoMain tab]',
      ]);
    });

    it('will not hide non-idle content threads with no RefreshDriverTick markers', function() {
      const store = blankStore();
      const { profile } = getProfileFromTextSamples(
        `work  work  work  work  work  work  work`,
        `work  work  work  work  work  work  work`,
        `C[cat:Idle]  C[cat:Idle]  C[cat:Idle]  work  work`
      );

      profile.threads.forEach((thread, threadIndex) => {
        thread.name = 'GeckoMain';
        thread.processType = 'tab';
        thread.pid = threadIndex;
      });

      addMarkersToThreadWithCorrespondingSamples(
        profile.threads[1],
        [
          [
            'RefreshDriverTick',
            0,
            { type: 'tracing', category: 'Paint', interval: 'start' },
          ],
        ],
        profile.meta.interval
      );

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [thread GeckoMain tab] SELECTED',
        'show [thread GeckoMain tab]',
        'show [thread GeckoMain tab]',
      ]);
    });
  });

  describe('retrieveProfileFromAddon', function() {
    function toUint8Array(json) {
      return new TextEncoder().encode(JSON.stringify(json));
    }

    function setup(profileAs = 'json') {
      jest.useFakeTimers();

      const profileJSON = createGeckoProfile();
      let mockGetProfile;
      switch (profileAs) {
        case 'json':
          mockGetProfile = jest.fn().mockResolvedValue(profileJSON);
          break;
        case 'arraybuffer':
          mockGetProfile = jest
            .fn()
            .mockResolvedValue(toUint8Array(profileJSON).buffer);
          break;
        case 'gzip':
          mockGetProfile = jest
            .fn()
            .mockReturnValue(
              compress(toUint8Array(profileJSON)).then(x => x.buffer)
            );
          break;
        default:
          throw new Error('unknown profiler format');
      }

      const geckoProfiler = {
        getProfile: mockGetProfile,
        getSymbolTable: jest
          .fn()
          .mockRejectedValue(new Error('No symbol tables available')),
      };
      window.fetch = jest
        .fn()
        .mockRejectedValue(new Error('No symbolication API in place'));
      window.geckoProfilerPromise = Promise.resolve(geckoProfiler);

      simulateSymbolStoreHasNoCache();

      window.TextDecoder = TextDecoder;

      // Silence the logs coming from the promise rejections above.
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const store = blankStore();

      return {
        geckoProfiler,
        store,
        ...store,
      };
    }

    afterEach(function() {
      delete window.geckoProfilerPromise;
      delete window.TextDecoder;
      delete window.fetch;
    });

    for (const profileAs of ['json', 'arraybuffer', 'gzip']) {
      const desc = 'can retrieve a profile from the addon as ' + profileAs;
      it(desc, async function() {
        const { dispatch, getState } = setup(profileAs);
        await dispatch(retrieveProfileFromAddon());

        const state = getState();
        expect(getView(state)).toEqual({ phase: 'DATA_LOADED' });
        expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
          start: 0,
          end: 1007,
        });
        // not empty
        expect(ProfileViewSelectors.getProfile(state).threads).toHaveLength(3);
      });
    }

    it('tries to symbolicate the received profile', async () => {
      const { dispatch, geckoProfiler } = setup();

      await dispatch(retrieveProfileFromAddon());

      expect(geckoProfiler.getSymbolTable).toHaveBeenCalledWith(
        'firefox',
        expect.any(String)
      );

      expect(window.fetch).toHaveBeenCalledWith(
        'https://symbols.mozilla.org/symbolicate/v5',
        expect.objectContaining({
          body: expect.stringMatching(/memoryMap.*firefox/),
        })
      );
    });

    it('displays a warning after 30 seconds', async function() {
      const { dispatch, store } = setup();

      const states = await observeStoreStateChanges(store, () => {
        const dispatchResultPromise = dispatch(retrieveProfileFromAddon());

        // this will triggers the timeout synchronously, before the profiler
        // promise's then is run.
        jest.advanceTimersByTime(30000);
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
        { phase: 'PROFILE_LOADED' }, // yay, we got a profile!
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
        get: () => 'application/json',
      },
      json: () =>
        Promise.resolve(JSON.parse(serializeProfile(_getSimpleProfile()))),
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
        end: 1,
      });
      expect(ProfileViewSelectors.getProfile(state).threads.length).toBe(1); // not empty
    });

    it('symbolicates a profile if it is not symbolicated yet', async () => {
      const { profile: unsymbolicatedProfile } = getProfileFromTextSamples(
        '0xA[lib:libxul]'
      );
      unsymbolicatedProfile.meta.symbolicated = false;

      window.fetch.resolves({
        ...fetch200Response,
        json: () =>
          Promise.resolve(JSON.parse(serializeProfile(unsymbolicatedProfile))),
      });

      simulateSymbolStoreHasNoCache();

      // Silence console logs coming from the previous rejection
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const store = blankStore();
      await store.dispatch(retrieveProfileFromStore('FAKEHASH'));

      sinon.assert.calledWithMatch(
        window.fetch,
        'https://symbols.mozilla.org/symbolicate/v5',
        { body: sinon.match(/memoryMap.*libxul/) }
      );
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
        { phase: 'PROFILE_LOADED' },
        { phase: 'DATA_LOADED' },
      ]);

      const state = store.getState();
      expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
        start: 0,
        end: 1,
      });
      expect(ProfileViewSelectors.getProfile(state).threads.length).toBe(1); // not empty
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
      json: () =>
        Promise.resolve(JSON.parse(serializeProfile(_getSimpleProfile()))),
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
        end: 1,
      });
      expect(ProfileViewSelectors.getProfile(state).threads.length).toBe(1); // not empty
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
        { phase: 'PROFILE_LOADED' },
        { phase: 'DATA_LOADED' },
      ]);

      const state = store.getState();
      expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
        start: 0,
        end: 1,
      });
      expect(ProfileViewSelectors.getProfile(state).threads.length).toBe(1); // not empty
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
      const stringProfile = serializeProfile(_getSimpleProfile());
      const profile = JSON.parse(stringProfile);
      let arrayBuffer = obj.arrayBuffer;
      let json = obj.json;

      if (isZipped) {
        const zip = new JSZip();
        zip.file('profile.json', stringProfile);
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
      const profile = _getSimpleProfile();
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

    it('symbolicates unsymbolicated profiles', async function() {
      simulateSymbolStoreHasNoCache();

      window.fetch = jest
        .fn()
        .mockRejectedValue(new Error('No symbolication API in place'));

      // Silence console logs coming from the previous rejections
      jest.spyOn(console, 'log').mockImplementation(() => {});

      const profile = createGeckoProfile();

      await setupTestWithFile({
        type: 'application/json',
        payload: profile,
      });

      expect(window.fetch).toHaveBeenCalledWith(
        'https://symbols.mozilla.org/symbolicate/v5',
        expect.objectContaining({
          body: expect.stringMatching(/memoryMap.*firefox/),
        })
      );

      delete window.fetch;
    });

    it('can load json with an empty mime type', async function() {
      const profile = _getSimpleProfile();
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

    async function setupZipTestWithProfile(
      fileName: string,
      serializedProfile: string
    ) {
      const zip = new JSZip();
      zip.file(fileName, serializedProfile);
      const array = await zip.generateAsync({ type: 'uint8array' });

      // Create a new ArrayBuffer instance and copy the data into it, in order
      // to work around https://github.com/facebook/jest/issues/6248
      const bufferCopy = new ArrayBuffer(array.buffer.byteLength);
      new Uint8Array(bufferCopy).set(new Uint8Array(array.buffer));

      return setupTestWithFile({
        type: 'application/zip',
        payload: bufferCopy,
      });
    }

    it('can load a zipped profile', async function() {
      const { getState, view } = await setupZipTestWithProfile(
        'profile.json',
        serializeProfile(_getSimpleProfile())
      );
      expect(view.phase).toBe('DATA_LOADED');
      const zipInStore = ZippedProfilesSelectors.getZipFile(getState());
      if (zipInStore === null) {
        throw new Error('Expected zipInStore to exist.');
      }
      expect(zipInStore.files['profile.json']).toBeTruthy();
    });

    it('will load and view a simple profile with no errors', async function() {
      const { getState, dispatch } = await setupZipTestWithProfile(
        'profile.json',
        serializeProfile(_getSimpleProfile())
      );

      expect(ZippedProfilesSelectors.getZipFileState(getState()).phase).toEqual(
        'LIST_FILES_IN_ZIP_FILE'
      );
      await dispatch(viewProfileFromPathInZipFile('profile.json'));
      expect(ZippedProfilesSelectors.getZipFileState(getState()).phase).toEqual(
        'VIEW_PROFILE_IN_ZIP_FILE'
      );
      const errorMessage = ZippedProfilesSelectors.getZipFileErrorMessage(
        getState()
      );
      expect(errorMessage).toEqual(null);
    });

    it('will be an error to view a profile with no threads', async function() {
      const { getState, dispatch } = await setupZipTestWithProfile(
        'profile.json',
        serializeProfile(getEmptyProfile())
      );

      expect(ZippedProfilesSelectors.getZipFileState(getState()).phase).toEqual(
        'LIST_FILES_IN_ZIP_FILE'
      );
      expect(
        ZippedProfilesSelectors.getZipFileErrorMessage(getState())
      ).toEqual(null);

      // Stop console.error from spitting out an error message:
      jest.spyOn(console, 'error').mockImplementation(() => {});

      await dispatch(viewProfileFromPathInZipFile('profile.json'));

      expect(ZippedProfilesSelectors.getZipFileState(getState()).phase).toEqual(
        'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE'
      );
      expect(ZippedProfilesSelectors.getZipFileState(getState()).phase).toEqual(
        'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE'
      );
      const errorMessage = ZippedProfilesSelectors.getZipFileErrorMessage(
        getState()
      );
      expect(typeof errorMessage).toEqual('string');
      expect(errorMessage).toMatchSnapshot();
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

  describe('retrieveProfilesToCompare', function() {
    function fetch200Response(profile: string) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        json: () => Promise.resolve(JSON.parse(profile)),
      };
    }

    function setupWithLongUrl(urlSearch1: string, urlSearch2: string): * {
      const fakeUrl1 = `https://fakeurl.com/public/fakehash1/?${urlSearch1}&v=3`;
      const fakeUrl2 = `https://fakeurl.com/public/fakehash2/?${urlSearch2}&v=3`;

      return setup(fakeUrl1, fakeUrl2);
    }

    async function setupWithShortUrl(
      urlSearch1: string,
      urlSearch2: string
    ): * {
      const longUrl1 = `https://fakeurl.com/public/fakehash1/?${urlSearch1}&v=3`;
      const longUrl2 = `https://fakeurl.com/public/fakehash2/?${urlSearch2}&v=3`;
      const shortUrl1 = 'https://perfht.ml/FAKEBITLYHASH1';
      const shortUrl2 = 'https://bit.ly/FAKEBITLYHASH2';

      (expandUrl: any).mockImplementation(shortUrl => {
        switch (shortUrl) {
          case shortUrl1:
            return longUrl1;
          case shortUrl2:
            return longUrl2;
          default:
            throw new Error(`The short url ${shortUrl} was not found.`);
        }
      });

      const setupResult = await setup(shortUrl1, shortUrl2);
      return {
        ...setupResult,
        shortUrl1,
        shortUrl2,
      };
    }

    async function setup(fakeUrl1: string, fakeUrl2: string): * {
      const { profile: profile1 } = getProfileFromTextSamples(
        `A  B  C  D  E`,
        `G  H  I  J  K`
      );
      const { profile: profile2 } = getProfileFromTextSamples(
        `L  M  N  O  P  Ex  Ex  Ex  Ex`,
        `Q  R  S  T  U  Ex  Ex  Ex  Ex`
      );

      profile1.threads.forEach(thread =>
        addMarkersToThreadWithCorrespondingSamples(
          thread,
          [
            ['A', 1, { startTime: 1, endTime: 3 }],
            ['A', 1, null],
            ['B', 2, null],
            ['C', 3, null],
            ['D', 4, null],
            ['E', 5, null],
          ],
          profile1.meta.interval
        )
      );
      profile2.threads.forEach(thread =>
        addMarkersToThreadWithCorrespondingSamples(
          thread,
          [
            ['F', 1, { startTime: 1, endTime: 3 }],
            ['G', 2, null],
            ['H', 3, null],
            ['I', 4, null],
            ['J', 5, null],
          ],
          profile2.meta.interval
        )
      );

      window.fetch
        .mockResolvedValueOnce(fetch200Response(serializeProfile(profile1)))
        .mockResolvedValueOnce(fetch200Response(serializeProfile(profile2)));

      const { dispatch, getState } = blankStore();
      await dispatch(retrieveProfilesToCompare([fakeUrl1, fakeUrl2]));

      // To find stupid mistakes more easily, check that we didn't get a fatal
      // error here. If we got one, let's rethrow the error.
      const view = getView(getState());
      if (view.phase === 'FATAL_ERROR') {
        throw view.error;
      }

      const resultProfile = ProfileViewSelectors.getProfile(getState());
      const globalTracks = ProfileViewSelectors.getGlobalTracks(getState());
      const rootRange = ProfileViewSelectors.getProfileRootRange(getState());
      return {
        profile1,
        profile2,
        dispatch,
        getState,
        resultProfile,
        globalTracks,
        rootRange,
      };
    }

    beforeEach(function() {
      // The stub makes it easy to return different values for different
      // arguments. Here we define the default return value because there is no
      // argument specified.
      window.fetch = jest.fn();
      window.fetch.mockImplementation(() =>
        Promise.reject(new Error('No more answers have been configured.'))
      );
    });

    afterEach(function() {
      delete window.fetch;
    });

    it('retrieves profiles and put them in the same view', async function() {
      const {
        profile1,
        profile2,
        resultProfile,
        globalTracks,
        rootRange,
      } = await setupWithLongUrl('thread=0', 'thread=1');

      const expectedThreads = [profile1.threads[0], profile2.threads[1]].map(
        (thread, i) => ({
          ...thread,
          pid: `${thread.pid} from profile ${i + 1}`,
          processName: `Profile ${i + 1}: ${thread.name}`,
          unregisterTime: thread.samples.length,
        })
      );
      expect(resultProfile.threads).toEqual(expectedThreads);
      expect(globalTracks).toHaveLength(2);
      expect(rootRange).toEqual({ start: 0, end: 9 });
    });

    it('expands the URL if needed', async function() {
      const {
        shortUrl1,
        shortUrl2,
        globalTracks,
        rootRange,
      } = await setupWithShortUrl('thread=0', 'thread=1');

      // Reuse some expectations from the previous test
      expect(globalTracks).toHaveLength(2);
      expect(rootRange).toEqual({ start: 0, end: 9 });

      // Check that expandUrl has been called
      expect(expandUrl).toHaveBeenCalledWith(shortUrl1);
      expect(expandUrl).toHaveBeenCalledWith(shortUrl2);
    });

    it('filters samples and markers, according to the URL', async function() {
      const { resultProfile } = await setupWithLongUrl(
        'thread=0&range=0.0011_0.0043',
        'thread=1'
      );
      expect(resultProfile.threads[0].samples).toHaveLength(3);
      expect(resultProfile.threads[0].markers).toHaveLength(4);
    });

    it('reuses the implementation information if both profiles used it', async function() {
      const { getState } = await setupWithLongUrl(
        'thread=0&implementation=js',
        'thread=1&implementation=js'
      );

      expect(UrlStateSelectors.getImplementationFilter(getState())).toBe('js');
    });

    it('does not reuse the implementation information if one profile used it', async function() {
      const { getState } = await setupWithLongUrl(
        'thread=0&implementation=js',
        'thread=1'
      );

      expect(UrlStateSelectors.getImplementationFilter(getState())).not.toBe(
        'js'
      );
    });

    it('reuses transforms', async function() {
      const { getState } = await setupWithLongUrl(
        'thread=0&transforms=ff-42',
        'thread=1'
      );

      expect(UrlStateSelectors.getTransformStack(getState(), 0)).toEqual([
        {
          type: 'focus-function',
          funcIndex: 42,
        },
      ]);
    });
  });
});

/**
 * This profile will have a single sample, and a single thread.
 */
function _getSimpleProfile(): Profile {
  return getProfileFromTextSamples('A').profile;
}
