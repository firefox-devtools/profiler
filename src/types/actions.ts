/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type JSZip from 'jszip';
import type {
  Profile,
  RawThread,
  ThreadIndex,
  Pid,
  TabID,
  IndexIntoCategoryList,
  IndexIntoLibs,
  PageList,
} from './profile';
import type {
  Thread,
  CallNodePath,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
  MarkerIndex,
  ThreadsKey,
  NativeSymbolInfo,
} from './profile-derived';
import type { FuncToFuncsMap } from '../profile-logic/symbolication';
import type { TemporaryError } from '../utils/errors';
import type { Transform, TransformStacksPerThread } from './transforms';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { CallNodeInfo } from '../profile-logic/call-node-info';
import type { TabSlug } from '../app-logic/tabs-handling';
import type {
  UrlState,
  UploadState,
  State,
  UploadedProfileInformation,
  SourceCodeLoadingError,
  ApiQueryError,
  TableViewOptions,
  DecodedInstruction,
} from './state';
import type { CssPixels, StartEndRange, Milliseconds } from './units';
import type { BrowserConnectionStatus } from '../app-logic/browser-connection';

export type DataSource =
  | 'none'
  // This is used when the profile is loaded from a local file, via drag and
  // drop or via a file input. Reloading a URL with this data source cannot
  // work automatically because the file would need to be picked again.
  | 'from-file'
  // This datasource is used to fetch a profile from Firefox via a frame script.
  // This is the first entry-point when a profile is captured in the browser.
  | 'from-browser'
  // Websites can inject profiles via a postMessage call:
  // postMessage({ name: "inject-profile", profile: Profile })
  | 'from-post-message'
  // This is used for profiles that have been shared / uploaded to the Profiler
  // Server.
  | 'public'
  // This is used after a public profile is deleted / unpublished.
  // In the future, we may want to use the "local" data source for this, and
  // remove "unpublished".
  | 'unpublished'
  // Reserved for future use. Once implemented, it would work as follows:
  // Whenever a non-public profile is loaded into the profiler, e.g. via
  // from-browser or from-file, we want to store it in a local database
  // automatically, generate an ID for it, and redirect the URL to /local/{id}/.
  // This would make it so that the page can be reloaded, or restored after a
  // browser restart, without losing the profile.
  | 'local'
  // This is used to load profiles from a URL. It is used in two scenarios:
  //  - For public profiles which are hosted on a different server than the
  //    regular profiler server, for example for profiles that are captured
  //    automatically in Firefox CI.
  //  - With a localhost URL, in order to import profiles from a locally running
  //    script.
  | 'from-url'
  // This is used when comparing two profiles. The displayed profile is a
  // comparison profile created from two input profiles.
  | 'compare'
  // This is a page which displays a list of profiles that were uploaded from
  // this browser, and allows deleting / unpublishing those profiles.
  | 'uploaded-recordings';

export type TimelineType = 'stack' | 'category' | 'cpu-category';
export type PreviewSelection = {
  readonly isModifying: boolean;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly draggingStart?: boolean;
  readonly draggingEnd?: boolean;
};

/**
 * The counts for how many tracks are hidden in the timeline.
 */
export type HiddenTrackCount = {
  readonly hidden: number;
  readonly total: number;
};

/**
 * A TrackReference uniquely identifies a track.
 * Note that TrackIndexes aren't globally unique: they're unique among global
 * tracks, and they're unique among local tracks for a specific Pid.
 */
export type GlobalTrackReference = {
  readonly type: 'global';
  readonly trackIndex: TrackIndex;
};
export type LocalTrackReference = {
  readonly type: 'local';
  readonly trackIndex: TrackIndex;
  readonly pid: Pid;
};

export type TrackReference = GlobalTrackReference | LocalTrackReference;

export type LastNonShiftClickInformation = {
  clickedTrack: TrackReference;
  selection: Set<ThreadIndex>;
};

export type RequestedLib = {
  readonly debugName: string;
  readonly breakpadId: string;
};
export type ImplementationFilter = 'combined' | 'js' | 'cpp';
// Change the strategy for computing the summarizing information for the call tree.
export type CallTreeSummaryStrategy =
  | 'timing'
  | 'js-allocations'
  | 'native-retained-allocations'
  | 'native-allocations'
  | 'native-deallocations-memory'
  | 'native-deallocations-sites';

