/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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
  SharingMode,
  LastNonShiftClickInformation,
} from './actions';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { StartEndRange, CssPixels, Milliseconds, Address } from './units';
import type {
  Profile,
  ThreadIndex,
  Pid,
  TabID,
  IndexIntoSourceTable,
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
import type { SingleColumnSortState } from '../components/shared/TreeView';
import type JSZip from 'jszip';
import type { FormatEdits } from '../profile-logic/js-format/types';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { PathSet } from '../utils/path';
import type { UploadedProfileInformation as ImportedUploadedProfileInformation } from '../app-logic/uploaded-profiles-db';
import type { BrowserConnectionStatus } from '../app-logic/browser-connection';

export type Reducer<T> = (state: T | undefined, action: Action) => T;

// This type is defined in uploaded-profiles-db.js because it is very tied to
// the data stored in our local IndexedDB, and we don't want to change it
// lightly, without changing the DB code.
// We reexport this type here mostly for easier access.
export type UploadedProfileInformation = ImportedUploadedProfileInformation;

export type SymbolicationStatus = 'DONE' | 'SYMBOLICATING';
export type SourceMapSymbolicationStatus =
  | 'INACTIVE'
  | 'FETCHING'
  | 'SYMBOLICATING';
export type ThreadViewOptions = {
  readonly selectedNonInvertedCallNodePath: CallNodePath;
  readonly selectedInvertedCallNodePath: CallNodePath;
  readonly expandedNonInvertedCallNodePaths: PathSet;
  readonly expandedInvertedCallNodePaths: PathSet;
  readonly selectedNetworkMarker: MarkerIndex | null;
  // Track the number of transforms to detect when they change via browser
  // navigation. This helps us know when to reset paths that may be invalid
  // in the new transform state.
  readonly lastSeenTransformCount: number;
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

export type SelectedMarkersPerThread = {
  [key: ThreadsKey]: MarkerIndex | null;
};

/**
 * Profile view state
 */
export type ProfileViewState = {
  readonly viewOptions: {
    perThread: ThreadViewOptionsPerThreads;
    symbolicationStatus: SymbolicationStatus;
    sourceMapSymbolicationStatus: SourceMapSymbolicationStatus;
    waitingForLibs: Set<RequestedLib>;
    previewSelection: PreviewSelection | null;
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
  readonly lastVisibleThreadTabSlug: TabSlug;
  readonly trackThreadHeights: Record<ThreadsKey, CssPixels>;
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

export type ProfileEncodingResult =
  | { type: 'SUCCESS'; profileData: Blob }
  | { type: 'ERROR'; error: Error };

export type SanitizedProfileEncodingState =
  | {
      phase: 'INITIAL';
    }
  | {
      phase: 'ENCODING';
      sanitizedProfile: Profile;
      encodingPromise: Promise<ProfileEncodingResult>;
    }
  | {
      phase: 'DONE';
      sanitizedProfile: Profile;
      profileData: Blob;
    }
  | { phase: 'ERROR'; sanitizedProfile: Profile; error: Error };

export type PublishState = {
  readonly checkedSharingOptions: Record<SharingMode, CheckedSharingOptions>;
  readonly sanitizedProfileEncodingState: SanitizedProfileEncodingState;
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
  // Optional line number to scroll to in the source view.
  scrollToLineNumber?: number;
  // Optional column number on scrollToLineNumber. This is used to find the
  // right line when the source view is pretty-printed.
  scrollToColumnNumber?: number;
  // Index into source table. Contains information (filename and uuid) about the
  // source. Null if a function without a file path was double clicked.
  sourceIndex: IndexIntoSourceTable | null;
  // The line number of the highlighted line in the source view.
  highlightedLine: number | null;
  // The column number on the highlighted line, if known.
  highlightedColumn: number | null;
  // Whether JS code is pretty-printed in the source view. This stays the same
  // when a different source is shown.
  isPrettyPrinted: boolean;
};

export type GeneratedSourceViewState = {
  // Whether the generated source view panel is open within the bottom box.
  // This can be true even if the bottom box itself is closed, or if the current
  // function has no source map. The panel is only displayed if sourceIndex is
  // non-null.
  isOpen: boolean;
  scrollGeneration: number;
  // Optional line number to scroll to in the generated source view.
  scrollToLineNumber?: number;
  // Optional column number on scrollToLineNumber, see SourceViewState.
  scrollToColumnNumber?: number;
  // Index into the source table for the generated (compiled) code, for example
  // a JS bundle. Null if the current function isn't source-mapped.
  sourceIndex: IndexIntoSourceTable | null;
  // The line number of the highlighted line in the generated source view.
  highlightedLine: number | null;
  // The column number on the highlighted line, if known.
  highlightedColumn: number | null;
  // Whether the generated code is pretty-printed.
  isPrettyPrinted: boolean;
};

export type AssemblyViewState = {
  // Whether the assembly view panel is open within the bottom box. This can be
  // true even if the bottom box itself is closed.
  isOpen: boolean;
  // When this is incremented, the assembly view scrolls to the "hotspot" line.
  scrollGeneration: number;
  // Optional instruction address to scroll to in the assembly view.
  scrollToInstructionAddress?: number;
  // The address of the highlighted instruction in the assembly view.
  highlightedInstruction: number | null;
  // The list of native symbols whose assembly code should be accessible in the
  // assembly view. Often empty or just one element, but sometimes this can have
  // multiple elements, for example the different JIT compilations of one JS function.
  nativeSymbols: NativeSymbolInfo[];
  // The index in `nativeSymbols` for the symbol whose assembly code is being shown at the moment.
  // Null if nativeSymbols is empty.
  currentNativeSymbol: number | null;
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
    }
  | {
      type: 'NOT_PRESENT_IN_BROWSER';
      sourceUuid: string;
      url: string;
      errorMessage: string;
    };

export type ProfileSpecificUrlState = {
  selectedThreads: Set<ThreadIndex> | null;
  implementation: ImplementationFilter;
  lastSelectedCallTreeSummaryStrategy: CallTreeSummaryStrategy;
  invertCallTree: boolean;
  invertFlameGraph: boolean;
  includeIdleSamples: boolean;
  showUserTimings: boolean;
  stackChartSameWidths: boolean;
  committedRanges: StartEndRange[];
  callTreeSearchString: string;
  markersSearchString: string;
  networkSearchString: string;
  transforms: TransformStacksPerThread;
  timelineType: TimelineType;
  sourceView: SourceViewState;
  generatedSourceView: GeneratedSourceViewState;
  assemblyView: AssemblyViewState;
  isBottomBoxOpenPerPanel: IsOpenPerPanelState;
  isBottomBoxFullscreen: boolean;
  globalTrackOrder: TrackIndex[];
  hiddenGlobalTracks: Set<TrackIndex>;
  hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>;
  localTrackOrderByPid: Map<Pid, TrackIndex[]>;
  localTrackOrderChangedPids: Set<Pid>;
  showJsTracerSummary: boolean;
  tabFilter: TabID | null;
  legacyThreadOrder: ThreadIndex[] | null;
  legacyHiddenThreads: ThreadIndex[] | null;
  selectedMarkers: SelectedMarkersPerThread;
  markerTableSort: SingleColumnSortState[] | null;
};

/**
 * Which buckets the benchmark comparison lists, by how they relate to the
 * overall score. See BUCKET_FILTER_MODES in BenchmarkCompareViewer.tsx.
 */
export type BenchmarkBucketFilterMode = 'movers' | 'significant' | 'none';

/**
 * Which buckets to list: all of them, or only the ones on one side of the
 * comparison.
 *
 * A mixed list is the right default when you are asking "what did my patch do",
 * because the answer includes both. It is the wrong shape for the other question
 * this view now serves — "where is Firefox losing to Chrome" — where the wins and
 * the losses are separate pieces of work and interleaving them by size means
 * scanning past half the table to read either one. The old comparison report
 * built a separate list per direction for exactly this reason.
 *
 * The choice is a sentence with two slots — which profile, then which direction
 * — rather than one list naming the slower side. With two profiles the two forms
 * select the same three subsets, so the difference is entirely one of reading: a
 * list of "Firefox is slower" / "Chrome is slower" contains the answer to "where
 * is Firefox faster" but never says the word, and a reader looking at an
 * unfamiliar report does not reliably make the substitution. Observed, on a
 * Firefox-vs-Chrome comparison: they asked how to show where Firefox was faster
 * and did not recognise "Chrome is slower" as it. Naming a side once and then
 * saying faster or slower about it costs one more control and answers the
 * question as asked.
 *
 * The profile slot is the *subject* of that sentence, and the subject is also
 * what the whole report is about: every row is the subject measured against the
 * comparand. So picking a subject recomputes the report, and with two profiles
 * it swaps the two sides.
 */
export type BenchmarkBucketShow = 'all' | 'faster' | 'slower';

/**
 * What the subject is being compared with: another profile by its position in
 * the loaded list, or whichever of the others is quickest on the row in hand.
 *
 * The aggregate is the point of loading a third profile. "Firefox is slower than
 * Chrome" is a question about Chrome; "Firefox is slower than the fastest of the
 * others" is the question a browser engineer actually has, because its answer
 * comes with an existence proof -- somebody does this faster, so it can be done
 * faster. It is also why the comparand is a slot rather than the options being
 * written out one per phrasing: "the fastest of the others" is not an ordered
 * pair, so there is no ready-made sentence for it. How such a row is computed
 * is in best-of-others.ts.
 *
 * With two profiles loaded, 'best' *is* the other profile, so the slot has one
 * distinct value and is not shown.
 */
export type BenchmarkBucketComparand = number | 'best';

/**
 * What the benchmark comparison compares, and which of its buckets it lists, as
 * the URL carries it.
 *
 * Profiles are referred to by their position in `profilesToCompare`. A null
 * `subject` means the second profile, which is the new side when two profiles
 * are a before and an after.
 */
export type BenchmarkBucketFilter = {
  readonly mode: BenchmarkBucketFilterMode;
  readonly subject: number | null;
  readonly comparand: BenchmarkBucketComparand;
  readonly show: BenchmarkBucketShow;
};

export type UrlState = {
  readonly dataSource: DataSource;
  // This is used for the "public" dataSource".
  readonly hash: string;
  // This is used for the "from-url" dataSource.
  readonly profileUrl: string;
  // This is used for the "compare" dataSource, to compare 2 profiles.
  readonly profilesToCompare: string[] | null;
  // Display names for `profilesToCompare`, used by the "compare-benchmark"
  // dataSource. Null when the URL doesn't name them, in which case the
  // benchmark view falls back to DEFAULT_BENCHMARK_PROFILE_NAMES.
  readonly profileNamesToCompare: string[] | null;
  // Used by the "compare-benchmark" dataSource.
  readonly benchmarkBucketFilter: BenchmarkBucketFilter;
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

/**
 * Map of icons to their class names
 */
export type IconsWithClassNames = Map<string, string>;

// The result of pretty-printing a source, see FormatEdits. While the format
// worker is busy, isDone is false and the edits only cover the start of the
// code.
export type SourceFormattingStatus = {
  readonly edits: FormatEdits;
  readonly isDone: boolean;
};

export type CodeState = {
  readonly sourceCodeCache: Map<IndexIntoSourceTable, SourceCodeStatus>;
  readonly assemblyCodeCache: Map<string, AssemblyCodeStatus>;
  readonly sourceFormattingCache: Map<
    IndexIntoSourceTable,
    SourceFormattingStatus
  >;
};

export type State = {
  readonly app: AppState;
  readonly profileView: ProfileViewState;
  readonly urlState: UrlState;
  readonly icons: IconsWithClassNames;
  readonly zippedProfiles: ZippedProfilesState;
  readonly publish: PublishState;
  readonly code: CodeState;
};
