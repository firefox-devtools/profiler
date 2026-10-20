/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSelector } from 'reselect';
import clamp from 'clamp';

import {
  getProfile,
  getProfileRootRange,
  getCommittedRange,
  getGlobalTracks,
  getLocalTracksByPid,
  getHasPreferenceMarkers,
  getContainsPrivateBrowsingInformation,
  getHasJSTracingArgumentValues,
  getThreads,
  getMarkerSchemaByName,
  getSourceAddressProofs,
} from './profile';
import {
  sanitizePII,
  getShouldSanitizeByDefault as getShouldSanitizeByDefaultImpl,
  type SanitizeProfileResult,
} from '../profile-logic/sanitize';
import {
  buildSourceFileTree,
  computeFetchableSources,
  computePickableSources,
  computeSourceCodeSharingCandidates,
  computeSourceCodeSharingFiles,
  computeSourceCodeSharingStats,
  computeSourceCodeSharingSummary,
  computeSourceContentsForSharing,
  computeSourcesForThreads,
  computeStackToSource,
  setSharedSourceCode,
} from '../profile-logic/source-sharing';
import { getSourceCodeCache } from './code';
import { getBrowserConnection } from './app';
import { isLocalURL } from '../utils/url';
import { ensureExists } from '../utils/types';
import { formatNumber } from '../utils/format-numbers';
import {
  getHiddenGlobalTracks,
  getHiddenLocalTracksByPid,
  getIsBottomBoxOpen,
  getSelectedThreadIndexesOrNull,
  getSourceViewSourceIndex,
  getSymbolServerUrl,
} from './url-state';

import type {
  PublishState,
  UploadState,
  UploadPhase,
  State,
  Selector,
  DangerousSelectorWithArguments,
  CheckedSharingOptions,
  SharingMode,
  RemoveProfileInformation,
  DerivedMarkerInfo,
  ThreadIndex,
  CounterIndex,
  SanitizedProfileEncodingState,
  IndexIntoSourceTable,
  SourceCodeContents,
  SourceCodeFetchState,
  SourceCodeSharingCandidate,
  SourceCodeSharingFile,
  SourceCodeSharingStats,
  SourceCodeSharingSummary,
  SourceFileTreeNode,
  OfferedSourceSharingPreset,
  SourceSharingPreset,
  Profile,
} from 'firefox-profiler/types';
import { getThreadSelectors } from './per-thread';

export const getPublishState: Selector<PublishState> = (state) => state.publish;

/**
 * Build one memoized selector per sharing mode, so that the download and upload
 * panels don't evict each other's results.
 */
function _perSharingMode<T>(
  makeSelector: (mode: SharingMode) => Selector<T>
): DangerousSelectorWithArguments<T, SharingMode> {
  const selectors: Record<SharingMode, Selector<T>> = {
    download: makeSelector('download'),
    upload: makeSelector('upload'),
  };
  return (state, mode) => selectors[mode](state);
}

export const getCheckedSharingOptions: DangerousSelectorWithArguments<
  CheckedSharingOptions,
  SharingMode
> = (state, mode) => getPublishState(state).checkedSharingOptions[mode];

export const getFilenameString: Selector<string> = createSelector(
  getProfile,
  getProfileRootRange,
  (profile, rootRange) => {
    const { startTime, product } = profile.meta;

    // Pad single digit numbers with a 0.
    const pad = (x: number) => (x < 10 ? `0${x}` : `${x}`);

    // Compute the date string.
    const date = new Date(startTime + rootRange.start);
    const year = pad(date.getFullYear());
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const min = pad(date.getMinutes());
    const dateString = `${year}-${month}-${day} ${hour}.${min}`;

    // Return the final file name
    return `${product} ${dateString} profile.json`;
  }
);

const getSourceContentsForSharing: Selector<
  Map<IndexIntoSourceTable, SourceCodeContents>
> = createSelector(
  getProfile,
  getSourceCodeCache,
  computeSourceContentsForSharing
);

// Shared by the file list and the thread scoping, which both need it.
const getStackToSource: Selector<Int32Array> = createSelector(
  getProfile,
  computeStackToSource
);

const getSourceCodeSharingCandidates: Selector<SourceCodeSharingCandidate[]> =
  createSelector(
    getProfile,
    getStackToSource,
    computeSourceCodeSharingCandidates
  );

// The symbolication API is only asked for sources when it runs locally, since
// the public one doesn't have them.
const getHasLocalSymbolServer: Selector<boolean> = createSelector(
  getSymbolServerUrl,
  isLocalURL
);