/**
 * This type determines what kind of information gets sanitized from published profiles.
 */
export type CheckedSharingOptions = {
  // The following values are for including more information in a sanitized profile.
  includeHiddenThreads: boolean;
  includeAllTabs: boolean;
  includeFullTimeRange: boolean;
  includeScreenshots: boolean;
  includeUrls: boolean;
  includeExtension: boolean;
  includePreferenceValues: boolean;
  includePrivateBrowsingData: boolean;
};

// This type is used when selecting tracks in the timeline. Ctrl and Meta are
// stored in the same property to accommodate all OSes.
export type KeyboardModifiers = { ctrlOrMeta: boolean; shift: boolean };

/**
 * This type gives some context about the action leading to a selection.
 */
export type SelectionContext = {
  // This is the source for this selection: is it a keyboard or a pointer event,
  // or is it the result of some automatic selection.
  readonly source: 'keyboard' | 'pointer' | 'auto';
};

type ProfileAction =
  | {
      readonly type: 'ROUTE_NOT_FOUND';
      readonly url: string;
    }
  | {
      readonly type: 'ASSIGN_TASK_TRACER_NAMES';
      readonly addressIndices: number[];
      readonly symbolNames: string[];
    }
  | {
      readonly type: 'CHANGE_SELECTED_CALL_NODE';
      readonly isInverted: boolean;
      readonly threadsKey: ThreadsKey;
      readonly selectedCallNodePath: CallNodePath;
      readonly optionalExpandedToCallNodePath: CallNodePath | undefined;
      readonly context: SelectionContext;
    }
  | {
      readonly type: 'UPDATE_TRACK_THREAD_HEIGHT';
      readonly height: CssPixels;
      readonly threadsKey: ThreadsKey;
    }
  | {
      readonly type: 'CHANGE_RIGHT_CLICKED_CALL_NODE';
      readonly threadsKey: ThreadsKey;
      readonly callNodePath: CallNodePath | null;
    }
  | {
      readonly type: 'FOCUS_CALL_TREE';
    }
  | {
      readonly type: 'CHANGE_EXPANDED_CALL_NODES';
      readonly threadsKey: ThreadsKey;
      readonly isInverted: boolean;
      readonly expandedCallNodePaths: Array<CallNodePath>;
    }
  | {
      readonly type: 'CHANGE_SELECTED_MARKER';
      readonly threadsKey: ThreadsKey;
      readonly selectedMarker: MarkerIndex | null;
      readonly context: SelectionContext;
    }
  | {
      readonly type: 'CHANGE_SELECTED_NETWORK_MARKER';
      readonly threadsKey: ThreadsKey;
      readonly selectedNetworkMarker: MarkerIndex | null;
      readonly context: SelectionContext;
    }
  | {
      readonly type: 'CHANGE_RIGHT_CLICKED_MARKER';
      readonly threadsKey: ThreadsKey;
      readonly markerIndex: MarkerIndex | null;
    }
  | {
      readonly type: 'CHANGE_HOVERED_MARKER';
      readonly threadsKey: ThreadsKey;
      readonly markerIndex: MarkerIndex | null;
    }
  | {
      readonly type: 'UPDATE_PREVIEW_SELECTION';
      readonly previewSelection: PreviewSelection | null;
    }
  | {
      readonly type: 'CHANGE_SELECTED_ZIP_FILE';
      readonly selectedZipFileIndex: IndexIntoZipFileTable | null;
    }
  | {
      readonly type: 'CHANGE_EXPANDED_ZIP_FILES';
      readonly expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>;
    }
  | {
      readonly type: 'CHANGE_GLOBAL_TRACK_ORDER';
      readonly globalTrackOrder: TrackIndex[];
    }
  | {
      readonly type: 'HIDE_GLOBAL_TRACK';
      readonly trackIndex: TrackIndex;
      readonly pid: Pid | null;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
    }
  | {
      readonly type: 'SHOW_ALL_TRACKS';
    }
  | {
      readonly type: 'SHOW_PROVIDED_TRACKS';
      readonly globalTracksToShow: Set<TrackIndex>;
      readonly localTracksByPidToShow: Map<Pid, Set<TrackIndex>>;
    }
  | {
      readonly type: 'HIDE_PROVIDED_TRACKS';
      readonly globalTracksToHide: Set<TrackIndex>;
      readonly localTracksByPidToHide: Map<Pid, Set<TrackIndex>>;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
    }
  | {
      readonly type: 'SHOW_GLOBAL_TRACK';
      readonly trackIndex: TrackIndex;
    }
  | {
      readonly type: 'SHOW_GLOBAL_TRACK_INCLUDING_LOCAL_TRACKS';
      readonly trackIndex: TrackIndex;
      readonly pid: Pid;
    }
  | {
      // Isolate only the process track, and not the local tracks.
      readonly type: 'ISOLATE_PROCESS';
      readonly hiddenGlobalTracks: Set<TrackIndex>;
      readonly isolatedTrackIndex: TrackIndex;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
    }
  | {
      // Isolate the process track, and hide the local tracks.
      readonly type: 'ISOLATE_PROCESS_MAIN_THREAD';
      readonly pid: Pid;
      readonly hiddenGlobalTracks: Set<TrackIndex>;
      readonly isolatedTrackIndex: TrackIndex;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
      readonly hiddenLocalTracks: Set<TrackIndex>;
    }
  | {
      // Isolate only the screenshot track
      readonly type: 'ISOLATE_SCREENSHOT_TRACK';
      readonly hiddenGlobalTracks: Set<TrackIndex>;
    }
  | {
      readonly type: 'CHANGE_LOCAL_TRACK_ORDER';
      readonly localTrackOrder: TrackIndex[];
      readonly pid: Pid;
    }
  | {
      readonly type: 'HIDE_LOCAL_TRACK';
      readonly pid: Pid;
      readonly trackIndex: TrackIndex;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
    }
  | {
      readonly type: 'SHOW_LOCAL_TRACK';
      readonly pid: Pid;
      readonly trackIndex: TrackIndex;
    }
  | {
      readonly type: 'ISOLATE_LOCAL_TRACK';
      readonly pid: Pid;
      readonly hiddenGlobalTracks: Set<TrackIndex>;
      readonly hiddenLocalTracks: Set<TrackIndex>;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
    }
  | {
      readonly type: 'SET_CONTEXT_MENU_VISIBILITY';
      readonly isVisible: boolean;
    }
  | {
      readonly type: 'INCREMENT_PANEL_LAYOUT_GENERATION';
    }
  | { readonly type: 'HAS_ZOOMED_VIA_MOUSEWHEEL' }
  | { readonly type: 'DISMISS_NEWLY_PUBLISHED' }
  | {
      readonly type: 'ENABLE_EVENT_DELAY_TRACKS';
      readonly localTracksByPid: Map<Pid, LocalTrack[]>;
      readonly localTrackOrderByPid: Map<Pid, TrackIndex[]>;
    }
  | {
      readonly type: 'ENABLE_EXPERIMENTAL_CPU_GRAPHS';
    }
  | {
      readonly type: 'ENABLE_EXPERIMENTAL_PROCESS_CPU_TRACKS';
      readonly localTracksByPid: Map<Pid, LocalTrack[]>;
      readonly localTrackOrderByPid: Map<Pid, TrackIndex[]>;
    }
  | {
      readonly type: 'UPDATE_BOTTOM_BOX';
      readonly libIndex: IndexIntoLibs | null;
      readonly sourceFile: string | null;
      readonly nativeSymbol: NativeSymbolInfo | null;
      readonly allNativeSymbolsForInitiatingCallNode: NativeSymbolInfo[];
      readonly currentTab: TabSlug;
      readonly shouldOpenBottomBox: boolean;
      readonly shouldOpenAssemblyView: boolean;
    }
  | {
      readonly type: 'OPEN_ASSEMBLY_VIEW';
    }
  | {
      readonly type: 'CLOSE_ASSEMBLY_VIEW';
    }
  | {
      readonly type: 'CLOSE_BOTTOM_BOX_FOR_TAB';
      readonly tab: TabSlug;
    };

