/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
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
import { TabSlug } from '../app-logic/tabs-handling';
import { StartEndRange, CssPixels, Milliseconds, Address } from './units';
import { Profile, ThreadIndex, Pid, TabID, IndexIntoLibs } from './profile';

import {
  CallNodePath,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
  MarkerIndex,
  ThreadsKey,
  NativeSymbolInfo,
} from './profile-derived';
import { Attempt } from '../utils/errors';
import { TransformStacksPerThread } from './transforms';
import * as JSZip from 'jszip';
import { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import { PathSet } from '../utils/path';
import { UploadedProfileInformation as ImportedUploadedProfileInformation } from '../app-logic/uploaded-profiles-db';
import { BrowserConnectionStatus } from '../app-logic/browser-connection';

export type Reducer<T> = (state: T | undefined, action: Action) => T;

// This type is defined in uploaded-profiles-db.js because it is very tied to
// the data stored in our local IndexedDB, and we don't want to change it
// lightly, without changing the DB code.
// We reexport this type here mostly for easier access.
export type UploadedProfileInformation = ImportedUploadedProfileInformation;

export type SymbolicationStatus = 'DONE' | 'SYMBOLICATING';
export type ThreadViewOptions = {
  readonly selectedNonInvertedCallNodePath: CallNodePath;
  readonly selectedInvertedCallNodePath: CallNodePath;
  readonly expandedNonInvertedCallNodePaths: PathSet;
  readonly expandedInvertedCallNodePaths: PathSet;
  readonly selectedMarker: MarkerIndex | null;
  readonly selectedNetworkMarker: MarkerIndex | null;
};

export type ThreadViewOptionsPerThreads = {
  [K in ThreadsKey]: ThreadViewOptions;
};

export type TableViewOptions = {
  readonly fixedColumnWidths: Array<CssPixels> | null;
};

export type TableViewOptionsPerTab = { [K in TabSlug]: TableViewOptions };

export type RightClickedCallNode = {
  readonly threadsKey: ThreadsKey;
  readonly callNodePath: CallNodePath;
};

export type MarkerReference = {
  readonly threadsKey: ThreadsKey;
  readonly markerIndex: MarkerIndex;
};

/**
 * Profile view state
 */
export type ProfileViewState = {
  readonly viewOptions: {
    perThread: ThreadViewOptionsPerThreads;
    symbolicationStatus: SymbolicationStatus;
    waitingForLibs: Set<RequestedLib>;
    previewSelection: PreviewSelection;
    scrollToSelectionGeneration: number;
    focusCallTreeGeneration: number;
    rootRange: StartEndRange;
    lastNonShiftClick: LastNonShiftClickInformation | null;
    rightClickedTrack: TrackReference | null;
    rightClickedCallNode: RightClickedCallNode | null;
    rightClickedMarker: MarkerReference | null;
    hoveredMarker: MarkerReference | null;
    mouseTimePosition: Milliseconds | null;
    perTab: TableViewOptionsPerTab;
  };
  readonly profile: Profile | null;
  globalTracks: GlobalTrack[];
  localTracksByPid: Map<Pid, LocalTrack[]>;
};

export type AppViewState =
  | { readonly phase: 'ROUTE_NOT_FOUND' }
  | { readonly phase: 'TRANSITIONING_FROM_STALE_PROFILE' }
  | { readonly phase: 'PROFILE_LOADED' }
  | { readonly phase: 'DATA_LOADED' }
  | { readonly phase: 'DATA_RELOAD' }
  | { readonly phase: 'FATAL_ERROR'; readonly error: Error }
  | {
      readonly phase: 'INITIALIZING';
      readonly additionalData?: {
        readonly attempt: Attempt | null;
        readonly message: string;
      };
    };

export type Phase = AppViewState['phase'];

/**
 * This represents the finite state machine for loading zip files. The phase represents
 * where the state is now.
 */
export type ZipFileState =
  | {
      readonly phase: 'NO_ZIP_FILE';
      readonly zip: null;
      readonly pathInZipFile: null;
    }
  | {
      readonly phase: 'LIST_FILES_IN_ZIP_FILE';
      readonly zip: JSZip;
      readonly pathInZipFile: null;
    }
  | {
      readonly phase: 'PROCESS_PROFILE_FROM_ZIP_FILE';
      readonly zip: JSZip;
      readonly pathInZipFile: string;
    }
  | {
      readonly phase: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE';
      readonly zip: JSZip;
      readonly pathInZipFile: string;
    }
  | {
      readonly phase: 'FILE_NOT_FOUND_IN_ZIP_FILE';
      readonly zip: JSZip;
      readonly pathInZipFile: string;
    }
  | {
      readonly phase: 'VIEW_PROFILE_IN_ZIP_FILE';
      readonly zip: JSZip;
      readonly pathInZipFile: string;
    };

export type IsOpenPerPanelState = { [K in TabSlug]: boolean };

export type UrlSetupPhase = 'initial-load' | 'loading-profile' | 'done';

/*
 * Experimental features that are mostly disabled by default. You need to enable
 * them from the DevTools console with `experimental.enable<feature-camel-case>()`,
 * e.g. `experimental.enableEventDelayTracks()`.
 */
export type ExperimentalFlags = {
  readonly eventDelayTracks: boolean;
  readonly cpuGraphs: boolean;
  readonly processCPUTracks: boolean;
};

export type AppState = {
  readonly view: AppViewState;
  readonly urlSetupPhase: UrlSetupPhase;
  readonly hasZoomedViaMousewheel: boolean;
  readonly isSidebarOpenPerPanel: IsOpenPerPanelState;
  readonly sidebarOpenCategories: Map<string, Set<number>>;
  readonly panelLayoutGeneration: number;
  readonly lastVisibleThreadTabSlug: TabSlug;
  readonly trackThreadHeights: Map<ThreadsKey, CssPixels>;
  readonly isNewlyPublished: boolean;
  readonly isDragAndDropDragging: boolean;
  readonly isDragAndDropOverlayRegistered: boolean;
  readonly experimental: ExperimentalFlags;
  readonly currentProfileUploadedInformation: UploadedProfileInformation | null;
  readonly browserConnectionStatus: BrowserConnectionStatus;
};

export type UploadPhase =
  | 'local'
  | 'compressing'
  | 'uploading'
  | 'uploaded'
  | 'error';

export type UploadState = {
  phase: UploadPhase;
  uploadProgress: number;
  error: Error | unknown;
  abortFunction: () => void;
  generation: number;
};

export type PublishState = {
  readonly checkedSharingOptions: CheckedSharingOptions;
  readonly upload: UploadState;
  readonly isHidingStaleProfile: boolean;
  readonly hasSanitizedProfile: boolean;
  readonly prePublishedState: State | null;
};

export type ZippedProfilesState = {
  zipFile: ZipFileState;
  error: Error | null;
  selectedZipFileIndex: IndexIntoZipFileTable | null;
  // In practice this should never contain null, but needs to support the
  // TreeView interface.
  expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>;
};

export type SourceViewState = {
  scrollGeneration: number;
  // Non-null if this source file was opened for a function from native code.
  // In theory, multiple different libraries can have source files with the same
  // path but different content.
  // Null if the source file is not for native code or if the lib is not known,
  // for example if the source view was opened via the URL (the source URL param
  // currently discards the libIndex).
  libIndex: IndexIntoLibs | null;
  // The path to the source file. Null if a function without a file path was
  // double clicked.
  sourceFile: string | null;
};

export type AssemblyViewState = {
  // Whether the assembly view panel is open within the bottom box. This can be
  // true even if the bottom box itself is closed.
  isOpen: boolean;
  // When this is incremented, the assembly view scrolls to the "hotspot" line.
  scrollGeneration: number;
  // The native symbol for which the assembly code is being shown at the moment.
  // Null if the initiating call node did not have a native symbol.
  nativeSymbol: NativeSymbolInfo | null;
  // The set of native symbols which contributed samples to the initiating call
  // node. Often, this will just be one element (the same as `nativeSymbol`),
  // but it can also be multiple elements, for example when double-clicking a
  // function like `Vec::push` in an inverted call tree, if that function has
  // been inlined into multiple different callers.
  allNativeSymbolsForInitiatingCallNode: NativeSymbolInfo[];
};

export type DecodedInstruction = {
  address: Address;
  decodedString: string;
};

export type SourceCodeStatus =
  | { type: 'LOADING'; source: CodeLoadingSource }
  | { type: 'ERROR'; errors: SourceCodeLoadingError[] }
  | { type: 'AVAILABLE'; code: string };

export type AssemblyCodeStatus =
  | { type: 'LOADING'; source: CodeLoadingSource }
  | { type: 'ERROR'; errors: ApiQueryError[] }
  | { type: 'AVAILABLE'; instructions: DecodedInstruction[] };

export type CodeLoadingSource =
  | { type: 'URL'; url: string }
  | { type: 'BROWSER_CONNECTION' };

export type ApiQueryError =
  | {
      type: 'NETWORK_ERROR';
      url: string;
      networkErrorMessage: string;
    }
  // Used when the symbol server reported an error, for example because our
  // request was bad.
  | {
      type: 'SYMBOL_SERVER_API_ERROR';
      apiErrorMessage: string;
    }
  // Used when the symbol server's response was bad.
  | {
      type: 'SYMBOL_SERVER_API_MALFORMED_RESPONSE';
      errorMessage: string;
    }
  // Used when the browser API reported an error, for example because our
  // request was bad.
  | {
      type: 'BROWSER_CONNECTION_ERROR';
      browserConnectionErrorMessage: string;
    }
  // Used when the browser's response was bad.
  | {
      type: 'BROWSER_API_ERROR';
      apiErrorMessage: string;
    }
  | {
      type: 'BROWSER_API_MALFORMED_RESPONSE';
      errorMessage: string;
    };

export type SourceCodeLoadingError =
  | ApiQueryError
  | { type: 'NO_KNOWN_CORS_URL' }
  | {
      type: 'NOT_PRESENT_IN_ARCHIVE';
      url: string;
      pathInArchive: string;
    }
  | {
      type: 'ARCHIVE_PARSING_ERROR';
      url: string;
      parsingErrorMessage: string;
    };

export type ProfileSpecificUrlState = {
  selectedThreads: Set<ThreadIndex> | null;
  implementation: ImplementationFilter;
  lastSelectedCallTreeSummaryStrategy: CallTreeSummaryStrategy;
  invertCallstack: boolean;
  showUserTimings: boolean;
  stackChartSameWidths: boolean;
  committedRanges: StartEndRange[];
  callTreeSearchString: string;
  markersSearchString: string;
  networkSearchString: string;
  transforms: TransformStacksPerThread;
  timelineType: TimelineType;
  sourceView: SourceViewState;
  assemblyView: AssemblyViewState;
  isBottomBoxOpenPerPanel: IsOpenPerPanelState;
  globalTrackOrder: TrackIndex[];
  hiddenGlobalTracks: Set<TrackIndex>;
  hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>;
  localTrackOrderByPid: Map<Pid, TrackIndex[]>;
  localTrackOrderChangedPids: Set<Pid>;
  showJsTracerSummary: boolean;
  tabFilter: TabID | null;
  legacyThreadOrder: ThreadIndex[] | null;
  legacyHiddenThreads: ThreadIndex[] | null;
};

export type UrlState = {
  readonly dataSource: DataSource;
  // This is used for the "public" dataSource".
  readonly hash: string;
  // This is used for the "from-url" dataSource.
  readonly profileUrl: string;
  // This is used for the "compare" dataSource, to compare 2 profiles.
  readonly profilesToCompare: string[] | null;
  readonly selectedTab: TabSlug;
  readonly pathInZipFile: string | null;
  readonly profileName: string | null;
  readonly profileSpecific: ProfileSpecificUrlState;
  readonly symbolServerUrl: string | null;
};

/**
 * Localization State
 */
export type PseudoStrategy = null | 'bidi' | 'accented';
export type L10nState = {
  readonly requestedLocales: string[] | null;
  readonly pseudoStrategy: PseudoStrategy;
  readonly localization: Localization;
  readonly primaryLocale: string | null;
  readonly direction: 'ltr' | 'rtl';
};

/**
 * Map of icons to their class names
 */
export type IconsWithClassNames = Map<string, string>;

export type CodeState = {
  readonly sourceCodeCache: Map<string, SourceCodeStatus>;
  readonly assemblyCodeCache: Map<string, AssemblyCodeStatus>;
};

export type State = {
  readonly app: AppState;
  readonly profileView: ProfileViewState;
  readonly urlState: UrlState;
  readonly icons: IconsWithClassNames;
  readonly zippedProfiles: ZippedProfilesState;
  readonly publish: PublishState;
  readonly l10n: L10nState;
  readonly code: CodeState;
};