const getFetchableSources: Selector<ReadonlySet<IndexIntoSourceTable>> =
  createSelector(
    getProfile,
    getSourceAddressProofs,
    (state: State) => getBrowserConnection(state) !== null,
    getHasLocalSymbolServer,
    computeFetchableSources
  );

const getFailedSources: Selector<ReadonlySet<IndexIntoSourceTable>> =
  createSelector(getSourceCodeCache, (cache) => {
    const failed = new Set<IndexIntoSourceTable>();
    for (const [sourceIndex, status] of cache) {
      if (status.type === 'ERROR') {
        failed.add(sourceIndex);
      }
    }
    return failed;
  });

export const getSourceCodeSharingFiles: Selector<SourceCodeSharingFile[]> =
  createSelector(
    getSourceCodeSharingCandidates,
    getSourceContentsForSharing,
    getFetchableSources,
    getFailedSources,
    computeSourceCodeSharingFiles
  );

// The files the user can pick: downloaded, or fetchable when sharing.
const getPickableSources: Selector<ReadonlySet<IndexIntoSourceTable>> =
  createSelector(getSourceCodeSharingFiles, computePickableSources);

export const getSourceCodeSharingStats: Selector<SourceCodeSharingStats> =
  createSelector(
    getSourceCodeSharingCandidates,
    getSourceCodeSharingFiles,
    computeSourceCodeSharingStats
  );

export const getHasSourceCodeToShare: Selector<boolean> = createSelector(
  getSourceCodeSharingFiles,
  (files) => files.length > 0
);

export const getSourceFilesForSelectedThreads: Selector<
  ReadonlySet<IndexIntoSourceTable>
> = createSelector(
  getProfile,
  // A navigation can replace the UrlState and drop the thread selection.
  getSelectedThreadIndexesOrNull,
  getStackToSource,
  getPickableSources,
  (profile, threadIndexes, stackToSource, pickableSources) =>
    threadIndexes === null
      ? new Set<IndexIntoSourceTable>()
      : computeSourcesForThreads(
          profile,
          threadIndexes,
          stackToSource,
          pickableSources
        )
);

export const getSourceFileTree: Selector<SourceFileTreeNode[]> = createSelector(
  getSourceCodeSharingFiles,
  buildSourceFileTree
);

// The "Current file" preset: the file in the source view, if it's pickable.
export const getSourceFilesForCurrentFile: Selector<
  ReadonlySet<IndexIntoSourceTable>
> = createSelector(
  getPickableSources,
  getSourceViewSourceIndex,
  (pickableSources, sourceViewSourceIndex) =>
    sourceViewSourceIndex !== null && pickableSources.has(sourceViewSourceIndex)
      ? new Set([sourceViewSourceIndex])
      : new Set<IndexIntoSourceTable>()
);

// The selection the panel starts from. The source view keeps its file after
// the bottom box is closed, so only start from it while it's still visible.
const _getDefaultSourceFilesToShare: Selector<
  ReadonlySet<IndexIntoSourceTable>
> = createSelector(
  getIsBottomBoxOpen,
  getSourceFilesForCurrentFile,
  (isBottomBoxOpen, currentFileSelection) =>
    isBottomBoxOpen ? currentFileSelection : new Set<IndexIntoSourceTable>()
);

export const getSourceFilesToShare: DangerousSelectorWithArguments<
  ReadonlySet<IndexIntoSourceTable>,
  SharingMode
> = _perSharingMode((mode) =>
  createSelector(
    (state: State) => getPublishState(state).sourceFileSelection[mode],
    getPickableSources,
    _getDefaultSourceFilesToShare,
    (storedSelection, pickableSources, defaultSelection) => {
      if (storedSelection === null) {
        return defaultSelection;
      }
      const selection = new Set<IndexIntoSourceTable>();
      for (const sourceIndex of storedSelection.sourceIndexes) {
        if (pickableSources.has(sourceIndex)) {
          selection.add(sourceIndex);
        }
      }
      return selection;
    }
  )
);

function _areSetsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

export const getSourceSharingDownloadedOnly: DangerousSelectorWithArguments<
  boolean,
  SharingMode
> = (state, mode) => getPublishState(state).sourceSharingDownloadedOnly[mode];

function _intersect<T>(
  a: ReadonlySet<T>,
  b: { has(value: T): boolean }
): Set<T> {
  const result = new Set<T>();
  for (const value of a) {
    if (b.has(value)) {
      result.add(value);
    }
  }
  return result;
}