type ReceiveProfileAction =
  | {
      readonly type: 'BULK_SYMBOLICATION';
      readonly symbolicatedThreads: RawThread[];
      readonly oldFuncToNewFuncsMaps: Map<ThreadIndex, FuncToFuncsMap>;
    }
  | {
      readonly type: 'DONE_SYMBOLICATING';
    }
  | {
      readonly type: 'TEMPORARY_ERROR';
      readonly error: TemporaryError;
    }
  | {
      readonly type: 'FATAL_ERROR';
      readonly error: Error;
    }
  | {
      readonly type: 'PROFILE_LOADED';
      readonly profile: Profile;
      readonly pathInZipFile: string | null;
      readonly implementationFilter: ImplementationFilter | null;
      readonly transformStacks: TransformStacksPerThread | null;
    }
  | {
      readonly type: 'VIEW_FULL_PROFILE';
      readonly selectedThreadIndexes: Set<ThreadIndex>;
      readonly globalTracks: GlobalTrack[];
      readonly globalTrackOrder: TrackIndex[];
      readonly hiddenGlobalTracks: Set<TrackIndex>;
      readonly localTracksByPid: Map<Pid, LocalTrack[]>;
      readonly hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>;
      readonly localTrackOrderByPid: Map<Pid, TrackIndex[]>;
      readonly timelineType: TimelineType | null;
      readonly selectedTab: TabSlug;
    }
  | {
      readonly type: 'DATA_RELOAD';
    }
  | { readonly type: 'RECEIVE_ZIP_FILE'; readonly zip: JSZip }
  | {
      readonly type: 'PROCESS_PROFILE_FROM_ZIP_FILE';
      readonly pathInZipFile: string;
    }
  | {
      readonly type: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE';
      readonly error: any;
    }
  | { readonly type: 'DISMISS_PROCESS_PROFILE_FROM_ZIP_ERROR' }
  | { readonly type: 'RETURN_TO_ZIP_FILE_LIST' }
  | {
      readonly type: 'FILE_NOT_FOUND_IN_ZIP_FILE';
      readonly pathInZipFile: string;
    }
  | {
      readonly type: 'REQUESTING_SYMBOL_TABLE';
      readonly requestedLib: RequestedLib;
    }
  | {
      readonly type: 'RECEIVED_SYMBOL_TABLE_REPLY';
      readonly requestedLib: RequestedLib;
    }
  | { readonly type: 'START_SYMBOLICATING' }
  | { readonly type: 'WAITING_FOR_PROFILE_FROM_BROWSER' }
  | { readonly type: 'WAITING_FOR_PROFILE_FROM_STORE' }
  | {
      readonly type: 'WAITING_FOR_PROFILE_FROM_URL';
      readonly profileUrl: string | null;
    }
  | { readonly type: 'TRIGGER_LOADING_FROM_URL'; readonly profileUrl: string }
  | {
      readonly type: 'UPDATE_PAGES';
      readonly newPages: PageList;
    };

