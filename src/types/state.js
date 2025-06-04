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
  Localization,
  LastNonShiftClickInformation,
} from './actions';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { StartEndRange, CssPixels, Milliseconds, Address } from './units';
import type {
  Profile,
  ThreadIndex,
  Pid,
  TabID,
  IndexIntoLibs,
} from './profile';

import type {
  CallNodePath,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
  MarkerIndex,
  ThreadsKey,
  NativeSymbolInfo,
} from './profile-derived';
import type { Attempt } from '../utils/errors';
import type { TransformStacksPerThread } from './transforms';
import type JSZip from 'jszip';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { PathSet } from '../utils/path.js';
import type { UploadedProfileInformation as ImportedUploadedProfileInformation } from 'firefox-profiler/app-logic/uploaded-profiles-db';
import type { BrowserConnectionStatus } from 'firefox-profiler/app-logic/browser-connection';

export type Reducer<T> = (T | void, Action) => T;

// This type is defined in uploaded-profiles-db.js because it is very tied to
// the data stored in our local IndexedDB, and we don't want to change it
// lightly, without changing the DB code.
// We reexport this type here mostly for easier access.
export type UploadedProfileInformation = ImportedUploadedProfileInformation;

export type SymbolicationStatus = 'DONE' | 'SYMBOLICATING';
export type ThreadViewOptions = {|
  +selectedNonInvertedCallNodePath: CallNodePath,
  +selectedInvertedCallNodePath: CallNodePath,
  +expandedNonInvertedCallNodePaths: PathSet,
  +expandedInvertedCallNodePaths: PathSet,
  +selectedMarker: MarkerIndex | null,
  +selectedNetworkMarker: MarkerIndex | null,
|};

export type ThreadViewOptionsPerThreads = { [ThreadsKey]: ThreadViewOptions };

export type TableViewOptions = {|
  +fixedColumnWidths: Array<CssPixels> | null,
|};

export type TableViewOptionsPerTab = { [TabSlug]: TableViewOptions };

export type RightClickedCallNode = {|
  +threadsKey: ThreadsKey,
  +callNodePath: CallNodePath,
|};

export type MarkerReference = {|
  +threadsKey: ThreadsKey,
  +markerIndex: MarkerIndex,
|};

/**
 * Full profile view state
 * They should not be used from the active tab view.
 */
export type FullProfileViewState = {|
  globalTracks: GlobalTrack[],
  localTracksByPid: Map<Pid, LocalTrack[]>,
|};

/**
 * Profile view state
 */
export type ProfileViewState = {
  +viewOptions: {|
    perThread: ThreadViewOptionsPerThreads,
    symbolicationStatus: SymbolicationStatus,
    waitingForLibs: Set<RequestedLib>,
    previewSelection: PreviewSelection,
    scrollToSelectionGeneration: number,
    focusCallTreeGeneration: number,
    rootRange: StartEndRange,
    lastNonShiftClick: LastNonShiftClickInformation | null,
    rightClickedTrack: TrackReference | null,
    rightClickedCallNode: RightClickedCallNode | null,
    rightClickedMarker: MarkerReference | null,
    hoveredMarker: MarkerReference | null,
    mouseTimePosition: Milliseconds | null,
    perTab: TableViewOptionsPerTab,
  |},
  +profile: Profile | null,
  +full: FullProfileViewState,
};

export type AppViewState =
  | {| +phase: 'ROUTE_NOT_FOUND' |}
  | {| +phase: 'TRANSITIONING_FROM_STALE_PROFILE' |}
  | {| +phase: 'PROFILE_LOADED' |}
  | {| +phase: 'DATA_LOADED' |}
  | {| +phase: 'DATA_RELOAD' |}
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

export type IsOpenPerPanelState = { [TabSlug]: boolean };

export type UrlSetupPhase = 'initial-load' | 'loading-profile' | 'done';

/*
 * Experimental features that are mostly disabled by default. You need to enable
 * them from the DevTools console with `experimental.enable<feature-camel-case>()`,
 * e.g. `experimental.enableEventDelayTracks()`.
 */
export type ExperimentalFlags = {|
  +eventDelayTracks: boolean,
  +cpuGraphs: boolean,
  +processCPUTracks: boolean,
|};