// The files behind every preset, whether offered or not. With "downloaded
// only" on, each is narrowed to the files whose contents we already have.
const _getSourceFilesForPresets: DangerousSelectorWithArguments<
  Record<OfferedSourceSharingPreset, ReadonlySet<IndexIntoSourceTable>>,
  SharingMode
> = _perSharingMode((mode) =>
  createSelector(
    getSourceFilesForCurrentFile,
    getSourceFilesForSelectedThreads,
    getPickableSources,
    getSourceContentsForSharing,
    (state: State) => getSourceSharingDownloadedOnly(state, mode),
    (
      currentFile,
      selectedThreads,
      allFiles,
      contents,
      downloadedOnly
    ): Record<
      OfferedSourceSharingPreset,
      ReadonlySet<IndexIntoSourceTable>
    > => {
      if (!downloadedOnly) {
        return {
          'current-file': currentFile,
          'selected-threads': selectedThreads,
          'all-files': allFiles,
        };
      }
      return {
        'current-file': _intersect(currentFile, contents),
        'selected-threads': _intersect(selectedThreads, contents),
        'all-files': _intersect(allFiles, contents),
      };
    }
  )
);

/**
 * The ready-made selections that are worth offering, and their files,
 * narrowest first. A preset is left out when it would select nothing.
 * "Selected threads" is also left out when it selects every file.
 */
export const getSourceFilesForOfferedPresets: DangerousSelectorWithArguments<
  Map<OfferedSourceSharingPreset, ReadonlySet<IndexIntoSourceTable>>,
  SharingMode
> = _perSharingMode((mode) =>
  createSelector(
    (state: State) => _getSourceFilesForPresets(state, mode),
    (filesForPreset) => {
      const currentFile = filesForPreset['current-file'];
      const selectedThreads = filesForPreset['selected-threads'];
      const allFiles = filesForPreset['all-files'];
      const offered = new Map<
        OfferedSourceSharingPreset,
        ReadonlySet<IndexIntoSourceTable>
      >();
      if (currentFile.size > 0) {
        offered.set('current-file', currentFile);
      }
      if (
        selectedThreads.size > 0 &&
        !_areSetsEqual(selectedThreads, allFiles)
      ) {
        offered.set('selected-threads', selectedThreads);
      }
      if (allFiles.size > 0) {
        offered.set('all-files', allFiles);
      }
      return offered;
    }
  )
);

// The offered preset that the selection matches, or 'custom'.
export const getActiveSourceSharingPreset: DangerousSelectorWithArguments<
  SourceSharingPreset,
  SharingMode
> = _perSharingMode((mode) =>
  createSelector(
    (state: State) => getSourceFilesToShare(state, mode),
    (state: State) =>
      getPublishState(state).sourceFileSelection[mode]?.preset ?? null,
    (state: State) => getSourceFilesForOfferedPresets(state, mode),
    (selection, pickedPreset, filesForPresets): SourceSharingPreset => {
      // Several presets can select the same files, so the one the user picked
      // goes first. Otherwise the narrowest match wins, so that a one-file
      // profile reports "Current file" rather than "All available files".
      if (pickedPreset !== null) {
        const pickedFiles = filesForPresets.get(pickedPreset);
        if (
          pickedFiles !== undefined &&
          _areSetsEqual(selection, pickedFiles)
        ) {
          return pickedPreset;
        }
      }
      for (const [preset, files] of filesForPresets) {
        if (_areSetsEqual(selection, files)) {
          return preset;
        }
      }
      return 'custom';
    }
  )
);

export const getSourceCodeSharingSummary: DangerousSelectorWithArguments<
  SourceCodeSharingSummary,
  SharingMode
> = _perSharingMode((mode) =>
  createSelector(
    getSourceContentsForSharing,
    (state: State) => getSourceFilesToShare(state, mode),
    computeSourceCodeSharingSummary
  )
);

// The picked files whose contents we don't have yet. They get fetched when
// sharing, or when the user asks for it.
export const getSourceFilesToFetch: DangerousSelectorWithArguments<
  ReadonlySet<IndexIntoSourceTable>,
  SharingMode
> = _perSharingMode((mode) =>
  createSelector(
    (state: State) => getSourceFilesToShare(state, mode),
    getSourceContentsForSharing,
    (selection, contents) => {
      const toFetch = new Set<IndexIntoSourceTable>();
      for (const sourceIndex of selection) {
        if (!contents.has(sourceIndex)) {
          toFetch.add(sourceIndex);
        }
      }
      return toFetch;
    }
  )
);

