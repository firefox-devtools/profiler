/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Profile } from 'firefox-profiler/types';

import { oneLineTrim } from 'common-tags';

import { ensureExists } from 'firefox-profiler/utils/flow';
import {
  getEmptyProfile,
  getEmptyThread,
} from '../../profile-logic/data-structures';
import { getTimeRangeForThread } from '../../profile-logic/profile-data';
import { viewProfileFromPathInZipFile } from '../../actions/zipped-profiles';
import { blankStore } from '../fixtures/stores';
import * as ProfileViewSelectors from '../../selectors/profile';
import * as ZippedProfilesSelectors from '../../selectors/zipped-profiles';
import * as UrlStateSelectors from '../../selectors/url-state';
import { getThreadSelectors } from '../../selectors/per-thread';
import { getView } from '../../selectors/app';
import { urlFromState } from '../../app-logic/url-handling';
import {
  viewProfile,
  finalizeProfileView,
  retrieveProfileFromBrowser,
  retrieveProfileFromStore,
  retrieveProfileOrZipFromUrl,
  retrieveProfileFromFile,
  retrieveProfilesToCompare,
  _fetchProfile,
  getProfilesFromRawUrl,
  changeTimelineTrackOrganization,
} from '../../actions/receive-profile';
import { SymbolsNotFoundError } from '../../profile-logic/errors';
import fakeIndexedDB from 'fake-indexeddb';

