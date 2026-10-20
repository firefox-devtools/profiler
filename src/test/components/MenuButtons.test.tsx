/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  fireEvent,
  screen,
  waitForElementToBeRemoved,
  act,
} from '@testing-library/react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { MenuButtons } from 'firefox-profiler/components/app/MenuButtons';
import { CurrentProfileUploadedInformationLoader } from 'firefox-profiler/components/app/CurrentProfileUploadedInformationLoader';

import { stateFromLocation } from 'firefox-profiler/app-logic/url-handling';
import {
  processGeckoProfile,
  unserializeProfileOfArbitraryFormat,
} from 'firefox-profiler/profile-logic/process-profile';
import {
  persistUploadedProfileInformationToDb,
  retrieveUploadedProfileInformationFromDb,
} from 'firefox-profiler/app-logic/uploaded-profiles-db';
import {
  updateUrlState,
  updateBrowserConnectionStatus,
} from 'firefox-profiler/actions/app';
import type { BrowserConnection } from 'firefox-profiler/app-logic/browser-connection';
import {
  changeSelectedThreads,
  updateBottomBoxContentsAndMaybeOpen,
} from 'firefox-profiler/actions/profile-view';
import { loadProfile } from 'firefox-profiler/actions/receive-profile';

import { getHash, getDataSource } from 'firefox-profiler/selectors/url-state';

import { ensureExists } from '../../utils/types';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
  addTabInformationToProfile,
  markTabIdsAsPrivateBrowsing,
} from '../fixtures/profiles/processed-profile';
import { createGeckoProfile } from '../fixtures/profiles/gecko-profile';
import { finishLoadingSourceCode } from '../../actions/code';
import { getSourceCodeCacheGeneration } from 'firefox-profiler/selectors/code';
import { fireFullClick } from '../fixtures/utils';
import { storeWithProfile, blankStore } from '../fixtures/stores';

import type {
  Profile,
  Store,
  UploadedProfileInformation,
} from 'firefox-profiler/types';

// We need IndexedDB to get a SymbolStore that's necessary for symbolication
// to even start, in some of the tests for this file.
import { autoMockIndexedDB } from 'firefox-profiler/test/fixtures/mocks/indexeddb';
autoMockIndexedDB();

// We mock profile-store but we want the real error, so that we can simulate it.
import {
  uploadBinaryProfileData,
  deleteProfileOnServer,
} from 'firefox-profiler/profile-logic/profile-store';
jest.mock('firefox-profiler/profile-logic/profile-store');
const { UploadAbortedError } = jest.requireActual(
  '../../profile-logic/profile-store'
);

// Mocking sha1
import sha1 from '../../utils/sha1';
jest.mock('../../utils/sha1');

// We want this module to have mocks so that we can change the return values in
// tests. But in beforeEach below, we return the real implementation by default.
// Note that we can't do it using the factory function because of this Jest issue:
// https://github.com/facebook/jest/issues/14080
jest.mock('firefox-profiler/utils/gz');

beforeEach(() => {
  const realModule = jest.requireActual('firefox-profiler/utils/gz');
  const { compress, decompress } = require('firefox-profiler/utils/gz');
  compress.mockImplementation(realModule.compress);
  decompress.mockImplementation(realModule.decompress);
});

// Mocking shortenUrl
import { shortenUrl } from '../../utils/shorten-url';
jest.mock('../../utils/shorten-url');

import { compress } from 'firefox-profiler/utils/gz';
import { symbolicateProfile } from 'firefox-profiler/profile-logic/symbolication';
jest.mock('firefox-profiler/profile-logic/symbolication');

// Mock hash
const hash = 'c5e53f9ab6aecef926d4be68c84f2de550e2ac2f';