export const getSourceCodeFetchState: Selector<SourceCodeFetchState> = (
  state
) => getPublishState(state).sourceCodeFetch;

export const getRemoveProfileInformation: DangerousSelectorWithArguments<
  RemoveProfileInformation | null,
  SharingMode
> = _perSharingMode((mode) =>
  createSelector(
    (state: State) => getCheckedSharingOptions(state, mode),
    getProfile,
    getCommittedRange,
    getHiddenGlobalTracks,
    getHiddenLocalTracksByPid,
    getGlobalTracks,
    getLocalTracksByPid,
    getHasPreferenceMarkers,
    getContainsPrivateBrowsingInformation,
    getHasJSTracingArgumentValues,
    (
      checkedSharingOptions,
      profile,
      committedRange,
      hiddenGlobalTracks,
      hiddenLocalTracksByPid,
      globalTracks,
      localTracksByPid,
      hasPreferenceMarkers,
      containsPrivateBrowsingInformation,
      hasArgumentValues
    ) => {
      let isIncludingEverything = true;
      for (const [prop, value] of Object.entries(checkedSharingOptions)) {
        // Do not include preference values, private browsing, or argument
        // values checkboxes if they're hidden. Even though
        // `includePreferenceValues` is not taken into account, it is false, if
        // the profile updateChannel is not nightly or custom build.
        if (prop === 'includePreferenceValues' && !hasPreferenceMarkers) {
          continue;
        }
        if (
          prop === 'includePrivateBrowsingData' &&
          !containsPrivateBrowsingInformation
        ) {
          continue;
        }
        if (prop === 'includeArgumentValues' && !hasArgumentValues) {
          continue;
        }
        isIncludingEverything = isIncludingEverything && value;
      }
      if (isIncludingEverything) {
        // No sanitization is happening, bail out early.
        return null;
      }

      // Find all of the thread indexes that are hidden.
      const shouldRemoveThreads = new Set<ThreadIndex>();
      const shouldRemoveCounters = new Set<CounterIndex>();
      if (!checkedSharingOptions.includeHiddenThreads) {
        for (const globalTrackIndex of hiddenGlobalTracks) {
          const globalTrack = globalTracks[globalTrackIndex];
          if (globalTrack.type === 'process') {
            if (globalTrack.mainThreadIndex !== null) {
              // This is a process thread that has been hidden.
              shouldRemoveThreads.add(globalTrack.mainThreadIndex);
            }

            // Also add all of the children threads, as they are hidden as well.
            const localTracks = ensureExists(
              localTracksByPid.get(globalTrack.pid),
              'Expected to be able to get a local track by PID.'
            );
            for (const localTrack of localTracks) {
              if (localTrack.type === 'thread') {
                shouldRemoveThreads.add(localTrack.threadIndex);
              }
            }
          }
        }

        // Add all of the local tracks that have been hidden.
        for (const [pid, hiddenLocalTrackIndexes] of hiddenLocalTracksByPid) {
          const localTracks = ensureExists(
            localTracksByPid.get(pid),
            'Expected to be able to get a local track by PID'
          );
          for (const hiddenLocalTrackIndex of hiddenLocalTrackIndexes) {
            const localTrack = localTracks[hiddenLocalTrackIndex];
            if (localTrack.type === 'thread') {
              shouldRemoveThreads.add(localTrack.threadIndex);
            } else if (
              'counterIndex' in localTrack &&
              typeof localTrack.counterIndex === 'number'
            ) {
              shouldRemoveCounters.add(localTrack.counterIndex);
            }
          }
        }
      }

      return {
        shouldFilterToCommittedRange: checkedSharingOptions.includeFullTimeRange
          ? null
          : committedRange,
        shouldRemoveUrls: !checkedSharingOptions.includeUrls,
        shouldRemoveThreadsWithScreenshots: new Set<ThreadIndex>(
          checkedSharingOptions.includeScreenshots
            ? []
            : profile.threads.map(
                (_: any, threadIndex: ThreadIndex) => threadIndex
              )
        ),
        shouldRemoveThreads,
        shouldRemoveCounters,
        shouldRemoveExtensions: !checkedSharingOptions.includeExtension,
        shouldRemovePreferenceValues:
          !checkedSharingOptions.includePreferenceValues,
        shouldRemovePrivateBrowsingData:
          !checkedSharingOptions.includePrivateBrowsingData,
        shouldRemoveArgumentValues:
          !checkedSharingOptions.includeArgumentValues,
      };
    }
  )
);

