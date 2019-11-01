/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type {
  Action,
  DataSource,
  PreviewSelection,
  ImplementationFilter,
  CallTreeSummaryStrategy,
  RequestedLib,
  TrackReference,
  TimelineType,
  CheckedSharingOptions,
} from './actions';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { StartEndRange } from './units';
import type { Profile, ThreadIndex, Pid } from './profile';

import type {
  CallNodePath,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
  MarkerIndex,
} from './profile-derived';
import type { Attempt } from '../utils/errors';
import type { TransformStacksPerThread } from './transforms';
import type JSZip from 'jszip';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { PathSet } from '../utils/path.js';

export type Reducer<T> = (T | void, Action) => T;

export type SymbolicationStatus = 'DONE' | 'SYMBOLICATING';
export type ThreadViewOptions = {|
  +selectedCallNodePath: CallNodePath,
  +rightClickedCallNodePath: CallNodePath | null,
  +expandedCallNodePaths: PathSet,
  +selectedMarker: MarkerIndex | null,
  +rightClickedMarker: MarkerIndex | null,
|};

export type RightClickedCallNodePath = {|
  +threadIndex: ThreadIndex,
  +callNodePath: CallNodePath,
|};

export type ProfileViewState = {|
  +viewOptions: {|
    perThread: ThreadViewOptions[],
    symbolicationStatus: SymbolicationStatus,
    waitingForLibs: Set<RequestedLib>,
    previewSelection: PreviewSelection,
    scrollToSelectionGeneration: number,
    focusCallTreeGeneration: number,
    rootRange: StartEndRange,
    rightClickedTrack: TrackReference | null,
    rightClickedCallNodePath: RightClickedCallNodePath | null,
  |},
  +globalTracks: GlobalTrack[],
  +localTracksByPid: Map<Pid, LocalTrack[]>,
  +profile: Profile | null,
|};

export type AppViewState =
  | {| +phase: 'ROUTE_NOT_FOUND' |}
  | {| +phase: 'TRANSITIONING_FROM_STALE_PROFILE' |}
  | {| +phase: 'PROFILE_LOADED' |}
  | {| +phase: 'DATA_LOADED' |}
  | {| +phase: 'FATAL_ERROR', +error: Error |}
  | {|
      +phase: 'INITIALIZING',
      +additionalData?: {| +attempt: Attempt | null, +message: string |},
    |};

export type Phase = $PropertyType<AppViewState, 'phase'>;

/**
 * This represents the finite state machine for loading zip files. The phase represents
 * where the state is now.
 */
export type ZipFileState =
  | {|
      +phase: 'NO_ZIP_FILE',
      +zip: null,
      +pathInZipFile: null,
    |}
  | {|
      +phase: 'LIST_FILES_IN_ZIP_FILE',
      +zip: JSZip,
      +pathInZipFile: null,
    |}
  | {|
      +phase: 'PROCESS_PROFILE_FROM_ZIP_FILE',
      +zip: JSZip,
      +pathInZipFile: string,
    |}
  | {|
      +phase: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE',
      +zip: JSZip,
      +pathInZipFile: string,
    |}
  | {|
      +phase: 'FILE_NOT_FOUND_IN_ZIP_FILE',
      +zip: JSZip,
      +pathInZipFile: string,
    |}
  | {|
      +phase: 'VIEW_PROFILE_IN_ZIP_FILE',
      +zip: JSZip,
      +pathInZipFile: string,
    |};

export type IsSidebarOpenPerPanelState = { [TabSlug]: boolean };

export type UrlSetupPhase = 'initial-load' | 'loading-profile' | 'done';

export type AppState = {|
  +view: AppViewState,
  +urlSetupPhase: UrlSetupPhase,
  +hasZoomedViaMousewheel: boolean,
  +isSidebarOpenPerPanel: IsSidebarOpenPerPanelState,
  +panelLayoutGeneration: number,
  +lastVisibleThreadTabSlug: TabSlug,
  +trackThreadHeights: Array<ThreadIndex | void>,
  +isNewlyPublished: boolean,
|};

export type UploadPhase =
  | 'local'
  | 'compressing'
  | 'uploading'
  | 'uploaded'
  | 'error';

export type UploadState = {|
  phase: UploadPhase,
  uploadProgress: number,
  error: Error | mixed,
  abortFunction: () => void,
  generation: number,
|};

/**
 * This holds the state of the profile before it was uploaded.
 */
export type PrePublishedState = {|
  +profile: Profile,
  +urlState: UrlState,
  +zipFileState: ZipFileState,
|};

export type PublishState = {|
  +checkedSharingOptions: CheckedSharingOptions,
  +upload: UploadState,
  +isHidingStaleProfile: boolean,
  +hasSanitizedProfile: boolean,
  +prePublishedState: State | null,
|};

export type ZippedProfilesState = {
  zipFile: ZipFileState,
  error: Error | null,
  selectedZipFileIndex: IndexIntoZipFileTable | null,
  // In practice this should never contain null, but needs to support the
  // TreeView interface.
  expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>,
};

export type UrlState = {|
  +dataSource: DataSource,
  // This is used for the "public" dataSource".
  +hash: string,
  // This is used for the "from-url" dataSource.
  +profileUrl: string,
  // This is used for the "compare" dataSource, to compare 2 profiles.
  +profilesToCompare: string[] | null,
  +selectedTab: TabSlug,
  +pathInZipFile: string | null,
  +profileName: string,
  +profileSpecific: {|
    selectedThread: ThreadIndex | null,
    globalTrackOrder: TrackIndex[],
    hiddenGlobalTracks: Set<TrackIndex>,
    hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
    localTrackOrderByPid: Map<Pid, TrackIndex[]>,
    implementation: ImplementationFilter,
    callTreeSummaryStrategy: CallTreeSummaryStrategy,
    invertCallstack: boolean,
    showJsTracerSummary: boolean,
    committedRanges: StartEndRange[],
    callTreeSearchString: string,
    markersSearchString: string,
    networkSearchString: string,
    transforms: TransformStacksPerThread,
    timelineType: TimelineType,
    legacyThreadOrder: ThreadIndex[] | null,
    legacyHiddenThreads: ThreadIndex[] | null,
  |},
|};

export type IconState = Set<string>;

export type State = {|
  +app: AppState,
  +profileView: ProfileViewState,
  +urlState: UrlState,
  +icons: IconState,
  +zippedProfiles: ZippedProfilesState,
  +publish: PublishState,
|};

export type IconWithClassName = {|
  +icon: string,
  +className: string,
|};