type UrlEnhancerAction =
  | { readonly type: 'START_FETCHING_PROFILES' }
  | { readonly type: 'URL_SETUP_DONE' }
  | {
      readonly type: 'UPDATE_URL_STATE';
      readonly newUrlState: UrlState | null;
    };

type UrlStateAction =
  | { readonly type: 'WAITING_FOR_PROFILE_FROM_FILE' }
  | {
      readonly type: 'PROFILE_PUBLISHED';
      readonly hash: string;
      readonly profileName: string;
      readonly prePublishedState: State | null;
    }
  | { readonly type: 'CHANGE_SELECTED_TAB'; readonly selectedTab: TabSlug }
  | {
      readonly type: 'COMMIT_RANGE';
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly type: 'POP_COMMITTED_RANGES';
      readonly firstPoppedFilterIndex: number;
      readonly committedRange: StartEndRange | false;
    }
  | {
      readonly type: 'CHANGE_SELECTED_THREAD';
      readonly selectedThreadIndexes: Set<ThreadIndex>;
    }
  | {
      readonly type: 'SELECT_TRACK';
      readonly lastNonShiftClickInformation: LastNonShiftClickInformation | null;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
      readonly selectedTab: TabSlug;
    }
  | {
      readonly type: 'CHANGE_RIGHT_CLICKED_TRACK';
      readonly trackReference: TrackReference | null;
    }
  | {
      readonly type: 'CHANGE_CALL_TREE_SEARCH_STRING';
      readonly searchString: string;
    }
  | {
      readonly type: 'ADD_TRANSFORM_TO_STACK';
      readonly threadsKey: ThreadsKey;
      readonly transform: Transform;
      readonly transformedThread: Thread;
      readonly callNodeInfo: CallNodeInfo;
    }
  | {
      readonly type: 'POP_TRANSFORMS_FROM_STACK';
      readonly threadsKey: ThreadsKey;
      readonly firstPoppedFilterIndex: number;
    }
  | {
      readonly type: 'CHANGE_TIMELINE_TYPE';
      readonly timelineType: TimelineType;
    }
  | {
      readonly type: 'CHANGE_IMPLEMENTATION_FILTER';
      readonly threadsKey: ThreadsKey;
      readonly transformedThread: Thread;
      readonly previousImplementation: ImplementationFilter;
      readonly implementation: ImplementationFilter;
    }
  | {
      readonly type: 'CHANGE_CALL_TREE_SUMMARY_STRATEGY';
      readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
    }
  | {
      readonly type: 'CHANGE_INVERT_CALLSTACK';
      readonly invertCallstack: boolean;
      readonly newSelectedCallNodePath: CallNodePath;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
    }
  | {
      readonly type: 'CHANGE_SHOW_USER_TIMINGS';
      readonly showUserTimings: boolean;
    }
  | {
      readonly type: 'CHANGE_STACK_CHART_SAME_WIDTHS';
      readonly stackChartSameWidths: boolean;
    }
  | {
      readonly type: 'CHANGE_SHOW_JS_TRACER_SUMMARY';
      readonly showSummary: boolean;
    }
  | {
      readonly type: 'CHANGE_MARKER_SEARCH_STRING';
      readonly searchString: string;
    }
  | {
      readonly type: 'CHANGE_NETWORK_SEARCH_STRING';
      readonly searchString: string;
    }
  | { readonly type: 'CHANGE_PROFILES_TO_COMPARE'; readonly profiles: string[] }
  | {
      readonly type: 'CHANGE_PROFILE_NAME';
      readonly profileName: string | null;
    }
  | {
      readonly type: 'SANITIZED_PROFILE_PUBLISHED';
      readonly hash: string;
      readonly committedRanges: StartEndRange[] | null;
      readonly oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex> | null;
      readonly profileName: string;
      readonly prePublishedState: State | null;
    }
  | {
      readonly type: 'SET_DATA_SOURCE';
      readonly dataSource: DataSource;
    }
  | {
      readonly type: 'CHANGE_MOUSE_TIME_POSITION';
      readonly mouseTimePosition: Milliseconds | null;
    }
  | {
      readonly type: 'CHANGE_TABLE_VIEW_OPTIONS';
      readonly tab: TabSlug;
      readonly tableViewOptions: TableViewOptions;
    }
  | {
      readonly type: 'TOGGLE_RESOURCES_PANEL';
      readonly selectedThreadIndexes: Set<ThreadIndex>;
    }
  | {
      readonly type: 'PROFILE_REMOTELY_DELETED';
    }
  | {
      readonly type: 'TOGGLE_SIDEBAR_OPEN_CATEGORY';
      readonly kind: string;
      readonly category: IndexIntoCategoryList;
    }
  | {
      readonly type: 'CHANGE_TAB_FILTER';
      readonly tabID: TabID | null;
      readonly selectedThreadIndexes: Set<ThreadIndex>;
      readonly globalTracks: GlobalTrack[];
      readonly globalTrackOrder: TrackIndex[];
      readonly hiddenGlobalTracks: Set<TrackIndex>;
      readonly localTracksByPid: Map<Pid, LocalTrack[]>;
      readonly hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>;
      readonly localTrackOrderByPid: Map<Pid, TrackIndex[]>;
      readonly selectedTab: TabSlug;
    };