/**
 * The derived markers are needed for profile sanitization, but they are also
 * needed for each thread. This means that we can't use the createSelector
 * mechanism to properly memoize the component. We need access to the full state
 * and to the individual threads. This function therefore implements some simple
 * memoization behavior on the current list of threads.
 */
let _threads: any = null;
let _derivedMarkerInfo: DerivedMarkerInfo[] | null = null;
function getDerivedMarkerInfoForAllThreads(state: State): DerivedMarkerInfo[] {
  const threads = getThreads(state);
  if (_threads !== threads || _derivedMarkerInfo === null) {
    _threads = threads;
    _derivedMarkerInfo = getThreads(state).map(
      (_: any, threadIndex: ThreadIndex) =>
        getThreadSelectors(threadIndex).getDerivedMarkerInfo(state)
    );
  }
  return _derivedMarkerInfo;
}

/**
 * The traced values buffers are needed for profile sanitization when filtering
 * argument values to a time range. Similar memoization approach as above.
 */
let _threadsForBuffers: any = null;
let _tracedValuesBuffers: Array<ArrayBuffer | undefined> | null = null;
function getTracedValuesBuffersForAllThreads(
  state: State
): Array<ArrayBuffer | undefined> {
  const threads = getThreads(state);
  if (_threadsForBuffers !== threads || _tracedValuesBuffers === null) {
    _threadsForBuffers = threads;
    _tracedValuesBuffers = threads.map((_: any, threadIndex: ThreadIndex) =>
      getThreadSelectors(threadIndex).getTracedValuesBuffer(state)
    );
  }
  return _tracedValuesBuffers;
}

/**
 * The profile with only the picked source contents in it. This is kept out of
 * `sanitizePII` because it doesn't need reindexing, so it shouldn't turn an
 * unsanitized upload into a sanitized one.
 */
const _getProfileToShare: DangerousSelectorWithArguments<Profile, SharingMode> =
  _perSharingMode((mode) =>
    createSelector(
      getProfile,
      getSourceContentsForSharing,
      (state: State) => getSourceFilesToShare(state, mode),
      setSharedSourceCode
    )
  );

/**
 * Run the profile sanitization step, and also get information about how any
 * UrlState needs to be updated, with things like mapping thread indexes,
 * or providing a new committed range.
 */
export const getSanitizedProfile: DangerousSelectorWithArguments<
  SanitizeProfileResult,
  SharingMode
> = _perSharingMode((mode) =>
  createSelector(
    (state: State) => _getProfileToShare(state, mode),
    getDerivedMarkerInfoForAllThreads,
    getTracedValuesBuffersForAllThreads,
    (state: State) => getRemoveProfileInformation(state, mode),
    getMarkerSchemaByName,
    sanitizePII
  )
);

export const getSanitizedProfileEncodingState: Selector<
  SanitizedProfileEncodingState
> = (state) => getPublishState(state).sanitizedProfileEncodingState;

export const getUploadState: Selector<UploadState> = (state) =>
  getPublishState(state).upload;

export const getUploadPhase: Selector<UploadPhase> = (state) =>
  getUploadState(state).phase;

export const getUploadGeneration: Selector<number> = (state) =>
  getUploadState(state).generation;

export const getUploadProgress: Selector<number> = createSelector(
  getUploadState,
  ({ uploadProgress }) =>
    // Create a minimum value of 0.1 so that there is at least some user feedback
    // that the upload started, and a maximum value of 0.95 so that the user
    // doesn't wait with a full bar (there's still some work to do after the
    // uplod succeeds).
    clamp(uploadProgress, 0.1, 0.95)
);

export const getUploadError: Selector<Error | unknown> = (state) =>
  getUploadState(state).error;

export const getUploadProgressString: Selector<string> = createSelector(
  getUploadProgress,
  (progress) => formatNumber(progress, 0, 0, 'percent')
);

export const getAbortFunction: Selector<() => void> = (state) =>
  getUploadState(state).abortFunction;

export const getShouldSanitizeByDefault: Selector<boolean> = createSelector(
  getProfile,
  getShouldSanitizeByDefaultImpl
);

export const getPrePublishedState: Selector<null | State> = (state) =>
  getPublishState(state).prePublishedState;

export const getHasPrePublishedState: Selector<boolean> = (state) =>
  Boolean(getPrePublishedState(state));

export const getIsHidingStaleProfile: Selector<boolean> = (state) =>
  getPublishState(state).isHidingStaleProfile;

export const getHasSanitizedProfile: Selector<boolean> = (state) =>
  getPublishState(state).hasSanitizedProfile;