export type AppState = {|
  +view: AppViewState,
  +urlSetupPhase: UrlSetupPhase,
  +hasZoomedViaMousewheel: boolean,
  +isSidebarOpenPerPanel: IsOpenPerPanelState,
  +sidebarOpenCategories: Map<string, Set<number>>,
  +panelLayoutGeneration: number,
  +lastVisibleThreadTabSlug: TabSlug,
  +trackThreadHeights: {
    [key: ThreadsKey]: CssPixels,
  },
  +isNewlyPublished: boolean,
  +isDragAndDropDragging: boolean,
  +isDragAndDropOverlayRegistered: boolean,
  +experimental: ExperimentalFlags,
  +currentProfileUploadedInformation: UploadedProfileInformation | null,
  +browserConnectionStatus: BrowserConnectionStatus,
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

export type SourceViewState = {|
  scrollGeneration: number,
  // Non-null if this source file was opened for a function from native code.
  // In theory, multiple different libraries can have source files with the same
  // path but different content.
  // Null if the source file is not for native code or if the lib is not known,
  // for example if the source view was opened via the URL (the source URL param
  // currently discards the libIndex).
  libIndex: IndexIntoLibs | null,
  // The path to the source file. Null if a function without a file path was
  // double clicked.
  sourceFile: string | null,
|};

export type AssemblyViewState = {|
  // Whether the assembly view panel is open within the bottom box. This can be
  // true even if the bottom box itself is closed.
  isOpen: boolean,
  // When this is incremented, the assembly view scrolls to the "hotspot" line.
  scrollGeneration: number,
  // The native symbol for which the assembly code is being shown at the moment.
  // Null if the initiating call node did not have a native symbol.
  nativeSymbol: NativeSymbolInfo | null,
  // The set of native symbols which contributed samples to the initiating call
  // node. Often, this will just be one element (the same as `nativeSymbol`),
  // but it can also be multiple elements, for example when double-clicking a
  // function like `Vec::push` in an inverted call tree, if that function has
  // been inlined into multiple different callers.
  allNativeSymbolsForInitiatingCallNode: NativeSymbolInfo[],
|};

export type DecodedInstruction = {|
  address: Address,
  decodedString: string,
|};

export type SourceCodeStatus =
  | {| type: 'LOADING', source: CodeLoadingSource |}
  | {| type: 'ERROR', errors: SourceCodeLoadingError[] |}
  | {| type: 'AVAILABLE', code: string |};

export type AssemblyCodeStatus =
  | {| type: 'LOADING', source: CodeLoadingSource |}
  | {| type: 'ERROR', errors: ApiQueryError[] |}
  | {| type: 'AVAILABLE', instructions: DecodedInstruction[] |};

export type CodeLoadingSource =
  | {| type: 'URL', url: string |}
  | {| type: 'BROWSER_CONNECTION' |};

export type ApiQueryError =
  | {|
      type: 'NETWORK_ERROR',
      url: string,
      networkErrorMessage: string,
    |}
  // Used when the symbol server reported an error, for example because our
  // request was bad.
  | {|
      type: 'SYMBOL_SERVER_API_ERROR',
      apiErrorMessage: string,
    |}
  // Used when the symbol server's response was bad.
  | {|
      type: 'SYMBOL_SERVER_API_MALFORMED_RESPONSE',
      errorMessage: string,
    |}
  // Used when the browser API reported an error, for example because our
  // request was bad.
  | {|
      type: 'BROWSER_CONNECTION_ERROR',
      browserConnectionErrorMessage: string,
    |}
  // Used when the browser's response was bad.
  | {|
      type: 'BROWSER_API_ERROR',
      apiErrorMessage: string,
    |}
  | {|
      type: 'BROWSER_API_MALFORMED_RESPONSE',
      errorMessage: string,
    |};

export type SourceCodeLoadingError =
  | ApiQueryError
  | {| type: 'NO_KNOWN_CORS_URL' |}
  | {|
      type: 'NOT_PRESENT_IN_ARCHIVE',
      url: string,
      pathInArchive: string,
    |}
  | {|
      type: 'ARCHIVE_PARSING_ERROR',
      url: string,
      parsingErrorMessage: string,
    |};

/**
 * Full profile specific url state
 */
export type FullProfileSpecificUrlState = {|
  globalTrackOrder: TrackIndex[],
  hiddenGlobalTracks: Set<TrackIndex>,
  hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
  localTrackOrderByPid: Map<Pid, TrackIndex[]>,
  localTrackOrderChangedPids: Set<Pid>,
  showJsTracerSummary: boolean,
  tabFilter: TabID | null,
  legacyThreadOrder: ThreadIndex[] | null,
  legacyHiddenThreads: ThreadIndex[] | null,
|};

export type ProfileSpecificUrlState = {|
  selectedThreads: Set<ThreadIndex> | null,
  implementation: ImplementationFilter,
  lastSelectedCallTreeSummaryStrategy: CallTreeSummaryStrategy,
  invertCallstack: boolean,
  showUserTimings: boolean,
  committedRanges: StartEndRange[],
  callTreeSearchString: string,
  markersSearchString: string,
  networkSearchString: string,
  transforms: TransformStacksPerThread,
  timelineType: TimelineType,
  sourceView: SourceViewState,
  assemblyView: AssemblyViewState,
  isBottomBoxOpenPerPanel: IsOpenPerPanelState,
  full: FullProfileSpecificUrlState,
|};

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
  +profileName: string | null,
  +profileSpecific: ProfileSpecificUrlState,
  +symbolServerUrl: string | null,
|};

/**
 * Localization State
 */
export type PseudoStrategy = null | 'bidi' | 'accented';
export type L10nState = {|
  +requestedLocales: string[] | null,
  +pseudoStrategy: PseudoStrategy,
  +localization: Localization,
  +primaryLocale: string | null,
  +direction: 'ltr' | 'rtl',
|};

/**
 * Map of icons to their class names
 */
export type IconsWithClassNames = Map<string, string>;

export type CodeState = {|
  +sourceCodeCache: Map<string, SourceCodeStatus>,
  +assemblyCodeCache: Map<string, AssemblyCodeStatus>,
|};

export type State = {|
  +app: AppState,
  +profileView: ProfileViewState,
  +urlState: UrlState,
  +icons: IconsWithClassNames,
  +zippedProfiles: ZippedProfilesState,
  +publish: PublishState,
  +l10n: L10nState,
  +code: CodeState,
|};