export type IconWithClassName = {
  readonly icon: string;
  readonly className: string;
};
type IconsAction =
  | {
      readonly type: 'ICON_HAS_LOADED';
      readonly iconWithClassName: IconWithClassName;
    }
  | { readonly type: 'ICON_IN_ERROR'; readonly icon: string }
  | { readonly type: 'ICON_BATCH_ADD'; icons: IconWithClassName[] };

type SidebarAction = {
  readonly type: 'CHANGE_SIDEBAR_OPEN_STATE';
  readonly tab: TabSlug;
  readonly isOpen: boolean;
};

type PublishAction =
  | {
      readonly type: 'TOGGLE_CHECKED_SHARING_OPTION';
      readonly slug: keyof CheckedSharingOptions;
    }
  | {
      readonly type: 'UPLOAD_STARTED';
    }
  | {
      readonly type: 'UPDATE_UPLOAD_PROGRESS';
      readonly uploadProgress: number;
    }
  | {
      readonly type: 'UPLOAD_FAILED';
      readonly error: unknown;
    }
  | {
      readonly type: 'UPLOAD_ABORTED';
    }
  | {
      readonly type: 'UPLOAD_RESET';
    }
  | {
      readonly type: 'UPLOAD_COMPRESSION_STARTED';
      readonly abortFunction: () => void;
    }
  | {
      readonly type: 'CHANGE_UPLOAD_STATE';
      readonly changes: Partial<UploadState>;
    }
  | {
      readonly type: 'REVERT_TO_PRE_PUBLISHED_STATE';
      readonly prePublishedState: State;
    }
  | { readonly type: 'HIDE_STALE_PROFILE' };