describe('app/MenuButtons', function () {
  function createSimpleProfile(updateChannel = 'release') {
    const { profile } = getProfileFromTextSamples('A');
    profile.meta.updateChannel = updateChannel;
    return { profile };
  }

  function createArgumentValuesProfile(updateChannel = 'release') {
    const { profile } = getProfileFromTextSamples('A  B');
    profile.meta.updateChannel = updateChannel;
    const [thread] = profile.threads;
    thread.samples.argumentValues = [null, 6];
    // A real values buffer recorded by the JS execution tracer.
    thread.tracedValuesBuffer = 'AgAAABIAAQAAAAwHAAAAAAYAAAABAAcAAQAAABE=';
    thread.tracedObjectShapes = [['MouseEvent']];
    return { profile };
  }

  // Paths on the machine that recorded the profile: there's no way to download
  // these files after the profile has been shared, so they're worth embedding.
  const LOCAL_SOURCE_FILE = '/home/user/moz/dom/base/nsDocument.cpp';
  const OTHER_SOURCE_FILE = '/home/user/moz/gfx/nsFoo.cpp';

  function createSourceCodeProfile(updateChannel = 'release') {
    const { profile } = getProfileFromTextSamples(`
      A[file:${LOCAL_SOURCE_FILE}]  A[file:${LOCAL_SOURCE_FILE}]
      B[file:${OTHER_SOURCE_FILE}]
    `);
    profile.meta.updateChannel = updateChannel;
    profile.shared.sources.content[0] = 'void nsDocument::Foo() {}';
    profile.shared.sources.content[1] = 'void nsFoo::Bar() {}';
    return { profile };
  }

  // Same files, but only the first one has been downloaded. Two more files in
  // another directory take most of the samples and aren't downloaded either.
  function createPartlyDownloadedSourceCodeProfile() {
    const { profile } = getProfileFromTextSamples(`
      A[file:${LOCAL_SOURCE_FILE}]  B[file:${OTHER_SOURCE_FILE}]  C[file:/opt/lib/c.cpp]  D[file:/opt/lib/d.cpp]  C[file:/opt/lib/c.cpp]
    `);
    profile.meta.updateChannel = 'release';
    profile.shared.sources.content[0] = 'void nsDocument::Foo() {}';
    return { profile };
  }

  // Two threads, where the second one only runs code from the second file, so
  // that scoping the shared files to the selected threads is a real narrowing
  // and the publish panel offers that preset.
  function createTwoThreadSourceCodeProfile() {
    const { profile } = getProfileFromTextSamples(
      `
        A[file:${LOCAL_SOURCE_FILE}]
        B[file:${OTHER_SOURCE_FILE}]
      `,
      `B[file:${OTHER_SOURCE_FILE}]`
    );
    profile.meta.updateChannel = 'release';
    profile.shared.sources.content[0] = 'void nsDocument::Foo() {}';
    profile.shared.sources.content[1] = 'void nsFoo::Bar() {}';
    return { profile };
  }

  // Gecko emits the `argumentValues` column even when the JS execution tracer
  // wasn't running, so most profiles carry an all-null column and no buffer.
  function createEmptyArgumentValuesProfile(updateChannel = 'release') {
    const { profile } = getProfileFromTextSamples('A  B');
    profile.meta.updateChannel = updateChannel;
    profile.threads[0].samples.argumentValues = [null, null];
    return { profile };
  }

  function createPreferenceReadProfile(updateChannel = 'release') {
    const profile = getProfileWithMarkers([
      [
        'PreferenceRead',
        0,
        1,
        {
          type: 'PreferenceRead',
          prefAccessTime: 0,
          prefName: 'testing',
          prefKind: 'testing',
          prefType: 'testing',
          prefValue: 'testing',
        },
      ],
    ]);
    profile.meta.updateChannel = updateChannel;
    return { profile };
  }

  function setup(store: Store) {
    // We need a sensible data source for this component.
    store.dispatch(
      updateUrlState(
        stateFromLocation({
          pathname: '/from-browser',
          search: '',
          hash: '',
        })
      )
    );
    // Replacing the UrlState above drops the thread selection, which the real
    // app always has once a profile is being viewed.
    store.dispatch(changeSelectedThreads(new Set([0])));

    const renderResult = render(
      <Provider store={store}>
        <>
          <CurrentProfileUploadedInformationLoader />
          <MenuButtons />
        </>
      </Provider>
    );

    const navigateToHash = (hash: string) => {
      const newUrlState = stateFromLocation({
        pathname: `/public/${hash}/calltree`,
        search: '',
        hash: '',
      });
      act(() => {
        store.dispatch(updateUrlState(newUrlState));
      });
    };

    async function waitForPanelToBeRemoved() {
      await waitForElementToBeRemoved(
        ensureExists(document.querySelector('.arrowPanelContent'))
      );
    }

    return {
      ...store,
      ...renderResult,
      navigateToHash,
      waitForPanelToBeRemoved,
    };
  }

  describe('<Publish>', function () {
    const FIXED_GZIP_BYTES = 1580;

    beforeEach(() => {
      (compress as any).mockResolvedValue(new Uint8Array(FIXED_GZIP_BYTES));
    });

    function mockUpload() {
      // Create a promise with the resolve function outside of it.
      // const { promise, resolve: resolveUpload, reject: rejectUpload } = Promise.withResolvers();
      let resolveUpload: (param: any) => void,
        rejectUpload: (reason?: any) => void;
      const promise = new Promise((resolve, reject) => {
        resolveUpload = resolve;
        rejectUpload = reject;
      });

      promise.catch(() => {
        // Node complains if we don't handle a promise/catch, and this one may reject
        // before it's properly handled. Catch it here so that Node doesn't complain.
        // This won't hide problems in our code because the app code "awaits" the
        // result of startUpload, so any rejection will be handled there.
      });

      // TypeScript doesn't know uploadBinaryProfileData is a jest mock.
      (uploadBinaryProfileData as any).mockImplementation(() => ({
        abortUpload: () => {
          // In the real implementation, we call xhr.abort, which in turn
          // triggers an "abort" event on the XHR object, which in turn rejects
          // the promise with the error UploadAbortedError. So we do just that
          // here directly, to simulate this.
          rejectUpload(new UploadAbortedError());
        },
        startUpload: () => promise,
      }));

      // @ts-expect-error - TS2454: Variable 'resolveUpload' is used before being assigned.
      // This is incorrect; new Promise runs its callback synchronously so these variables
      // are already assigned. Anyway, once we can use Promise.withResolvers, that'll be
      // the more straightforward solution.
      return { resolveUpload, rejectUpload };
    }

    function setupForPublish(profile = createSimpleProfile().profile) {
      const { resolveUpload, rejectUpload } = mockUpload();

      const setupResult = setup(storeWithProfile(profile));

      const getPublishButton = () =>
        screen.getByText(/^(Share…|Re-share…|Error uploading)$/);
      const findPublishButton = () =>
        screen.findByText(/^(Share…|Re-share…|Error uploading)$/);
      const getCancelButton = () => screen.getByText('Cancel Upload');
      const getPanelForm = () =>
        ensureExists(
          document.querySelector('form'),
          'Could not find the form in the panel'
        );
      const queryPreferenceCheckbox = () =>
        screen.queryByText('Include preference values');
      const queryPrivateBrowsingCheckbox = () =>
        screen.queryByRole('checkbox', {
          name: /Include the data from private browsing windows/,
        });
      const getPrivateBrowsingCheckbox = () =>
        screen.getByRole('checkbox', {
          name: /Include the data from private browsing windows/,
        });
      const getRemoveOtherTabsCheckbox = () =>
        screen.getByRole('checkbox', {
          name: /Include the data from other tabs/,
        });
      const queryArgumentValuesCheckbox = () =>
        screen.queryByRole('checkbox', {
          name: /Include JavaScript execution tracing function argument values/,
        });
      const querySourceCodeCheckbox = () =>
        screen.queryByRole('checkbox', {
          name: /Include source code/,
        });
      const getSourceTreeCheckbox = (path: string) =>
        screen.getByRole('checkbox', { name: path });
      const getSourceFileTreeLabels = () =>
        Array.from(
          document.querySelectorAll('.sourceFileTreeName'),
          (element) => element.textContent
        );
      const getSourceCodeSummary = () =>
        ensureExists(
          document.querySelector('.publishPanelSourceCodeSummary')
        ).textContent?.replace(/[\u2068\u2069]/g, '');
      const getSourceCodeSummaryLines = () =>
        Array.from(
          document.querySelectorAll('.publishPanelSourceCodeSummary'),
          (element) => element.textContent?.replace(/[\u2068\u2069]/g, '')
        );
      const getSourceCodeLeftOutInfo = () =>
        document
          .querySelector('.publishPanelSourceCodeInfoIcon')
          ?.getAttribute('title')
          ?.replace(/[\u2068\u2069]/g, '')
          .trim();
      const querySourcePresets = () =>
        document.querySelector('.publishPanelSourceCodePresets');
      const getSourcePresetLabels = () =>
        Array.from(
          document.querySelectorAll('.publishPanelSourceCodePresetLabel'),
          (label) => label.textContent
        );
      const getCheckedSourcePreset = () => {
        const checked = document.querySelector(
          '.publishPanelSourceCodePresets input:checked'
        );
        return checked === null
          ? null
          : ensureExists(checked.closest('label')).textContent;
      };
      const getSourcePresetRadio = (label: string) =>
        screen.getByRole('radio', { name: label });
      const getSourceFileSizes = () =>
        Array.from(
          document.querySelectorAll('.sourceFileTreeSize'),
          (element) => element.textContent
        );
      const enableSourceCode = () => {
        fireFullClick(ensureExists(querySourceCodeCheckbox()));
      };
      const openSourceView = (sourceIndex: number) => {
        act(() => {
          setupResult.dispatch(
            updateBottomBoxContentsAndMaybeOpen('calltree', {
              sourceIndex,
              nativeSymbols: [],
              initialNativeSymbol: null,
              highlightedLineNumber: null,
              highlightedInstructionAddress: null,
            })
          );
        });
      };
      const selectThread = (threadIndex: number) => {
        act(() => {
          setupResult.dispatch(changeSelectedThreads(new Set([threadIndex])));
        });
      };
      const getPanel = () => screen.getByTestId('PublishPanel-container');
      // The Share button opens the panel with the Upload CTA and the submit form.
      const openPublishPanel = async () => {
        fireFullClick(getPublishButton());
        await screen.findByText(/^(Share|Re-share) Performance Profile$/);
      };
      // The Save button opens the same panel but with the Save CTA.
      const openDownloadPanel = async () => {
        fireFullClick(screen.getByText('Save…'));
        await screen.findByText('Save Performance Profile');
      };

      return {
        ...setupResult,
        getPanel,
        findPublishButton,
        getPublishButton,
        getCancelButton,
        getPanelForm,
        queryPreferenceCheckbox,
        queryPrivateBrowsingCheckbox,
        getPrivateBrowsingCheckbox,
        getRemoveOtherTabsCheckbox,
        queryArgumentValuesCheckbox,
        querySourceCodeCheckbox,
        getSourceTreeCheckbox,
        getSourceFileTreeLabels,
        getSourceCodeSummary,
        getSourceCodeSummaryLines,
        getSourceCodeLeftOutInfo,
        querySourcePresets,
        getSourcePresetLabels,
        getCheckedSourcePreset,
        getSourcePresetRadio,
        getSourceFileSizes,
        enableSourceCode,
        selectThread,
        openSourceView,
        openPublishPanel,
        openDownloadPanel,
        resolveUpload,
        rejectUpload,
      };
    }

    afterAll(async function () {
      // @ts-expect-error "property must be optional"
      delete URL.createObjectURL;
      // @ts-expect-error "property must be optional"
      delete URL.revokeObjectURL;
    });

    beforeEach(function () {
      // Flow doesn't know sha1 is a jest mock.
      (sha1 as any).mockImplementation((_data: Uint8Array) =>
        Promise.resolve(hash)
      );
      // Flow doesn't know shortenUrl is a jest mock.
      (shortenUrl as any).mockImplementation(() =>
        Promise.resolve('https://profiler.firefox.com/')
      );
      // jsdom does not have URL.createObjectURL.
      // See https://github.com/jsdom/jsdom/issues/1721
      (URL as any).createObjectURL = () => 'mockCreateObjectUrl';
      (URL as any).revokeObjectURL = () => {};
    });

    it('matches the snapshot for the closed state', () => {
      const { profile } = createSimpleProfile();
      const { container } = setupForPublish(profile);
      expect(container).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a nightly profile', async () => {
      const { profile } = createSimpleProfile('nightly');
      const { getPanel, openDownloadPanel } = setupForPublish(profile);
      await openDownloadPanel();
      await screen.findByRole('link', { name: /Save/ });
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the opened panel for a release profile', async () => {
      const { profile } = createSimpleProfile('release');
      const { getPanel, openDownloadPanel } = setupForPublish(profile);
      await openDownloadPanel();
      await screen.findByRole('link', { name: /Save/ });
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the opened share panel', async () => {
      const { profile } = createSimpleProfile('release');
      const { getPanel, openPublishPanel } = setupForPublish(profile);
      await openPublishPanel();
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for the menu buttons and the opened panel for an already uploaded profile', async () => {
      const { profile } = createSimpleProfile();
      const { getPanel, container, navigateToHash, openDownloadPanel } =
        setupForPublish(profile);
      navigateToHash('VALID_HASH');
      expect(container).toMatchSnapshot();
      await openDownloadPanel();
      await screen.findByRole('link', { name: /Save/ });
      expect(getPanel()).toMatchSnapshot();
    });

    describe.each(['save', 'share'] as const)('%s panel', (panel) => {
      it.each([
        ['/from-browser', true],
        ['/from-post-message', true],
        ['/unpublished', true],
        ['/from-file', false],
        ['/from-url/https%3A%2F%2Fexample.com%2Fprofile.json', false],
        ['/from-url/http%3A%2F%2Flocalhost%2Fprofile.json', false],
        ['/public/VALID_HASH', false],
      ] as const)(
        'shows the in-memory notice for %s: %s',
        async (pathname, shouldShowNotice) => {
          const { dispatch, openDownloadPanel, openPublishPanel } =
            setupForPublish();
          act(() => {
            dispatch(
              updateUrlState(
                stateFromLocation({ pathname, search: '', hash: '' })
              )
            );
          });
          await (panel === 'save' ? openDownloadPanel() : openPublishPanel());
          const notice = screen.queryByText(
            /This profile hasn’t been uploaded and will be lost when you close this tab/
          );
          expect(notice !== null).toBe(shouldShowNotice);
        }
      );
    });

    it('shows the Include preference values checkbox when a PreferenceRead marker is in the profile', async () => {
      const { profile } = createPreferenceReadProfile('release');
      const { queryPreferenceCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryPreferenceCheckbox()).toBeTruthy();
    });

    it('does not show the Include preference values checkbox when a PreferenceRead marker is in the profile', async () => {
      const { profile } = createSimpleProfile('release');
      const { queryPreferenceCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryPreferenceCheckbox()).toBeFalsy();
    });

    it('Unchecks the Include Browsing Data checkbox in nightly when some private browsing data is in the profile', async () => {
      const { profile } = createSimpleProfile();
      const { firstTabTabID } = addTabInformationToProfile(profile);
      markTabIdsAsPrivateBrowsing(profile, [firstTabTabID]);

      const { getPrivateBrowsingCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();

      const privateBrowsingCheckbox = getPrivateBrowsingCheckbox();
      expect(privateBrowsingCheckbox).toBeInTheDocument();
      expect(privateBrowsingCheckbox).not.toBeChecked();
    });

    it('Unchecks the Include Browsing Data checkbox in release when some private browsing data is in the profile', async () => {
      const { profile } = createSimpleProfile('release');
      const { firstTabTabID } = addTabInformationToProfile(profile);
      markTabIdsAsPrivateBrowsing(profile, [firstTabTabID]);

      const { getPrivateBrowsingCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();

      const privateBrowsingCheckbox = getPrivateBrowsingCheckbox();
      expect(privateBrowsingCheckbox).toBeInTheDocument();
      expect(privateBrowsingCheckbox).not.toBeChecked();
    });

    it('does not show the Include Browsing Data checkbox when no private browsing data is in the profile', async () => {
      const { profile } = createSimpleProfile();
      const { queryPrivateBrowsingCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryPrivateBrowsingCheckbox()).not.toBeInTheDocument();
    });

    it('shows the argument values checkbox when the JS tracer recorded them', async () => {
      const { profile } = createArgumentValuesProfile();
      const { queryArgumentValuesCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();

      const argumentValuesCheckbox = queryArgumentValuesCheckbox();
      expect(argumentValuesCheckbox).toBeInTheDocument();
      // The values may contain PII, so sharing them has to be opt-in, and the
      // checkbox carries a warning icon saying why.
      expect(argumentValuesCheckbox).not.toBeChecked();
      expect(
        screen.getByTitle(/may include personal data/)
      ).toBeInTheDocument();
    });

    it('does not show the argument values checkbox when the profile has none', async () => {
      const { profile } = createSimpleProfile();
      const { queryArgumentValuesCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryArgumentValuesCheckbox()).not.toBeInTheDocument();
    });

    it('does not show the argument values checkbox for an empty argumentValues column', async () => {
      const { profile } = createEmptyArgumentValuesProfile();
      const { queryArgumentValuesCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryArgumentValuesCheckbox()).not.toBeInTheDocument();
    });

    it('does not show the argument values checkbox in nightly either', async () => {
      // Nightly starts from the mostly-non-sanitizing defaults, so this guards
      // against the checkbox appearing through that path.
      const { profile } = createEmptyArgumentValuesProfile('nightly');
      const { queryArgumentValuesCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(queryArgumentValuesCheckbox()).not.toBeInTheDocument();
    });

    it('keeps the file picker out of the way until the option is on', async () => {
      const { profile } = createSourceCodeProfile();
      const {
        querySourceCodeCheckbox,
        getSourceFileTreeLabels,
        querySourcePresets,
        openPublishPanel,
      } = setupForPublish(profile);
      await openPublishPanel();

      const sourceCodeCheckbox = querySourceCodeCheckbox();
      expect(sourceCodeCheckbox).toBeInTheDocument();
      // Nothing is open in the source view, so the option starts unchecked.
      expect(sourceCodeCheckbox).not.toBeChecked();

      // There is nothing to configure yet, so no tree and no presets. The row
      // still says how much source code is on offer.
      expect(getSourceFileTreeLabels()).toEqual([]);
      expect(querySourcePresets()).not.toBeInTheDocument();
      expect(
        screen.getByText('(2 files available, 45 B)', {
          // Fluent wraps variables in the isolation characters \u2068 and \u2069.
          normalizer: (text) => text.replace(/[\u2068\u2069]/g, '').trim(),
        })
      ).toBeInTheDocument();
    });

    it('shows the file tree once the option is on', async () => {
      const { profile } = createSourceCodeProfile();
      const {
        getSourceFileTreeLabels,
        getSourceCodeSummary,
        enableSourceCode,
        openPublishPanel,
      } = setupForPublish(profile);
      await openPublishPanel();
      enableSourceCode();

      // The two files branch off at moz/, and the single-child chains above and
      // below that are collapsed into one row each.
      expect(getSourceFileTreeLabels()).toEqual([
        'home/user/moz',
        'dom/base/nsDocument.cpp',
        'gfx/nsFoo.cpp',
      ]);
      // Only one thread and no source view, so the narrowest thing on offer is
      // every file.
      expect(getSourceCodeSummary()).toBe('2 files, 45 B uncompressed.');
    });

    it('turns the option back off without remembering the picked files', async () => {
      const { profile } = createSourceCodeProfile();
      const {
        querySourceCodeCheckbox,
        getSourceFileTreeLabels,
        enableSourceCode,
        openPublishPanel,
      } = setupForPublish(profile);
      await openPublishPanel();

      enableSourceCode();
      expect(querySourceCodeCheckbox()).toBeChecked();

      enableSourceCode();
      expect(querySourceCodeCheckbox()).not.toBeChecked();
      expect(getSourceFileTreeLabels()).toEqual([]);
    });

    it('does not show the source code checkbox when there is no source code', async () => {
      const { profile } = createSimpleProfile();
      const { querySourceCodeCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(querySourceCodeCheckbox()).not.toBeInTheDocument();
    });

    it('does not check the source code checkbox in nightly either', async () => {
      // Nightly starts from the mostly-non-sanitizing defaults, so this guards
      // against the source code being shared without the user asking for it.
      const { profile } = createSourceCodeProfile('nightly');
      const { querySourceCodeCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      expect(querySourceCodeCheckbox()).not.toBeChecked();
    });

    it('lets the user pick single files or whole directories', async () => {
      const { profile } = createSourceCodeProfile();
      const {
        getSourceTreeCheckbox,
        getSourceCodeSummary,
        enableSourceCode,
        openPublishPanel,
      } = setupForPublish(profile);
      await openPublishPanel();
      enableSourceCode();

      fireFullClick(getSourceTreeCheckbox(LOCAL_SOURCE_FILE));
      expect(getSourceCodeSummary()).toBe('1 file, 20 B uncompressed.');
      // One of the directory's two files is picked, so its row is in between.
      const directoryCheckbox = getSourceTreeCheckbox(
        'home/user/moz'
      ) as HTMLInputElement;
      expect(directoryCheckbox).not.toBeChecked();
      expect(directoryCheckbox.indeterminate).toBe(true);

      // Clicking the half-picked directory row takes everything below it.
      fireFullClick(directoryCheckbox);
      expect(getSourceCodeSummary()).toBe('2 files, 45 B uncompressed.');
      expect(getSourceTreeCheckbox(LOCAL_SOURCE_FILE)).toBeChecked();
    });

    it('lists files that have not been downloaded, without letting the user pick them', async () => {
      const { profile } = createPartlyDownloadedSourceCodeProfile();
      const {
        dispatch,
        getState,
        getSourceTreeCheckbox,
        getSourceFileTreeLabels,
        getSourceFileSizes,
        getSourceCodeSummaryLines,
        enableSourceCode,
        openPublishPanel,
      } = setupForPublish(profile);
      await openPublishPanel();
      expect(
        screen.getByText('(1 of 4 files downloaded, 25 B)', {
          normalizer: (text) => text.replace(/[\u2068\u2069]/g, '').trim(),
        })
      ).toBeInTheDocument();
      enableSourceCode();

      // The directory with the downloaded file comes first and is unfolded,
      // even though opt/lib has more samples. opt/lib has nothing to pick, so
      // it stays folded and its files aren't rendered.
      expect(getSourceFileTreeLabels()).toEqual([
        'home/user/moz',
        'dom/base/nsDocument.cpp',
        'gfx/nsFoo.cpp',
        'opt/lib',
      ]);
      // Without a browser connection nothing can fetch these files.
      const missingCheckbox = getSourceTreeCheckbox(OTHER_SOURCE_FILE);
      expect(missingCheckbox).toBeDisabled();
      expect(getSourceTreeCheckbox('opt/lib')).toBeDisabled();
      expect(getSourceFileSizes()).toEqual([
        '25 B',
        '25 B',
        'Unavailable',
        'Unavailable',
      ]);
      expect(getSourceCodeSummaryLines()).toEqual([
        '1 file, 25 B uncompressed.',
      ]);

      // Opening the file in the source view downloads it.
      act(() => {
        dispatch(
          finishLoadingSourceCode(
            1,
            'void nsFoo::Bar() {}',
            'LOCAL',
            getSourceCodeCacheGeneration(getState())
          )
        );
      });
      expect(missingCheckbox).toBeEnabled();
      expect(getSourceFileSizes()).toEqual([
        '45 B',
        '25 B',
        '20 B',
        'Unavailable',
      ]);
      expect(getSourceCodeSummaryLines()).toEqual([
        '1 file, 25 B uncompressed.',
      ]);
    });

    it('downloads picked files from the browser on request', async () => {
      const { profile } = createPartlyDownloadedSourceCodeProfile();
      // The browser knows the second file as a JS source.
      profile.shared.sources.id[1] = 'ff6d24c3-b8f5-45cd-a7d3-b643b3292e41';
      const getJSSource = jest.fn(async () => 'void nsFoo::Bar() {}');
      const browserConnection = {
        getJSSource,
        querySymbolicationApi: async () => {
          throw new Error('No source for this address');
        },
      } as unknown as BrowserConnection;
      const {
        dispatch,
        getSourceTreeCheckbox,
        getSourceFileSizes,
        getSourceCodeSummaryLines,
        enableSourceCode,
        openPublishPanel,
      } = setupForPublish(profile);
      act(() => {
        dispatch(
          updateBrowserConnectionStatus({
            status: 'ESTABLISHED',
            browserConnection,
          })
        );
      });
      await openPublishPanel();
      enableSourceCode();

      // Only the file the browser can serve is pickable.
      const fetchableCheckbox = getSourceTreeCheckbox(OTHER_SOURCE_FILE);
      expect(fetchableCheckbox).toBeEnabled();
      expect(getSourceTreeCheckbox('opt/lib')).toBeDisabled();
      expect(getSourceFileSizes()).toEqual([
        '25 B',
        '25 B',
        'Not downloaded',
        'Unavailable',
      ]);

      // Turning the option on picked every pickable file, this one included.
      expect(fetchableCheckbox).toBeChecked();
      expect(getSourceCodeSummaryLines()).toEqual([
        '1 file, 25 B uncompressed.',
        '1 file will be downloaded when sharing.',
      ]);

      fireFullClick(screen.getByText('Download now'));
      await screen.findByText('20 B');
      expect(getJSSource).toHaveBeenCalledWith(
        'ff6d24c3-b8f5-45cd-a7d3-b643b3292e41'
      );
      expect(getSourceFileSizes()).toEqual([
        '45 B',
        '25 B',
        '20 B',
        'Unavailable',
      ]);
      expect(getSourceCodeSummaryLines()).toEqual([
        '2 files, 45 B uncompressed.',
      ]);
    });

    it('says why the upload stopped when a picked file cannot be downloaded', async () => {
      const { profile } = createPartlyDownloadedSourceCodeProfile();
      profile.shared.sources.id[1] = 'ff6d24c3-b8f5-45cd-a7d3-b643b3292e41';
      const browserConnection = {
        getJSSource: async () => {
          throw new Error('No such source');
        },
        querySymbolicationApi: async () => {
          throw new Error('No source for this address');
        },
      } as unknown as BrowserConnection;
      const { dispatch, getPanelForm, enableSourceCode, openPublishPanel } =
        setupForPublish(profile);
      act(() => {
        dispatch(
          updateBrowserConnectionStatus({
            status: 'ESTABLISHED',
            browserConnection,
          })
        );
      });
      await openPublishPanel();
      enableSourceCode();
      fireEvent.submit(getPanelForm());

      fireFullClick(await screen.findByText('Error uploading'));
      expect(
        await screen.findByText(
          /of the picked source files could not be downloaded. It has been left out/
        )
      ).toBeInTheDocument();
    });

    it('disables the option until at least one file has been downloaded', async () => {
      const { profile } = createSourceCodeProfile();
      profile.shared.sources.content[0] = null;
      profile.shared.sources.content[1] = null;
      const { querySourceCodeCheckbox, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();

      expect(querySourceCodeCheckbox()).toBeDisabled();
      expect(
        screen.getByText('(2 files, none downloaded yet)', {
          normalizer: (text) => text.replace(/[\u2068\u2069]/g, '').trim(),
        })
      ).toBeInTheDocument();
    });

    it('warns about the distribution rights when uploading', async () => {
      const { profile } = createSourceCodeProfile();
      const { enableSourceCode, openPublishPanel } = setupForPublish(profile);
      await openPublishPanel();
      enableSourceCode();
      expect(
        screen.getByText(/Only include code you have the right to share/)
      ).toBeInTheDocument();
    });

    it('does not bring up the distribution rights when saving to disk', async () => {
      const { profile } = createSourceCodeProfile();
      const { enableSourceCode, openDownloadPanel } = setupForPublish(profile);
      await openDownloadPanel();
      enableSourceCode();
      expect(
        screen.queryByText(/Only include code you have the right to share/)
      ).not.toBeInTheDocument();
    });

    it('shows the size of every row in the file tree', async () => {
      const { profile } = createSourceCodeProfile();
      const { getSourceFileSizes, enableSourceCode, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      enableSourceCode();

      // The directory row adds up its two files, 25 B and 20 B.
      expect(getSourceFileSizes()).toEqual(['45 B', '25 B', '20 B']);
    });

    it('does not offer presets when there is only one thing to pick', async () => {
      // One thread, source view closed: "current file" picks nothing and
      // "selected threads" picks the same files as "all files", so the only
      // option left is "all files" and the row would be pointless.
      const { profile } = createSourceCodeProfile();
      const { querySourcePresets, enableSourceCode, openPublishPanel } =
        setupForPublish(profile);
      await openPublishPanel();
      enableSourceCode();
      expect(querySourcePresets()).not.toBeInTheDocument();
    });

    it('offers a preset for the selected threads when it narrows things down', async () => {
      const { profile } = createTwoThreadSourceCodeProfile();
      const {
        getSourcePresetLabels,
        getCheckedSourcePreset,
        getSourceCodeSummary,
        selectThread,
        enableSourceCode,
        openPublishPanel,
      } = setupForPublish(profile);
      // Thread 1 only runs code from one of the two files, so scoping to it is
      // a real narrowing. Thread 0 runs code from both, which would make the
      // preset the same as "All available files".
      selectThread(1);
      await openPublishPanel();
      enableSourceCode();

      expect(getSourcePresetLabels()).toEqual([
        'Selected threads',
        'All available files',
      ]);
      // Turning the option on starts from the narrowest thing on offer, which
      // here is the selected thread's one file rather than both files.
      expect(getCheckedSourcePreset()).toBe('Selected threads');
      expect(getSourceCodeSummary()).toBe('1 file, 20 B uncompressed.');
    });

    it('starts from the file the source view is showing when there is one', async () => {
      const { profile } = createTwoThreadSourceCodeProfile();
      const {
        openSourceView,
        querySourceCodeCheckbox,
        getSourcePresetLabels,
        getCheckedSourcePreset,
        getSourceCodeSummary,
        selectThread,
        openPublishPanel,
      } = setupForPublish(profile);
      selectThread(1);
      openSourceView(0);
      await openPublishPanel();

      // Having a file open in the source view is enough to start out sharing
      // it, so the option is already on.
      expect(querySourceCodeCheckbox()).toBeChecked();
      expect(getSourcePresetLabels()).toEqual([
        'Current file',
        'Selected threads',
        'All available files',
      ]);
      // The current file wins over the selected thread's files, which is the
      // narrower of the two.
      expect(getCheckedSourcePreset()).toBe('Current file');
      expect(getSourceCodeSummary()).toBe('1 file, 25 B uncompressed.');
    });

    it('keeps the picked preset checked when another one selects the same files', async () => {
      const { profile } = createTwoThreadSourceCodeProfile();
      const {
        openSourceView,
        getSourcePresetRadio,
        getCheckedSourcePreset,
        getSourceTreeCheckbox,
        selectThread,
        openPublishPanel,
      } = setupForPublish(profile);
      // Thread 1 only runs code from the second file, which is also the one
      // open in the source view.
      selectThread(1);
      openSourceView(1);
      await openPublishPanel();
      expect(getCheckedSourcePreset()).toBe('Current file');

      fireFullClick(getSourcePresetRadio('Selected threads'));
      expect(getCheckedSourcePreset()).toBe('Selected threads');

      // Editing the tree forgets the picked preset, even when it ends up with
      // the same files.
      const otherFileCheckbox = getSourceTreeCheckbox(LOCAL_SOURCE_FILE);
      fireFullClick(otherFileCheckbox);
      fireFullClick(otherFileCheckbox);
      expect(getCheckedSourcePreset()).toBe('Current file');
    });

    it('falls back to Custom once the tree no longer matches a preset', async () => {
      const { profile } = createTwoThreadSourceCodeProfile();
      const {
        getSourcePresetRadio,
        getCheckedSourcePreset,
        getSourceTreeCheckbox,
        selectThread,
        enableSourceCode,
        openPublishPanel,
      } = setupForPublish(profile);
      selectThread(1);
      await openPublishPanel();
      enableSourceCode();

      fireFullClick(getSourcePresetRadio('All available files'));
      expect(getCheckedSourcePreset()).toBe('All available files');

      // Dropping thread 1's file leaves a selection that no preset stands for.
      // Dropping the other one would land back on "Selected threads".
      fireFullClick(getSourceTreeCheckbox(OTHER_SOURCE_FILE));
      expect(getCheckedSourcePreset()).toBe('Custom');

      // Picking a preset again gets back out of the custom state.
      fireFullClick(getSourcePresetRadio('All available files'));
      expect(getCheckedSourcePreset()).toBe('All available files');
    });

    it('says how many files do not need sharing because they are public', async () => {
      const PUBLIC_FILE =
        'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28';
      const { profile } = getProfileFromTextSamples(`
        A[file:${LOCAL_SOURCE_FILE}]
        B[file:${PUBLIC_FILE}]
      `);
      profile.meta.updateChannel = 'release';
      profile.shared.sources.content[0] = 'void nsDocument::Foo() {}';
      profile.shared.sources.content[1] = 'nsAppShell contents';

      const {
        getSourceFileTreeLabels,
        getSourceCodeSummaryLines,
        getSourceCodeLeftOutInfo,
        enableSourceCode,
        openPublishPanel,
      } = setupForPublish(profile);
      await openPublishPanel();
      enableSourceCode();

      // The public file isn't offered, and the panel says so rather than
      // leaving its absence unexplained.
      expect(getSourceFileTreeLabels()).toEqual([
        'home/user/moz/dom/base/nsDocument.cpp',
      ]);
      expect(getSourceCodeSummaryLines()).toEqual([
        '1 file, 25 B uncompressed.',
      ]);
      expect(getSourceCodeLeftOutInfo()).toBe(
        '1 file is available on the web and isn’t included.'
      );
    });

    it('can publish and revert', async () => {
      const { openPublishPanel, getPanelForm, resolveUpload, getState } =
        setupForPublish();
      await openPublishPanel();
      fireEvent.submit(getPanelForm());
      resolveUpload('SOME_HASH');

      const revertButton = await screen.findByText(/revert/i);
      expect(getDataSource(getState())).toBe('public');
      expect(getHash(getState())).toBe('SOME_HASH');
      expect(document.body).toMatchSnapshot();

      fireFullClick(revertButton);
      await waitForElementToBeRemoved(revertButton);

      expect(getDataSource(getState())).toBe('from-browser');
      expect(getHash(getState())).toBe('');
    });

    it('can publish, cancel, and then publish again', async () => {
      const {
        getPanel,
        getPublishButton,
        findPublishButton,
        getCancelButton,
        getPanelForm,
        openPublishPanel,
      } = setupForPublish();
      await openPublishPanel();
      fireEvent.submit(getPanelForm());

      // These shouldn't exist anymore.
      expect(() => getPanel()).toThrow();
      expect(() => getPublishButton()).toThrow();

      fireFullClick(getCancelButton());

      // This might be asynchronous, depending on the underlying code.
      expect(await findPublishButton()).toBeTruthy();
    });

    it('matches the snapshot for an upload error', async () => {
      const { getPanel, getPanelForm, rejectUpload, openPublishPanel } =
        setupForPublish();

      await openPublishPanel();
      fireEvent.submit(getPanelForm());
      rejectUpload('This is a mock error');

      // Wait until the error button is visible.
      const errorButton = await screen.findByText('Error uploading');

      // Now click the error button, and get a snapshot of the panel.
      fireFullClick(errorButton);
      await screen.findByText(/something went wrong/);
      expect(getPanel()).toMatchSnapshot();
    });

    it('matches the snapshot for a compression error', async () => {
      const { compress } = require('firefox-profiler/utils/gz');
      compress.mockRejectedValue(new Error('Compression error'));
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getPanel, openPublishPanel } = setupForPublish();

      await openPublishPanel();
      expect(
        await screen.findByText(/Error while compressing/)
      ).toBeInTheDocument();
      expect(console.error).toHaveBeenCalledWith(
        'Error while compressing the profile data',
        expect.any(Error)
      );
      expect(getPanel()).toMatchSnapshot();
    });

    it('keeps Save available but locks the options while uploading', async () => {
      const { openPublishPanel, getPanelForm, openDownloadPanel } =
        setupForPublish();
      await openPublishPanel();
      fireEvent.submit(getPanelForm());

      // The Save button stays in the toolbar while the upload is running.
      await openDownloadPanel();
      expect(
        screen.getByRole('checkbox', { name: /Include hidden threads/ })
      ).toBeDisabled();
    });
  });

  describe('<MetaInfoPanel>', function () {
    async function setupForMetaInfoPanel(profile: Profile) {
      jest.spyOn(Date.prototype, 'toLocaleString').mockImplementation(function (
        this: Date
      ) {
        return 'toLocaleString ' + this.toUTCString();
      });

      const store = blankStore();

      // Note that we dispatch this action directly instead of using viewProfile
      // or loadProfile because we want to control tightly how symbolication is
      // started in these tests.
      await store.dispatch(loadProfile(profile, { skipSymbolication: true }));

      const setupResult = setup(store);

      async function displayMetaInfoPanel() {
        fireFullClick(screen.getByText('Profile Info'));
        await screen.findByText('Profile Information');
      }

      function getMetaInfoPanel() {
        return document.querySelector('.metaInfoPanel');
      }

      return {
        ...setupResult,
        getMetaInfoPanel,
        displayMetaInfoPanel,
      };
    }

    it('matches the snapshot', async () => {
      // Using gecko profile because it has metadata and profilerOverhead data in it.
      const profile = processGeckoProfile(createGeckoProfile());
      profile.meta.configuration = {
        features: ['js', 'threads'],
        threads: ['GeckoMain', 'DOM Worker'],
        // The capacity is expressed in entries, where 1 entry == 8 bytes.
        // 128M entries is 1GB.
        capacity: 128 * 1024 * 1024,
        duration: 20,
      };

      const { displayMetaInfoPanel, getMetaInfoPanel } =
        await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();
      const renderedCapacity = ensureExists(
        screen.getByText(/Buffer capacity/).nextSibling
      );

      /* This rule needs to be disabled because `renderedCapacity` is a text
       * code, and this triggers
       * https://github.com/testing-library/jest-dom/issues/306 */
      /* eslint-disable-next-line jest-dom/prefer-to-have-text-content */
      expect(renderedCapacity.textContent).toBe('1GB');
      expect(getMetaInfoPanel()).toMatchSnapshot();
    });

    it('matches the snapshot with device information', async () => {
      // Using gecko profile because it has metadata and profilerOverhead data in it.
      const profile = processGeckoProfile(createGeckoProfile());
      profile.meta.device = 'Android Device';

      const { displayMetaInfoPanel, getMetaInfoPanel } =
        await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();

      const renderedDevice = ensureExists(
        screen.getByText(/Device:/).nextSibling
      );

      /* This rule needs to be disabled because `renderedDevice` is a text
       * code, and this triggers
       * https://github.com/testing-library/jest-dom/issues/306 */
      /* eslint-disable-next-line jest-dom/prefer-to-have-text-content */
      expect(renderedDevice.textContent).toBe('Android Device');
      expect(getMetaInfoPanel()).toMatchSnapshot();
    });

    it('matches the snapshot with uptime', async () => {
      // Using gecko profile because it has metadata and profilerOverhead data in it.
      const profile = processGeckoProfile(createGeckoProfile());
      // The profiler was started 500ms after the parent process.
      profile.meta.profilingStartTime = 500;

      const { displayMetaInfoPanel, getMetaInfoPanel } =
        await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();

      const uptime = ensureExists(screen.getByText(/Uptime:/).nextSibling);
      expect(uptime).toHaveTextContent('500ms');
      expect(getMetaInfoPanel()).toMatchSnapshot();
    });

    it('with no statistics object should not make the app crash', async () => {
      // Using gecko profile because it has metadata and profilerOverhead data in it.
      const profile = processGeckoProfile(createGeckoProfile());
      // We are removing statistics objects from all overhead objects to test
      // the robustness of our handling code.
      if (profile.profilerOverhead) {
        for (const overhead of profile.profilerOverhead) {
          delete overhead.statistics;
        }
      }

      const { displayMetaInfoPanel, getMetaInfoPanel } =
        await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();
      expect(getMetaInfoPanel()).toMatchSnapshot();
    });

    it('with no extra info there is no more info button', async () => {
      const { profile } = getProfileFromTextSamples('A');
      const { displayMetaInfoPanel } = await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();

      expect(screen.queryByText('Show more')).not.toBeInTheDocument();
    });

    it('with more extra info, opens more info section if clicked', async () => {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.extra = [
        {
          label: 'CPU',
          entries: [
            {
              label: 'CPU 1',
              format: 'string',
              value: 'Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz',
            },
          ],
        },
        {
          label: 'Memory',
          entries: [],
        },
        {
          label: 'Hard Drives',
          entries: [
            {
              label: 'SSD',
              format: 'string',
              value: 'Samsung SSD 850 EVO 500GB',
            },
            {
              label: 'HDD',
              format: 'string',
              value: 'Seagate ST1000LM035-1RK172',
            },
          ],
        },
      ];

      const { displayMetaInfoPanel } = await setupForMetaInfoPanel(profile);
      await displayMetaInfoPanel();

      const summary = screen.getByText('Show more');
      fireFullClick(summary);
      const moreInfoPart = document.querySelector('.moreInfoPart');
      expect(moreInfoPart).toMatchSnapshot();
    });

    it('Does display a link for the build if there is a URL', async () => {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.sourceURL =
        'https://hg.mozilla.org/mozilla-central/rev/6be6a06991d7a2123d4b51f4ce384c6bce92f859';
      const buildID = '20250402094810';
      profile.meta.appBuildID = buildID;

      const unserializedProfile =
        await unserializeProfileOfArbitraryFormat(profile);
      const { displayMetaInfoPanel } =
        await setupForMetaInfoPanel(unserializedProfile);
      await displayMetaInfoPanel();

      const buildIdElement = ensureExists(
        screen.getByText(/Build ID:/).nextSibling
      );
      expect(buildIdElement).toBeInstanceOf(HTMLAnchorElement);
      expect(buildIdElement).toHaveTextContent(buildID);
      expect((buildIdElement as any).href).toBe(profile.meta.sourceURL);
    });

    it('does not display a link for the build ID if there is no URL', async () => {
      const { profile } = getProfileFromTextSamples('A');
      profile.meta.sourceURL = 'unknown';
      const buildID = '20250402094810';
      profile.meta.appBuildID = buildID;
      const unserializedProfile =
        await unserializeProfileOfArbitraryFormat(profile);
      const { displayMetaInfoPanel } =
        await setupForMetaInfoPanel(unserializedProfile);
      await displayMetaInfoPanel();

      const buildIdElement = ensureExists(
        screen.getByText(/Build ID:/).nextSibling
      );
      expect(buildIdElement).toBeInstanceOf(Text);
      expect(buildIdElement).toHaveTextContent(buildID);
    });

    describe('deleting a profile', () => {
      const FAKE_HASH = 'FAKE_HASH';
      const FAKE_PROFILE_DATA = {
        profileToken: FAKE_HASH,
        jwtToken: null,
        publishedDate: new Date('4 Jul 2020 13:00 GMT'),
        name: 'PROFILE',
        preset: null,
        meta: {
          product: 'Firefox',
          platform: 'Macintosh',
          toolkit: 'cocoa',
          misc: 'rv:62.0',
          oscpu: 'Intel Mac OS X 10.12',
        },
        urlPath: '/public/MACOSX/marker-chart/',
        publishedRange: { start: 2000, end: 40000 },
      };

      async function addUploadedProfileInformation(
        uploadedProfileInformationOverrides: Partial<UploadedProfileInformation> = {}
      ) {
        const uploadedProfileInformation = {
          ...FAKE_PROFILE_DATA,
          ...uploadedProfileInformationOverrides,
        };
        await persistUploadedProfileInformationToDb(uploadedProfileInformation);
      }

      async function setupForDeletion() {
        const { profile } = createSimpleProfile();
        const setupResult = await setupForMetaInfoPanel(profile);
        const { navigateToHash, displayMetaInfoPanel } = setupResult;
        navigateToHash(FAKE_HASH);
        await displayMetaInfoPanel();

        return setupResult;
      }

      test('does not display the delete button if the profile is public but without uploaded data', async () => {
        const { getMetaInfoPanel } = await setupForDeletion();
        // We wait a bit using the "find" flavor of the queries because this is
        // reached asynchronously.
        await expect(screen.findByText('Uploaded:')).rejects.toThrow();
        expect(screen.queryByText('Delete')).not.toBeInTheDocument();
        expect(getMetaInfoPanel()).toMatchSnapshot();
      });

      test('displays the delete button if we have the uploaded data but no JWT token', async () => {
        await addUploadedProfileInformation();
        const { getMetaInfoPanel } = await setupForDeletion();
        expect(await screen.findByText('Uploaded:')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeDisabled();
        expect(getMetaInfoPanel()).toMatchSnapshot();
      });

      test('displays the delete button if we have the uploaded data and some JWT token', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        const { getMetaInfoPanel } = await setupForDeletion();
        expect(await screen.findByText('Uploaded:')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeEnabled();
        expect(getMetaInfoPanel()).toMatchSnapshot();
      });

      test('clicking on the button shows the confirmation', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        const { getMetaInfoPanel } = await setupForDeletion();
        fireFullClick(await screen.findByText('Delete'));
        expect(screen.getByText(/are you sure/i)).toBeEnabled();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
        expect(getMetaInfoPanel()).toMatchSnapshot();
      });

      test('clicking on the "cancel" button will move back to the profile information', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        await setupForDeletion();
        fireFullClick(await screen.findByText('Delete'));

        // Canceling should move back to the previous
        fireFullClick(screen.getByText('Cancel'));

        // We're back at the profile information panel.
        expect(screen.getByText('Profile Information')).toBeInTheDocument();
      });

      test('dismissing the panel will move back to the profile information when opened again', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        const { displayMetaInfoPanel, waitForPanelToBeRemoved } =
          await setupForDeletion();
        fireFullClick(await screen.findByText('Delete'));

        // Dismissing by clicking elsewhere
        fireFullClick(ensureExists(document.body));
        await waitForPanelToBeRemoved();

        // We're back at the profile information panel if we open the panel again.
        await displayMetaInfoPanel();
        expect(screen.getByText('Profile Information')).toBeInTheDocument();
      });

      test('confirming the delete should delete on the server and in the db', async () => {
        await addUploadedProfileInformation({ jwtToken: 'FAKE_TOKEN' });
        const {
          getMetaInfoPanel,
          displayMetaInfoPanel,
          waitForPanelToBeRemoved,
        } = await setupForDeletion();
        fireFullClick(await screen.findByText('Delete'));
        fireFullClick(screen.getByText('Delete'));
        await screen.findByText(/successfully/i);
        // This has been deleted from the server.
        expect(deleteProfileOnServer).toHaveBeenCalledWith({
          profileToken: FAKE_HASH,
          jwtToken: 'FAKE_TOKEN',
        });
        // This has been deleted from the DB.
        expect(await retrieveUploadedProfileInformationFromDb(FAKE_HASH)).toBe(
          null
        );
        expect(getMetaInfoPanel()).toMatchSnapshot();

        // Dismissing the metainfo panel and displaying it again should show the
        // initial panel now.
        fireFullClick(ensureExists(document.body));
        await waitForPanelToBeRemoved();
        await displayMetaInfoPanel();
        expect(screen.getByText('Profile Information')).toBeInTheDocument();
        expect(screen.queryByText('Uploaded:')).not.toBeInTheDocument();
      });
    });

    describe('symbolication', function () {
      type SymbolicationTestConfig = Readonly<{
        symbolicated: boolean;
      }>;

      async function setupSymbolicationTest(config: SymbolicationTestConfig) {
        const { profile } = getProfileFromTextSamples('A');
        profile.meta.symbolicated = config.symbolicated;

        const setupResult = await setupForMetaInfoPanel(profile);
        await setupResult.displayMetaInfoPanel();
        return setupResult;
      }

      it('handles successfully symbolicated profiles', async () => {
        await setupSymbolicationTest({ symbolicated: true });

        expect(screen.getByText('Profile is symbolicated')).toBeInTheDocument();
        fireFullClick(screen.getByText('Re-symbolicate profile'));

        expect(symbolicateProfile).toHaveBeenCalled();
        expect(
          screen.getByText('Attempting to re-symbolicate profile')
        ).toBeInTheDocument();
        // No symbolicate button is available.
        expect(
          screen.queryByText('Symbolicate profile')
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText('Re-symbolicate profile')
        ).not.toBeInTheDocument();

        // After a while, we get a result
        expect(
          await screen.findByText('Profile is symbolicated')
        ).toBeInTheDocument();
        expect(screen.getByText('Re-symbolicate profile')).toBeInTheDocument();
      });

      it('handles the contradictory state of non-symbolicated profiles that are done', async () => {
        await setupSymbolicationTest({ symbolicated: false });

        expect(
          screen.getByText('Profile is not symbolicated')
        ).toBeInTheDocument();
        fireFullClick(screen.getByText('Symbolicate profile'));
        expect(symbolicateProfile).toHaveBeenCalled();

        expect(
          screen.getByText('Currently symbolicating profile')
        ).toBeInTheDocument();
        // No symbolicate button is available.
        expect(
          screen.queryByText('Symbolicate profile')
        ).not.toBeInTheDocument();
        expect(
          screen.queryByText('Re-symbolicate profile')
        ).not.toBeInTheDocument();

        // After a while, we get a result
        expect(
          await screen.findByText('Profile is symbolicated')
        ).toBeInTheDocument();
        expect(screen.getByText('Re-symbolicate profile')).toBeInTheDocument();
      });
    });
  });
});