import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import JSZip from 'jszip';
import {
  serializeProfile,
  processGeckoProfile,
} from '../../profile-logic/process-profile';
import {
  getProfileFromTextSamples,
  addMarkersToThreadWithCorrespondingSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';
import {
  getHumanReadableTracks,
  getProfileWithNiceTracks,
} from '../fixtures/profiles/tracks';
import { waitUntilState } from '../fixtures/utils';

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
import { mockWebChannel } from '../fixtures/mocks/web-channel';

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

function simulateOldWebChannelAndFrameScript(geckoProfiler) {
  const webChannel = mockWebChannel();

  const { registerMessageToChromeListener, triggerResponse } = webChannel;
  // Pretend that this browser does not support obtaining the profile via
  // the WebChannel. This will trigger fallback to the frame script /
  // geckoProfiler API.
  registerMessageToChromeListener((message) => {
    switch (message.type) {
      case 'STATUS_QUERY': {
        triggerResponse(
          ({
            type: 'STATUS_RESPONSE',
            requestId: message.requestId,
            menuButtonIsEnabled: true,
          }: any)
        );
        break;
      }
      default: {
        triggerResponse(
          ({
            error: `Unexpected message ${message.type}`,
          }: any)
        );
        break;
      }
    }
  });

  // Simulate the frame script's geckoProfiler API.
  window.geckoProfilerPromise = Promise.resolve(geckoProfiler);

  return webChannel;
}

function simulateWebChannel(profileGetter) {
  const webChannel = mockWebChannel();

  const { registerMessageToChromeListener, triggerResponse } = webChannel;
  async function simulateBrowserSide(message) {
    switch (message.type) {
      case 'STATUS_QUERY': {
        triggerResponse({
          type: 'SUCCESS_RESPONSE',
          requestId: message.requestId,
          response: {
            menuButtonIsEnabled: true,
            version: 1,
          },
        });
        break;
      }
      case 'ENABLE_MENU_BUTTON': {
        triggerResponse({
          type: 'ERROR_RESPONSE',
          requestId: message.requestId,
          error:
            'ENABLE_MENU_BUTTON is a valid message but not covered by this test.',
        });
        break;
      }
      case 'GET_PROFILE': {
        const profile: ArrayBuffer | MixedObject = await profileGetter();
        triggerResponse({
          type: 'SUCCESS_RESPONSE',
          requestId: message.requestId,
          response: profile,
        });
        break;
      }
      case 'GET_SYMBOL_TABLE':
      case 'QUERY_SYMBOLICATION_API': {
        triggerResponse({
          type: 'ERROR_RESPONSE',
          requestId: message.requestId,
          error: 'No symbol tables available',
        });
        break;
      }
      default: {
        triggerResponse({
          type: 'ERROR_RESPONSE',
          requestId: message.requestId,
          error: `Unexpected message ${message.type}`,
        });
        break;
      }
    }
  }

  registerMessageToChromeListener((message) => {
    simulateBrowserSide(message);
  });

  return webChannel;
}

describe('actions/receive-profile', function () {
  beforeEach(() => {
    // The SymbolStore requires the use of IndexedDB, ensure that it exists so that
    // symbolication can happen.
    window.indexedDB = fakeIndexedDB;
  });

  afterEach(() => {
    delete window.indexedDB;
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

  function encode(string) {
    return new TextEncoder().encode(string);
  }

  describe('viewProfile', function () {
    it('can take a profile and view it', function () {
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

    it('will be a fatal error if a profile has no threads', function () {
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
      const idleCategoryIndex = ensureExists(
        profile.meta.categories,
        'Expected to find categories'
      ).length;
      ensureExists(
        profile.meta.categories,
        'Expected to find categories.'
      ).push({
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

    it('will hide threads with idle samples', function () {
      const store = blankStore();
      const { profile } = getProfileWithIdleAndWorkThread();

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [process]',
        '  - hide [thread Idle Thread]',
        '  - show [thread Work Thread] SELECTED',
      ]);
    });

    it('will show the thread with no samples and with paint markers', function () {
      const store = blankStore();
      const profile = getEmptyProfile();

      profile.threads.push(
        // This thread shouldn't be hidden because it's the main thread in the main process.
        getEmptyThread({ name: 'GeckoMain', processType: 'default', pid: 1 }),
        // This thread shouldn't be hidden because it will have useful markers even if it has no samples.
        getEmptyThread({ name: 'GeckoMain', processType: 'tab', pid: 2 }),
        // This thread will be hidden because it has no samples and no markers.
        getEmptyThread({ name: 'GeckoMain', processType: 'tab', pid: 3 })
      );

      addMarkersToThreadWithCorrespondingSamples(profile.threads[1], [
        ['RefreshDriverTick', 0, null, { type: 'tracing', category: 'Paint' }],
      ]);

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        'hide [thread GeckoMain tab]',
      ]);
    });

    it('will not hide the Windows GPU thread', function () {
      const store = blankStore();
      const { profile, idleThread, workThread } =
        getProfileWithIdleAndWorkThread();
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

    it('will not hide the Compositor thread', function () {
      const store = blankStore();
      const { profile, idleThread, workThread } =
        getProfileWithIdleAndWorkThread();
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

    it('will not hide a main thread', function () {
      const store = blankStore();
      const { profile, idleThread, workThread } =
        getProfileWithIdleAndWorkThread();
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

    it('will not hide the only global track', function () {
      const store = blankStore();
      const { profile } = getProfileFromTextSamples(
        `A[cat:Idle]  A[cat:Idle]  A[cat:Idle]  A[cat:Idle]  A[cat:Idle]`,
        `work  work  work  work  work`
      );
      const [threadA, threadB] = profile.threads;
      threadA.name = 'GeckoMain';
      threadA.processType = 'tab';
      threadA.pid = 111;
      threadB.name = 'Other';
      threadB.processType = 'default';
      threadB.pid = 111;

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread Other]',
      ]);
    });

    it('will hide idle content threads with no RefreshDriverTick markers', function () {
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

      addMarkersToThreadWithCorrespondingSamples(profile.threads[1], [
        ['RefreshDriverTick', 0, null, { type: 'tracing', category: 'Paint' }],
      ]);

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'hide [thread GeckoMain tab]',
        'show [thread GeckoMain tab] SELECTED',
        'hide [thread GeckoMain tab]',
      ]);
    });

    it('will not hide non-idle content threads with no RefreshDriverTick markers', function () {
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

      addMarkersToThreadWithCorrespondingSamples(profile.threads[1], [
        ['RefreshDriverTick', 0, null, { type: 'tracing', category: 'Paint' }],
      ]);

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [thread GeckoMain tab] SELECTED',
        'show [thread GeckoMain tab]',
        'show [thread GeckoMain tab]',
      ]);
    });

    it('will hide an empty global track when all child tracks are hidden', function () {
      const store = blankStore();
      const { profile } = getProfileFromTextSamples(
        `work  work  work  work  work`, // pid 1
        `work  work  work  work  work`, // pid 1
        `idle[cat:Idle]  idle[cat:Idle]  idle[cat:Idle]  idle[cat:Idle]  idle[cat:Idle]`, // pid 2
        `work  work  work  work  work` // pid 3
      );

      profile.threads[0].name = 'Work A';
      profile.threads[1].name = 'Work B';
      profile.threads[2].name = 'Idle C';
      profile.threads[3].name = 'Work E';

      profile.threads[0].pid = 1;
      profile.threads[1].pid = 1;
      profile.threads[2].pid = 2;
      profile.threads[3].pid = 3;

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [process]',
        '  - show [thread Work A] SELECTED',
        '  - show [thread Work B]',
        'hide [process]', // <- Ensure this process is hidden.
        '  - hide [thread Idle C]',
        'show [process]',
        '  - show [thread Work E]',
      ]);
    });

    it('will not hide audio tracks if they have at least one sample', function () {
      const store = blankStore();

      const idleThread: Array<string> = (Array.from({
        length: 100,
      }): any).fill('idle[cat:Idle]');
      const idleThreadString = idleThread.join('  ');

      // We want 1 work sample in 100 samples for each thread.
      const oneWorkSampleThread = idleThread.slice();
      oneWorkSampleThread[1] = 'work';
      const oneWorkSampleThreadString = oneWorkSampleThread.join('  ');

      const { profile } = getProfileFromTextSamples(
        oneWorkSampleThreadString, // AudioIPC
        oneWorkSampleThreadString, // MediaPDecoder
        oneWorkSampleThreadString, // MediaTimer
        oneWorkSampleThreadString, // MediaPlayback
        oneWorkSampleThreadString, // MediaDecoderStateMachine
        idleThreadString, // AudioIPC
        idleThreadString, // MediaPDecoder
        idleThreadString, // MediaTimer
        idleThreadString, // MediaPlayback
        idleThreadString // MediaDecoderStateMachine
      );

      profile.threads[0].name = 'AudioIPC work';
      profile.threads[1].name = 'MediaPDecoder work';
      profile.threads[2].name = 'MediaTimer work';
      profile.threads[3].name = 'MediaPlayback work';
      profile.threads[4].name = 'MediaDecoderStateMachine work';
      profile.threads[5].name = 'AudioIPC idle';
      profile.threads[6].name = 'MediaPDecoder idle';
      profile.threads[7].name = 'MediaTimer idle';
      profile.threads[8].name = 'MediaPlayback idle';
      profile.threads[9].name = 'MediaDecoderStateMachine idle';

      store.dispatch(viewProfile(profile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [process]',
        '  - show [thread AudioIPC work] SELECTED',
        '  - show [thread MediaPDecoder work]',
        '  - show [thread MediaTimer work]',
        '  - show [thread MediaPlayback work]',
        '  - show [thread MediaDecoderStateMachine work]',
        '  - hide [thread AudioIPC idle]',
        '  - hide [thread MediaPDecoder idle]',
        '  - hide [thread MediaTimer idle]',
        '  - hide [thread MediaPlayback idle]',
        '  - hide [thread MediaDecoderStateMachine idle]',
      ]);
    });
  });

  describe('changeTimelineTrackOrganization', function () {
    const tabID = 123;
    const innerWindowID = 111111;
    function setup({
      profile,
      initializeCtxId = false,
    }: {
      profile?: Profile,
      initializeCtxId?: boolean,
    }) {
      const store = blankStore();

      if (!profile) {
        profile = getEmptyProfile();
        profile.threads.push(
          getEmptyThread({ name: 'GeckoMain', processType: 'tab', pid: 1 })
        );
      }

      profile.meta.configuration = {
        threads: [],
        features: [],
        capacity: 1000000,
        activeTabID: tabID,
      };
      profile.pages = [
        {
          tabID: tabID,
          innerWindowID: innerWindowID,
          url: 'URL',
          embedderInnerWindowID: 0,
        },
      ];

      store.dispatch(viewProfile(profile));
      if (initializeCtxId) {
        store.dispatch(
          changeTimelineTrackOrganization({
            type: 'active-tab',
            tabID,
          })
        );
      }

      return { ...store, profile };
    }

    it('should be able to switch to active tab view from the full view', function () {
      const { dispatch, getState } = setup({ initializeCtxId: false });
      expect(
        UrlStateSelectors.getTimelineTrackOrganization(getState())
      ).toEqual({
        type: 'full',
      });
      dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          tabID,
        })
      );
      expect(
        UrlStateSelectors.getTimelineTrackOrganization(getState())
      ).toEqual({
        type: 'active-tab',
        tabID,
      });
    });

    it('should be able to switch to full view from the active tab', function () {
      const { dispatch, getState } = setup({ initializeCtxId: true });
      expect(
        UrlStateSelectors.getTimelineTrackOrganization(getState())
      ).toEqual({
        type: 'active-tab',
        tabID,
      });
      dispatch(changeTimelineTrackOrganization({ type: 'full' }));
      expect(
        UrlStateSelectors.getTimelineTrackOrganization(getState())
      ).toEqual({
        type: 'full',
      });
    });

    it('should reset the url state while switching to the full view', function () {
      // Get a profile with nice tracks, so we can test that it's not automatically
      // select the first thread.
      const profile = getProfileWithNiceTracks();
      const { dispatch, getState } = setup({ profile, initializeCtxId: true });

      // Make sure that we start with the active-tab view.
      expect(
        UrlStateSelectors.getTimelineTrackOrganization(getState())
      ).toEqual({
        type: 'active-tab',
        tabID,
      });

      // Now switch to the full view and test that it will select the second track.
      dispatch(changeTimelineTrackOrganization({ type: 'full' }));
      expect(
        UrlStateSelectors.getTimelineTrackOrganization(getState())
      ).toEqual({
        type: 'full',
      });
      // It should find the best non-idle thread instead of selecting the first
      // one automatically.
      expect(
        UrlStateSelectors.getSelectedThreadIndexes(getState())
      ).toMatchObject(new Set([1]));
    });
  });

  describe('retrieveProfileFromBrowser', function () {
    function toUint8Array(json) {
      return encode(JSON.stringify(json));
    }

    function _setup(profileAs = 'json') {
      jest.useFakeTimers();

      const profileJSON = createGeckoProfile();
      const profileGetter = async () => {
        switch (profileAs) {
          case 'json':
            return profileJSON;
          case 'arraybuffer':
            return toUint8Array(profileJSON).buffer;
          case 'gzip':
            return (await compress(toUint8Array(profileJSON))).buffer;
          default:
            throw new Error('unknown profiler format');
        }
      };

      window.fetch = jest
        .fn()
        .mockRejectedValue(new Error('No symbolication API in place'));

      simulateSymbolStoreHasNoCache();

      window.TextDecoder = TextDecoder;

      // Silence the warnings coming from the failed symbolication attempts, and
      // make sure that the logged error contains our error messages.
      jest.spyOn(console, 'warn').mockImplementation((error) => {
        expect(error).toBeInstanceOf(SymbolsNotFoundError);
        expect(error.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  message: 'No symbolication API in place',
                }),
              ]),
            }),
            expect.objectContaining({ message: 'No symbol tables available' }),
          ])
        );
      });

      const store = blankStore();

      return {
        profileGetter,
        store,
      };
    }

    function setupWithFrameScript(profileAs: string = 'json') {
      const { store, profileGetter } = _setup(profileAs);

      const geckoProfiler = {
        getProfile: jest.fn().mockImplementation(() => profileGetter()),
        getSymbolTable: jest
          .fn()
          .mockRejectedValue(new Error('No symbol tables available')),
      };

      const webChannel = simulateOldWebChannelAndFrameScript(geckoProfiler);

      return {
        geckoProfiler,
        store,
        ...store,
        ...webChannel,
      };
    }

    function setupWithWebChannel(profileAs: string = 'json') {
      const { store, profileGetter } = _setup(profileAs);
      const webChannel = simulateWebChannel(profileGetter);

      return {
        store,
        ...store,
        ...webChannel,
      };
    }

    afterEach(function () {
      delete window.geckoProfilerPromise;
      delete window.TextDecoder;
      delete window.fetch;
    });

    for (const setupWith of ['frame-script', 'web-channel']) {
      for (const profileAs of ['json', 'arraybuffer', 'gzip']) {
        it(`can retrieve a profile from the browser as ${profileAs} using ${setupWith}`, async function () {
          const setupFn = {
            'frame-script': setupWithFrameScript,
            'web-channel': setupWithWebChannel,
          }[setupWith];
          const { dispatch, getState } = setupFn(profileAs);
          await dispatch(retrieveProfileFromBrowser());
          expect(console.warn).toHaveBeenCalledTimes(2);

          const state = getState();
          expect(getView(state)).toEqual({ phase: 'DATA_LOADED' });
          expect(ProfileViewSelectors.getCommittedRange(state)).toEqual({
            start: 0,
            // The end can be computed as the sum of:
            // - difference of the starts of the subprocess and the main process (1000)
            // - the max of the last sample. (in this case, last sample's time is 6.
            // - the interval (1)
            end: 1007,
          });
          // not empty
          expect(ProfileViewSelectors.getProfile(state).threads).toHaveLength(
            3
          );
        });
      }
    }

    it('tries to symbolicate the received profile, frame script version', async () => {
      const { dispatch, geckoProfiler } = setupWithFrameScript();

      await dispatch(retrieveProfileFromBrowser());

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

    it('tries to symbolicate the received profile, webchannel version', async () => {
      const { dispatch } = setupWithWebChannel();

      await dispatch(retrieveProfileFromBrowser());

      expect(window.fetch).toHaveBeenCalledWith(
        'https://symbols.mozilla.org/symbolicate/v5',
        expect.objectContaining({
          body: expect.stringMatching(/memoryMap.*firefox/),
        })
      );
    });
  });

  describe('retrieveProfileFromStore', function () {
    // Force type-casting to Response to allow to be used as return value for fetch
    const fetch403Response = (({ ok: false, status: 403 }: any): Response);
    const fetch500Response = (({ ok: false, status: 500 }: any): Response);
    const fetch200Response = (({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      arrayBuffer: () =>
        Promise.resolve(encode(serializeProfile(_getSimpleProfile()))),
    }: any): Response);

    beforeEach(function () {
      window.TextDecoder = TextDecoder;
      window.fetch = jest.fn().mockResolvedValue(fetch403Response);

      // Call the argument of setTimeout asynchronously right away
      // (instead of waiting for the timeout).
      jest
        .spyOn(window, 'setTimeout')
        .mockImplementation((callback) => process.nextTick(callback));
    });

    afterEach(function () {
      delete window.TextDecoder;
      delete window.fetch;
    });

    it('can retrieve a profile from the web and save it to state', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const expectedUrl = `https://storage.googleapis.com/profile-store/${hash}`;

      window.fetch = jest.fn((url) =>
        Promise.resolve(
          url === expectedUrl ? fetch200Response : fetch403Response
        )
      );

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
      const { profile: unsymbolicatedProfile } =
        getProfileFromTextSamples('0xA[lib:libxul]');
      unsymbolicatedProfile.meta.symbolicated = false;

      window.fetch = jest.fn().mockResolvedValue(
        (({
          ...fetch200Response,
          json: () => Promise.resolve(), // Used when fetching symbols.
          arrayBuffer: () =>
            Promise.resolve(encode(serializeProfile(unsymbolicatedProfile))),
        }: any): Response)
      );

      simulateSymbolStoreHasNoCache();

      // Silence console logs coming from the previous rejection
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      const store = blankStore();
      await store.dispatch(retrieveProfileFromStore('FAKEHASH'));

      expect(window.fetch).toHaveBeenLastCalledWith(
        'https://symbols.mozilla.org/symbolicate/v5',
        expect.objectContaining({
          body: expect.stringMatching(/memoryMap.*libxul/),
        })
      );

      expect(console.warn).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message:
            'Could not obtain symbols for libxul/SOMETHING_FAKE.\n' +
            ' - SymbolsNotFoundError: There was a problem with the JSON returned by the symbolication API.\n' +
            ' - Error: Expected an object with property `results`\n' +
            " - Error: There's no connection to the browser.",
        })
      );
    });

    it('requests several times in case of 403', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const expectedUrl = `https://storage.googleapis.com/profile-store/${hash}`;
      window.fetch
        .mockImplementationOnce((_) => Promise.resolve(fetch403Response))
        .mockImplementationOnce((url) =>
          Promise.resolve(
            url === expectedUrl ? fetch200Response : fetch403Response
          )
        );

      const store = blankStore();
      const views = (
        await observeStoreStateChanges(store, () =>
          store.dispatch(retrieveProfileFromStore(hash))
        )
      ).map((state) => getView(state));

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

    it('fails in case the profile cannot be found after several tries', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      const store = blankStore();
      const views = (
        await observeStoreStateChanges(store, () =>
          store.dispatch(retrieveProfileFromStore(hash))
        )
      ).map((state) => getView(state));

      const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const errorMessage = 'Profile not found on remote server.';
      expect(views).toEqual([
        { phase: 'INITIALIZING' },
        ...steps.map((step) => ({
          phase: 'INITIALIZING',
          additionalData: {
            attempt: { count: step, total: 11 },
            message: errorMessage,
          },
        })),
        { phase: 'FATAL_ERROR', error: expect.any(Error) },
      ]);
    });

    it('fails in case the fetch returns a server error', async function () {
      const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';
      window.fetch = jest.fn().mockResolvedValue(fetch500Response);

      const store = blankStore();
      await store.dispatch(retrieveProfileFromStore(hash));
      expect(getView(store.getState())).toEqual({
        phase: 'FATAL_ERROR',
        error: expect.any(Error),
      });
    });
  });

  describe('retrieveProfileOrZipFromUrl', function () {
    // Force type-casting to Response to allow to be used as return value for fetch
    const fetch403Response = (({ ok: false, status: 403 }: any): Response);
    const fetch500Response = (({ ok: false, status: 500 }: any): Response);
    const fetch200Response = (({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      arrayBuffer: () =>
        Promise.resolve(encode(serializeProfile(_getSimpleProfile()))),
    }: any): Response);
    const fetch200GzippedResponse = (({
      ok: true,
      status: 200,
      headers: {
        get: () => 'application/json',
      },
      arrayBuffer: () => compress(serializeProfile(_getSimpleProfile())),
    }: any): Response);

    beforeEach(function () {
      window.TextDecoder = TextDecoder;
      (window: any).TextEncoder = TextEncoder;
      window.fetch = jest.fn().mockResolvedValue(fetch403Response);

      // Call the argument of setTimeout asynchronously right away
      // (instead of waiting for the timeout).
      jest
        .spyOn(window, 'setTimeout')
        .mockImplementation((callback) => process.nextTick(callback));
    });

    afterEach(function () {
      delete window.TextDecoder;
      delete (window: any).TextEncoder;
      delete window.fetch;
    });

    it('can retrieve a profile from the web and save it to state', async function () {
      const expectedUrl = 'https://profiles.club/shared.json';
      window.fetch = jest.fn((url) =>
        Promise.resolve(
          url === expectedUrl ? fetch200Response : fetch403Response
        )
      );

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

    it('can retrieve a gzipped profile from the web and save it to state', async function () {
      const expectedUrl = 'https://profiles.club/shared.json';
      window.fetch = jest.fn((url) =>
        Promise.resolve(
          url === expectedUrl ? fetch200GzippedResponse : fetch403Response
        )
      );

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

    it('requests several times in case of 403', async function () {
      const expectedUrl = 'https://profiles.club/shared.json';
      // The first call will still be a 403 -- remember, it's the default return value.
      window.fetch
        .mockResolvedValueOnce(fetch403Response)
        .mockImplementationOnce((url) =>
          Promise.resolve(
            url === expectedUrl ? fetch200Response : fetch403Response
          )
        );

      const store = blankStore();
      const views = (
        await observeStoreStateChanges(store, () =>
          store.dispatch(retrieveProfileOrZipFromUrl(expectedUrl))
        )
      ).map((state) => getView(state));

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

    it('fails in case the profile cannot be found after several tries', async function () {
      const expectedUrl = 'https://profiles.club/shared.json';
      const store = blankStore();
      const views = (
        await observeStoreStateChanges(store, () =>
          store.dispatch(retrieveProfileOrZipFromUrl(expectedUrl))
        )
      ).map((state) => getView(state));

      const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      const errorMessage = 'Profile not found on remote server.';
      expect(views).toEqual([
        { phase: 'INITIALIZING' },
        ...steps.map((step) => ({
          phase: 'INITIALIZING',
          additionalData: {
            attempt: { count: step, total: 11 },
            message: errorMessage,
          },
        })),
        { phase: 'FATAL_ERROR', error: expect.any(Error) },
      ]);
    });

    it('fails in case the fetch returns a server error', async function () {
      const expectedUrl = 'https://profiles.club/shared.json';
      window.fetch = jest.fn().mockResolvedValue(fetch500Response);

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
  describe('_fetchProfile', function () {
    beforeEach(function () {
      window.TextDecoder = TextDecoder;
      window.fetch = jest.fn();
    });

    afterEach(function () {
      delete window.TextDecoder;
      delete window.fetch;
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
        arrayBuffer = () => Promise.resolve(encode(stringProfile));
        json = () => Promise.reject(new Error('Not implemented'));
      }

      const zippedProfileResponse = (({
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
      }: any): Response);
      const fetch403Response = (({ ok: false, status: 403 }: any): Response);

      window.fetch = jest.fn((actualUrl) =>
        Promise.resolve(
          actualUrl === url ? zippedProfileResponse : fetch403Response
        )
      );

      const reportError = jest.fn();
      const args = {
        url,
        onTemporaryError: () => {},
        reportError,
      };

      // Return fetch's args, based on the inputs.
      return { profile, args, reportError };
    }

    it('fetches a normal profile with the correct content-type headers', async function () {
      const { profile, args } = await configureFetch({
        url: 'https://example.com/profile.json',
        contentType: 'application/json',
        isJSON: true,
      });

      const { profile: profileFetched } = await _fetchProfile(args);
      expect(profileFetched).toEqual(profile);
    });

    it('fetches a zipped profile with correct content-type headers', async function () {
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.zip',
        contentType: 'application/zip',
        isZipped: true,
      });

      const { zip } = await _fetchProfile(args);
      expect(zip).toBeTruthy();
      expect(reportError.mock.calls.length).toBe(0);
    });

    it('fetches a zipped profile with incorrect content-type headers, but .zip extension', async function () {
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.zip',
        isZipped: true,
      });

      const { zip } = await _fetchProfile(args);
      expect(zip).toBeTruthy();
      expect(reportError.mock.calls.length).toBe(0);
    });

    it('fetches a profile with incorrect content-type headers, but .json extension', async function () {
      const { profile, args, reportError } = await configureFetch({
        url: 'https://example.com/profile.json',
        isJSON: true,
      });

      const { profile: profileFetched } = await _fetchProfile(args);
      expect(profileFetched).toEqual(profile);
      expect(reportError.mock.calls.length).toBe(0);
    });

    it('fetches a profile with incorrect content-type headers, no known extension, and attempts to JSON parse it it', async function () {
      const { profile, args, reportError } = await configureFetch({
        url: 'https://example.com/profile.file',
        isJSON: true,
      });

      const { profile: profileFetched } = await _fetchProfile(args);
      expect(profileFetched).toEqual(profile);
      expect(reportError.mock.calls.length).toBe(0);
    });

    it('fails if a bad zip file is passed in', async function () {
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

    it('fails if a bad profile JSON is passed in', async function () {
      const invalidJSON = 'invalid';
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.json',
        contentType: 'application/json',
        arrayBuffer: () => Promise.resolve(encode(invalidJSON)),
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

    it('fails if a bad profile JSON is passed in, with no content type', async function () {
      const invalidJSON = 'invalid';
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.json',
        arrayBuffer: () => Promise.resolve(encode(invalidJSON)),
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

    it('fails if a completely unknown file is passed in', async function () {
      const invalidJSON = 'invalid';
      const { args, reportError } = await configureFetch({
        url: 'https://example.com/profile.unknown',
        arrayBuffer: () => Promise.resolve(encode(invalidJSON)),
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

  describe('retrieveProfileFromFile', function () {
    beforeEach(function () {
      if ((window: any).TextEncoder) {
        throw new Error('A TextEncoder was already on the window object.');
      }
      (window: any).TextEncoder = TextEncoder;
    });

    afterEach(async function () {
      delete (window: any).TextEncoder;
    });
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
      // When the file is loaded, the profiler tries to connect to the WebChannel
      // for symbolication. Handle that request so that we don't time out.
      // We handle it by rejecting it.
      const { registerMessageToChromeListener, triggerResponse } =
        mockWebChannel();
      registerMessageToChromeListener(() => {
        triggerResponse({
          errno: 2, // ERRNO_NO_SUCH_CHANNEL
          error: 'No such channel',
        });
      });
      // Ignore the console.error from the the WebChannel error.
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // Load a profile from the supplied mockFileOptions.
      const file = mockFile(mockFileOptions);
      const { dispatch, getState } = blankStore();
      await dispatch(retrieveProfileFromFile(file, mockFileReader));
      const view = getView(getState());
      return { getState, dispatch, view };
    }

    it('can load json with a good mime type', async function () {
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

    it('symbolicates unsymbolicated profiles', async function () {
      simulateSymbolStoreHasNoCache();

      window.fetch = jest
        .fn()
        .mockRejectedValue(new Error('No symbolication API in place'));

      // Silence console logs coming from the previous rejections
      jest.spyOn(console, 'warn').mockImplementation(() => {});

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

    it('can load json with an empty mime type', async function () {
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

    it('can load gzipped json with an empty mime type', async function () {
      window.TextDecoder = TextDecoder;
      const profile = _getSimpleProfile();
      profile.meta.product = 'JSON Test';

      const { getState, view } = await setupTestWithFile({
        type: '',
        payload: compress(serializeProfile(profile)),
      });
      expect(view.phase).toBe('DATA_LOADED');
      expect(ProfileViewSelectors.getProfile(getState()).meta.product).toEqual(
        'JSON Test'
      );
    });

    it('will give an error when unable to parse json', async function () {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const { view } = await setupTestWithFile({
        type: 'application/json',
        payload: '{}',
      });
      expect(view.phase).toBe('FATAL_ERROR');

      expect(
        // Coerce into an any to access the error property.
        (view: any).error
      ).toMatchSnapshot();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('can load gzipped json', async function () {
      window.TextDecoder = TextDecoder;
      const profile = _getSimpleProfile();
      profile.meta.product = 'JSON Test';

      const { getState, view } = await setupTestWithFile({
        type: 'application/gzip',
        payload: compress(serializeProfile(profile)),
      });
      expect(view.phase).toBe('DATA_LOADED');
      expect(ProfileViewSelectors.getProfile(getState()).meta.product).toEqual(
        'JSON Test'
      );
    });

    it('can load gzipped json even with incorrect mime type', async function () {
      window.TextDecoder = TextDecoder;
      const profile = _getSimpleProfile();
      profile.meta.product = 'JSON Test';

      const { getState, view } = await setupTestWithFile({
        type: 'application/json',
        payload: compress(serializeProfile(profile)),
      });
      expect(view.phase).toBe('DATA_LOADED');
      expect(ProfileViewSelectors.getProfile(getState()).meta.product).toEqual(
        'JSON Test'
      );
    });

    it('will give an error when unable to parse gzipped profiles', async function () {
      window.TextDecoder = TextDecoder;
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const { view } = await setupTestWithFile({
        type: 'application/gzip',
        payload: compress('{}'),
      });
      expect(view.phase).toBe('FATAL_ERROR');

      expect(
        // Coerce into the object to access the error property.
        (view: any).error
      ).toMatchSnapshot();
      expect(consoleErrorSpy).toHaveBeenCalled();
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

    it('can load a zipped profile', async function () {
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

    it('will load and view a simple profile with no errors', async function () {
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

    it('will be an error to view a profile with no threads', async function () {
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

    it('will give an error when unable to decompress a zipped profile', async function () {
      const { view } = await setupTestWithFile({
        type: 'application/zip',
        payload: new ArrayBuffer(10),
      });
      expect(view.phase).toBe('FATAL_ERROR');
      expect(
        // Coerce into an any to access the error property.
        (view: any).error
      ).toMatchSnapshot();
    });
  });

  describe('retrieveProfilesToCompare', function () {
    function fetch200Response(profile: string) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        arrayBuffer: () => Promise.resolve(encode(profile)),
      };
    }

    function getSomeProfiles() {
      const { profile: profile1 } = getProfileFromTextSamples(
        `A  B  C  D  E`,
        `G  H  I  J  K`
      );
      const { profile: profile2 } = getProfileFromTextSamples(
        `L  M  N  O  P  Ex  Ex  Ex  Ex`,
        `Q  R  S  T  U  Ex  Ex  Ex  Ex`
      );

      return { profile1, profile2 };
    }

    type SetupProfileParams = {|
      profile1: Profile,
      profile2: Profile,
    |};

    type SetupUrlSearchParams = {|
      urlSearch1: string,
      urlSearch2: string,
    |};

    function setupWithLongUrl(
      profiles: SetupProfileParams,
      { urlSearch1, urlSearch2 }: SetupUrlSearchParams = {
        urlSearch1: 'thread=0',
        urlSearch2: 'thread=0',
      }
    ) {
      const fakeUrl1 = `https://fakeurl.com/public/fakehash1/?${urlSearch1}&v=3`;
      const fakeUrl2 = `https://fakeurl.com/public/fakehash2/?${urlSearch2}&v=3`;

      return setup(profiles, { url1: fakeUrl1, url2: fakeUrl2 });
    }

    async function setupWithShortUrl(
      profiles: SetupProfileParams,
      { urlSearch1, urlSearch2 }: SetupUrlSearchParams
    ) {
      const longUrl1 = `https://fakeurl.com/public/fakehash1/?${urlSearch1}&v=3`;
      const longUrl2 = `https://fakeurl.com/public/fakehash2/?${urlSearch2}&v=3`;
      const shortUrl1 = 'https://perfht.ml/FAKEBITLYHASH1';
      const shortUrl2 = 'https://bit.ly/FAKEBITLYHASH2';

      (expandUrl: any).mockImplementation((shortUrl) => {
        switch (shortUrl) {
          case shortUrl1:
            return longUrl1;
          case shortUrl2:
            return longUrl2;
          default:
            throw new Error(`The short url ${shortUrl} was not found.`);
        }
      });

      const setupResult = await setup(profiles, {
        url1: shortUrl1,
        url2: shortUrl2,
      });

      return {
        ...setupResult,
        shortUrl1,
        shortUrl2,
      };
    }

    type SetupUrlParams = {|
      url1: string,
      url2: string,
    |};

    type SetupOptionsParams = $Shape<{|
      +skipMarkers: boolean,
    |}>;

    async function setup(
      { profile1, profile2 }: SetupProfileParams,
      { url1, url2 }: SetupUrlParams,
      { skipMarkers }: SetupOptionsParams = {}
    ) {
      if (skipMarkers !== true) {
        profile1.threads.forEach((thread) =>
          addMarkersToThreadWithCorrespondingSamples(thread, [
            ['A', 1, 3],
            ['A', 1],
            ['B', 2],
            ['C', 3],
            ['D', 4],
            ['E', 5],
          ])
        );
        profile2.threads.forEach((thread) =>
          addMarkersToThreadWithCorrespondingSamples(thread, [
            ['F', 1, 3],
            ['G', 2],
            ['H', 3],
            ['I', 4],
            ['J', 5],
          ])
        );
      }
      window.fetch
        .mockResolvedValueOnce(fetch200Response(serializeProfile(profile1)))
        .mockResolvedValueOnce(fetch200Response(serializeProfile(profile2)));

      const { dispatch, getState } = blankStore();
      await dispatch(retrieveProfilesToCompare([url1, url2]));

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

    beforeEach(function () {
      window.fetch = jest.fn();
      window.fetch.mockImplementation(() =>
        Promise.reject(new Error('No more answers have been configured.'))
      );
    });

    afterEach(function () {
      delete window.fetch;
    });

    it('retrieves profiles and put them in the same view', async function () {
      const { profile1, profile2, resultProfile, globalTracks, rootRange } =
        await setupWithLongUrl(getSomeProfiles(), {
          urlSearch1: 'thread=0&profileName=name 1',
          urlSearch2: 'thread=1',
        });

      const expectedThreads = [
        {
          ...profile1.threads[0],
          pid: '0 from profile 1',
          processName: 'name 1: Empty',
          unregisterTime: getTimeRangeForThread(profile1.threads[0], 1).end,
        },
        {
          ...profile2.threads[1],
          pid: '0 from profile 2',
          processName: 'Profile 2: Empty',
          unregisterTime: getTimeRangeForThread(profile2.threads[1], 1).end,
        },
        // comparison thread
        expect.objectContaining({
          processType: 'comparison',
          pid: 'Diff between 1 and 2',
          name: 'Diff between 1 and 2',
        }),
      ];

      expect(resultProfile.threads).toEqual(expectedThreads);
      expect(globalTracks).toHaveLength(3); // each thread + comparison track
      expect(rootRange).toEqual({ start: 0, end: 9 });
    });

    it('expands the URL if needed', async function () {
      const { shortUrl1, shortUrl2, globalTracks, rootRange } =
        await setupWithShortUrl(getSomeProfiles(), {
          urlSearch1: 'thread=0',
          urlSearch2: 'thread=1',
        });

      // Reuse some expectations from the previous test
      expect(globalTracks).toHaveLength(3); // each thread + comparison track
      expect(rootRange).toEqual({ start: 0, end: 9 });

      // Check that expandUrl has been called
      expect(expandUrl).toHaveBeenCalledWith(shortUrl1);
      expect(expandUrl).toHaveBeenCalledWith(shortUrl2);
    });

    it('keeps the initial rootRange as default', async function () {
      //Time sample has been set for 100000ms (100s)
      const { profile } = getProfileFromTextSamples(`
        100000
        A
      `); //
      const { rootRange } = await setup(
        { profile1: profile, profile2: profile },
        {
          url1: 'https://fakeurl.com/public/fakehash1/?thread=0&v=3',
          url2: 'https://fakeurl.com/public/fakehash1/?thread=0&v=3',
        },
        { skipMarkers: true }
      );
      expect(rootRange).toEqual({ start: 0, end: 1 });
    });

    it('filters samples and markers, according to the URL', async function () {
      const { resultProfile } = await setupWithLongUrl(getSomeProfiles(), {
        urlSearch1: 'thread=0&range=0.0011_0.0043',
        urlSearch2: 'thread=1',
      });
      expect(resultProfile.threads[0].samples).toHaveLength(3);
      expect(resultProfile.threads[0].markers).toHaveLength(4);
    });

    it('reuses the implementation information if both profiles used it', async function () {
      const { getState } = await setupWithLongUrl(getSomeProfiles(), {
        urlSearch1: 'thread=0&implementation=js',
        urlSearch2: 'thread=1&implementation=js',
      });

      expect(UrlStateSelectors.getImplementationFilter(getState())).toBe('js');
    });

    it('does not reuse the implementation information if one profile used it', async function () {
      const { getState } = await setupWithLongUrl(getSomeProfiles(), {
        urlSearch1: 'thread=0&implementation=js',
        urlSearch2: 'thread=1',
      });

      expect(UrlStateSelectors.getImplementationFilter(getState())).not.toBe(
        'js'
      );
    });

    it('reuses transforms', async function () {
      const { getState } = await setupWithLongUrl(getSomeProfiles(), {
        urlSearch1: 'thread=0&transforms=ff-42',
        urlSearch2: 'thread=1',
      });

      expect(UrlStateSelectors.getTransformStack(getState(), 0)).toEqual([
        {
          type: 'focus-function',
          funcIndex: 42,
        },
      ]);
    });

    it('creates a diff thread that computes properly diff timings', async function () {
      const { profile: baseProfile } = getProfileFromTextSamples('A  A');
      const { profile: regressionProfile } =
        getProfileFromTextSamples('A  A  A  A  A  A');
      const { resultProfile, getState } = await setupWithLongUrl({
        profile1: baseProfile,
        profile2: regressionProfile,
      });

      expect(resultProfile.threads).toHaveLength(3);
      const selectors = getThreadSelectors(2);
      const callTree = selectors.getCallTree(getState());
      const [firstChild] = callTree.getRoots();
      const nodeData = callTree.getNodeData(firstChild);
      expect(nodeData.self).toBe(4);
    });

    it("doesn't include screenshot track if the profiles don't have any screenshot marker", async function () {
      const store = blankStore();
      const { resultProfile } = await setup(getSomeProfiles(), {
        url1: 'https://fakeurl.com/public/fakehash1/?thread=0&v=3',
        url2: 'https://fakeurl.com/public/fakehash1/?thread=0&v=3',
      });

      store.dispatch(viewProfile(resultProfile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [thread Empty default] SELECTED',
        'show [thread Empty default]',
        'show [thread Diff between 1 and 2 comparison]',
      ]);
    });

    it('includes screenshot track of both profiles if they have screenshot markers', async function () {
      const store = blankStore();
      //Get profiles with one screenshot track
      const profile1 = getProfileWithMarkers([
        [
          'CompositorScreenshot',
          0,
          null,
          {
            type: 'CompositorScreenshot',
            url: 0, // Some arbitrary string.
            windowID: '0',
            windowWidth: 300,
            windowHeight: 150,
          },
        ],
      ]);
      const profile2 = getProfileWithMarkers([
        [
          'CompositorScreenshot',
          0,
          null,
          {
            type: 'CompositorScreenshot',
            url: 0, // Some arbitrary string.
            windowID: '1',
            windowWidth: 300,
            windowHeight: 150,
          },
        ],
      ]);
      const { resultProfile } = await setup(
        {
          profile1: profile1,
          profile2: profile2,
        },
        {
          url1: 'https://fakeurl.com/public/fakehash1/?thread=0&v=3',
          url2: 'https://fakeurl.com/public/fakehash1/?thread=0&v=3',
        }
      );

      store.dispatch(viewProfile(resultProfile));
      expect(getHumanReadableTracks(store.getState())).toEqual([
        'show [screenshots]',
        'show [screenshots]',
        'show [thread Empty default] SELECTED',
        'show [thread Empty default]',
        'show [thread Diff between 1 and 2 comparison]',
      ]);
    });
  });

  describe('getProfilesFromRawUrl', function () {
    function fetch200Response(profile: string) {
      return {
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        arrayBuffer: () => Promise.resolve(encode(profile)),
      };
    }

    async function setup(
      location: $Shape<Location>,
      requiredProfile: number = 1
    ) {
      const profile = _getSimpleProfile();
      const geckoProfile = createGeckoProfile();

      // Add mock fetch response for the required number of times.
      // Usually it's 1 but it can be also 2 for `compare` dataSource.
      for (let i = 0; i < requiredProfile; i++) {
        window.fetch.mockResolvedValueOnce(
          fetch200Response(serializeProfile(profile))
        );
      }

      const geckoProfiler = {
        getProfile: jest.fn().mockResolvedValue(geckoProfile),
        getSymbolTable: jest
          .fn()
          .mockRejectedValue(new Error('No symbol tables available')),
      };

      simulateOldWebChannelAndFrameScript(geckoProfiler);

      simulateSymbolStoreHasNoCache();

      // Silence the logs coming from the promise rejections above.
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      const store = blankStore();
      await store.dispatch(getProfilesFromRawUrl(location));

      // To find stupid mistakes more easily, check that we didn't get a fatal
      // error here. If we got one, let's rethrow the error.
      const view = getView(store.getState());
      if (view.phase === 'FATAL_ERROR') {
        throw view.error;
      }

      const waitUntilPhase = (phase) =>
        waitUntilState(store, (state) => getView(state).phase === phase);

      const waitUntilSymbolication = () =>
        waitUntilState(
          store,
          (state) =>
            ProfileViewSelectors.getSymbolicationStatus(state) === 'DONE'
        );

      return {
        profile,
        geckoProfile,
        waitUntilPhase,
        waitUntilSymbolication,
        ...store,
      };
    }

    beforeEach(function () {
      window.fetch = jest.fn();
      window.fetch.mockImplementation(() =>
        Promise.reject(new Error('No more answers have been configured.'))
      );
    });

    afterEach(function () {
      delete window.fetch;
      delete window.geckoProfilerPromise;
    });

    it('retrieves profile from a `public` data source and loads it', async function () {
      const { profile, getState, dispatch } = await setup({
        pathname: '/public/fakehash/',
        search: '?thread=0&v=4',
        hash: '',
      });

      // Check if we loaded the profile data successfully.
      expect(ProfileViewSelectors.getProfile(getState())).toEqual(profile);
      expect(getView(getState()).phase).toBe('PROFILE_LOADED');

      // Check if we can successfully finalize the profile view.
      await dispatch(finalizeProfileView());
      expect(getView(getState()).phase).toBe('DATA_LOADED');
    });

    it('retrieves profile from a `from-url` data source and loads it', async function () {
      const { profile, getState, dispatch } = await setup({
        // '/from-url/https://fakeurl.com/fakeprofile.json/'
        pathname: '/from-url/https%3A%2F%2Ffakeurl.com%2Ffakeprofile.json/',
        search: '',
        hash: '',
      });

      // Check if we loaded the profile data successfully.
      expect(ProfileViewSelectors.getProfile(getState())).toEqual(profile);
      expect(getView(getState()).phase).toBe('PROFILE_LOADED');

      // Check if we can successfully finalize the profile view.
      await dispatch(finalizeProfileView());
      expect(getView(getState()).phase).toBe('DATA_LOADED');
    });

    it('keeps the `from-url` value in the URL', async function () {
      const { getState, dispatch } = await setup({
        // '/from-url/https://fakeurl.com/fakeprofile.json/'
        pathname: '/from-url/https%3A%2F%2Ffakeurl.com%2Ffakeprofile.json/',
        search: '',
        hash: '',
      });
      await dispatch(finalizeProfileView());
      const [, fromUrl, urlString] = urlFromState(
        UrlStateSelectors.getUrlState(getState())
      ).split('/');
      expect(fromUrl).toEqual('from-url');
      expect(urlString).toEqual('https%3A%2F%2Ffakeurl.com%2Ffakeprofile.json');
    });

    it('retrieves profile from a `compare` data source and loads it', async function () {
      const url1 = 'http://fake-url.com/public/1?thread=0';
      const url2 = 'http://fake-url.com/public/2?thread=0';
      const { getState, dispatch } = await setup(
        {
          pathname: '/compare/FAKEURL/',
          search: oneLineTrim`
            ?profiles[]=${encodeURIComponent(url1)}
            &profiles[]=${encodeURIComponent(url2)}
          `,
          hash: '',
        },
        2
      );

      // Check if we loaded the profile data successfully.
      expect(getView(getState()).phase).toBe('PROFILE_LOADED');

      // Check if we can successfully finalize the profile view.
      await dispatch(finalizeProfileView());
      expect(getView(getState()).phase).toBe('DATA_LOADED');
    });

    it('retrieves profile from a `from-browser` data source and loads it', async function () {
      const { geckoProfile, getState, waitUntilPhase } = await setup(
        {
          pathname: '/from-browser/',
          search: '',
          hash: '',
        },
        0
      );

      // Differently, `from-browser` calls the finalizeProfileView internally,
      // we don't need to call it again.
      await waitUntilPhase('DATA_LOADED');
      const processedProfile = processGeckoProfile(geckoProfile);
      expect(ProfileViewSelectors.getProfile(getState())).toEqual(
        processedProfile
      );
    });

    it('finishes symbolication for `from-browser` data source', async function () {
      const { waitUntilSymbolication } = await setup(
        {
          pathname: '/from-browser/',
          search: '',
          hash: '',
        },
        0
      );

      // It should successfully symbolicate the profiles that are loaded from the browser.
      return expect(waitUntilSymbolication()).resolves.toBe(undefined);
    });

    ['none', 'from-file', 'local', 'uploaded-recordings', 'compare'].forEach(
      (dataSource) => {
        it(`does not retrieve a profile for the datasource ${dataSource}`, async function () {
          const sourcePath = `/${dataSource}/`;
          const { getState } = await setup({
            pathname: sourcePath,
            search: '',
            hash: '',
          });
          expect(ProfileViewSelectors.getProfileOrNull(getState())).toEqual(
            null
          );
        });
      }
    );
  });
});

/**
 * This profile will have a single sample, and a single thread.
 */
function _getSimpleProfile(): Profile {
  return getProfileFromTextSamples('A').profile;
}
