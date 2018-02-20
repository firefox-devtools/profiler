/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type {
  Action,
  DataSource,
  ProfileSelection,
  ImplementationFilter,
  TabSlug,
} from './actions';
import type { Milliseconds, StartEndRange } from './units';
import type { IndexIntoMarkersTable, Profile, ThreadIndex } from './profile';
import type { CallNodePath } from './profile-derived';
import type { Attempt } from '../utils/errors';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';
import type { TransformStacksPerThread } from './transforms';
import JSZip from 'jszip';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';

export type Reducer<T> = (T, Action) => T;

export type RequestedLib = { debugName: string, breakpadId: string };
export type SymbolicationStatus = 'DONE' | 'SYMBOLICATING';
export type ThreadViewOptions = {
  selectedCallNodePath: CallNodePath,
  expandedCallNodePaths: Array<CallNodePath>,
  selectedMarker: IndexIntoMarkersTable | -1,
};
export type ProfileViewState = {
  viewOptions: {
    perThread: ThreadViewOptions[],
    symbolicationStatus: SymbolicationStatus,
    waitingForLibs: Set<RequestedLib>,
    selection: ProfileSelection,
    scrollToSelectionGeneration: number,
    focusCallTreeGeneration: number,
    rootRange: StartEndRange,
    zeroAt: Milliseconds,
    tabOrder: number[],
    rightClickedThread: ThreadIndex,
  },
  profile: Profile | null,
};

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
 * where the state is now, and next is the phase it can transition to.
 */
export type ZipFileState =
  | {|
      +phase: 'NO_ZIP_FILE',
      +zip: null,
      +zipFilePath: null,
    |}
  | {|
      +phase: 'LIST_FILES_IN_ZIP_FILE',
      +zip: JSZip,
      +zipFilePath: null,
    |}
  | {|
      +phase: 'PROCESS_PROFILE_FROM_ZIP_FILE',
      +zip: JSZip,
      +zipFilePath: string,
    |}
  | {|
      +phase: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE',
      +zip: JSZip,
      +zipFilePath: string,
    |}
  | {|
      +phase: 'FILE_NOT_FOUND_IN_ZIP_FILE',
      +zip: JSZip,
      +zipFilePath: string,
    |}
  | {|
      +phase: 'VIEW_PROFILE_IN_ZIP_FILE',
      +zip: JSZip,
      +zipFilePath: string,
    |};

export type AppState = {
  view: AppViewState,
  isUrlSetupDone: boolean,
  hasZoomedViaMousewheel: boolean,
  zipFile: ZipFileState,
  selectedZipFileIndex: IndexIntoZipFileTable | null,
  // In practice this should never contain null, but needs to support the
  // TreeView interface.
  expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>,
};

export type RangeFilterState = {
  start: number,
  end: number,
};

export type UrlState = {
  dataSource: DataSource,
  hash: string,
  profileUrl: string,
  selectedTab: TabSlug,
  rangeFilters: RangeFilterState[],
  selectedThread: ThreadIndex | null,
  callTreeSearchString: string,
  markersSearchString: string,
  implementation: ImplementationFilter,
  invertCallstack: boolean,
  hidePlatformDetails: boolean,
  threadOrder: ThreadIndex[],
  hiddenThreads: ThreadIndex[],
  transforms: TransformStacksPerThread,
  zipFilePath: string | null,
};

export type IconState = Set<string>;

export type StackChartState = {
  categoryColorStrategy: GetCategory,
  labelingStrategy: GetLabel,
};

export type State = {
  app: AppState,
  profileView: ProfileViewState,
  urlState: UrlState,
  stackChart: StackChartState,
  icons: IconState,
};

export type IconWithClassName = {
  icon: string,
  className: string,
};