type DragAndDropAction =
  | {
      readonly type: 'START_DRAGGING';
    }
  | {
      readonly type: 'STOP_DRAGGING';
    }
  | {
      readonly type: 'REGISTER_DRAG_AND_DROP_OVERLAY';
    }
  | {
      readonly type: 'UNREGISTER_DRAG_AND_DROP_OVERLAY';
    };

type CurrentProfileUploadedInformationAction = {
  readonly type: 'SET_CURRENT_PROFILE_UPLOADED_INFORMATION';
  readonly uploadedProfileInformation: UploadedProfileInformation | null;
};

type SourcesAction =
  | {
      readonly type: 'SOURCE_CODE_LOADING_BEGIN_URL';
      readonly file: string;
      readonly url: string;
    }
  | {
      readonly type: 'SOURCE_CODE_LOADING_BEGIN_BROWSER_CONNECTION';
      readonly file: string;
    }
  | {
      readonly type: 'SOURCE_CODE_LOADING_SUCCESS';
      readonly file: string;
      readonly code: string;
    }
  | {
      readonly type: 'SOURCE_CODE_LOADING_ERROR';
      readonly file: string;
      readonly errors: SourceCodeLoadingError[];
    };

// nativeSymbolKey == `${lib.debugName}/${lib.breakpadID}/${nativeSymbolInfo.address.toString(16)}`

type AssemblyAction =
  | {
      readonly type: 'ASSEMBLY_CODE_LOADING_BEGIN_URL';
      readonly nativeSymbolKey: string;
      readonly url: string;
    }
  | {
      readonly type: 'ASSEMBLY_CODE_LOADING_BEGIN_BROWSER_CONNECTION';
      readonly nativeSymbolKey: string;
    }
  | {
      readonly type: 'ASSEMBLY_CODE_LOADING_SUCCESS';
      readonly nativeSymbolKey: string;
      readonly instructions: DecodedInstruction[];
    }
  | {
      readonly type: 'ASSEMBLY_CODE_LOADING_ERROR';
      readonly nativeSymbolKey: string;
      readonly errors: ApiQueryError[];
    };

type AppAction = {
  readonly type: 'UPDATE_BROWSER_CONNECTION_STATUS';
  readonly browserConnectionStatus: BrowserConnectionStatus;
};

export type Action =
  | ProfileAction
  | ReceiveProfileAction
  | SidebarAction
  | UrlEnhancerAction
  | UrlStateAction
  | IconsAction
  | PublishAction
  | DragAndDropAction
  | CurrentProfileUploadedInformationAction
  | SourcesAction
  | AssemblyAction
  | AppAction;
