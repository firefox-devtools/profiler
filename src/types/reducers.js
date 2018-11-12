/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type {
  Action,
  DataSource,
  PreviewSelection,
  ImplementationFilter,
  RequestedLib,
  TrackReference,
  TimelineType,
} from './actions';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { Milliseconds, StartEndRange } from './units';
import type {
  IndexIntoMarkersTable,
  Profile,
  ThreadIndex,
  Pid,
} from './profile';

import type {
  CallNodePath,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
} from './profile-derived';
import type { Attempt } from '../utils/errors';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';
import type { TransformStacksPerThread } from './transforms';
import type JSZip from 'jszip';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { PathSet } from '../utils/path.js';

export type Reducer<T> = (T | void, Action) => T;

export type SymbolicationStatus = 'DONE' | 'SYMBOLICATING';
export type ThreadViewOptions = {|
  +selectedCallNodePath: CallNodePath,
  +expandedCallNodePaths: PathSet,
  +selectedMarker: IndexIntoMarkersTable | -1,
|};

export type ProfileSharingStatus = {|
  +sharedWithUrls: boolean,
  +sharedWithoutUrls: boolean,
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
    zeroAt: Milliseconds,
    rightClickedTrack: TrackReference,
    isCallNodeContextMenuVisible: boolean,
    profileSharingStatus: ProfileSharingStatus,
  |},
  +globalTracks: GlobalTrack[],
  +localTracksByPid: Map<Pid, LocalTrack[]>,
  +profile: Profile | null,
|};

export type AppViewState =
  | {| +phase: 'ROUTE_NOT_FOUND' |}
  | {| +phase: 'DATA_LOADED' |}
  | {| +phase: 'FATAL_ERROR', +error: Error |}
  | {|
      +phase: 'INITIALIZING',
      +additionalData?: {| +attempt: Attempt | null, +message: string |},
    |};

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

export type AppState = {|
  +view: AppViewState,
  +isUrlSetupDone: boolean,
  +hasZoomedViaMousewheel: boolean,
  +isSidebarOpenPerPanel: IsSidebarOpenPerPanelState,
  +panelLayoutGeneration: number,
  +lastVisibleThreadTabSlug: TabSlug,
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
  +hash: string,
  +profileUrl: string,
  +selectedTab: TabSlug,
  +pathInZipFile: string | null,
  +profileSpecific: {|
    selectedThread: ThreadIndex | null,
    globalTrackOrder: TrackIndex[],
    hiddenGlobalTracks: Set<TrackIndex>,
    hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
    localTrackOrderByPid: Map<Pid, TrackIndex[]>,
    implementation: ImplementationFilter,
    invertCallstack: boolean,
    committedRanges: StartEndRange[],
    callTreeSearchString: string,
    markersSearchString: string,
    transforms: TransformStacksPerThread,
    timelineType: TimelineType,
    legacyThreadOrder: ThreadIndex[] | null,
    legacyHiddenThreads: ThreadIndex[] | null,
  |},
|};

export type IconState = Set<string>;

export type StackChartState = {|
  categoryColorStrategy: GetCategory,
  labelingStrategy: GetLabel,
|};

export type State = {|
  +app: AppState,
  +profileView: ProfileViewState,
  +urlState: UrlState,
  +stackChart: StackChartState,
  +icons: IconState,
  +zippedProfiles: ZippedProfilesState,
|};

export type IconWithClassName = {|
  +icon: string,
  +className: string,
|};
