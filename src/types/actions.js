/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { CallTree } from '../profile-logic/call-tree';
import type JSZip from 'jszip';
import type {
  Profile,
  Thread,
  ThreadIndex,
  Pid,
  BrowsingContextID,
} from './profile';
import type {
  CallNodePath,
  CallNodeTable,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
  MarkerIndex,
  ActiveTabGlobalTrack,
  OriginsTimeline,
  ActiveTabResourceTrack,
} from './profile-derived';
import type { FuncToFuncMap } from '../profile-logic/symbolication';
import type { TemporaryError } from '../utils/errors';
import type { Transform, TransformStacksPerThread } from './transforms';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { UrlState, UploadState, State } from './state';
import type { CssPixels, StartEndRange } from './units';

export type DataSource =
  | 'none'
  | 'from-file'
  | 'from-addon'
  | 'local'
  | 'public'
  | 'from-url'
  | 'compare';
export type TimelineType = 'stack' | 'category';
export type PreviewSelection =
  | {| +hasSelection: false, +isModifying: false |}
  | {|
      +hasSelection: true,
      +isModifying: boolean,
      +selectionStart: number,
      +selectionEnd: number,
    |};

/**
 * The counts for how many tracks are hidden in the timeline.
 */
export type HiddenTrackCount = {|
  +hidden: number,
  +total: number,
|};

/**
 * A TrackReference uniquely identifies a track.
 * Note that TrackIndexes aren't globally unique: they're unique among global
 * tracks, and they're unique among local tracks for a specific Pid.
 */
export type GlobalTrackReference = {|
  +type: 'global',
  +trackIndex: TrackIndex,
|};
export type LocalTrackReference = {|
  +type: 'local',
  +trackIndex: TrackIndex,
  +pid: Pid,
|};

export type TrackReference = GlobalTrackReference | LocalTrackReference;

/**
 * Active tab track references
 * A TrackReference uniquely identifies a track.
 */
export type ActiveTabGlobalTrackReference = {|
  +type: 'global',
  +trackIndex: TrackIndex,
|};
export type ActiveTabResourceTrackReference = {|
  +type: 'resource',
  +trackIndex: TrackIndex,
|};

export type ActiveTabTrackReference =
  | ActiveTabGlobalTrackReference
  | ActiveTabResourceTrackReference;

export type RequestedLib = {|
  +debugName: string,
  +breakpadId: string,
|};
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
export type CheckedSharingOptions = {|
  // The following values are for including more information in a sanitized profile.
  includeHiddenThreads: boolean,
  includeFullTimeRange: boolean,
  includeScreenshots: boolean,
  includeUrls: boolean,
  includeExtension: boolean,
  includePreferenceValues: boolean,
|};

//to display loading state while importing profile from addon
type LoadingStateAction = {|
      +type : 'CHANGE_LOAD_PROGRESS',
      +step:LoadingStep,
      +progress:number,
|};

type ProfileAction =
  | {|
      +type: 'ROUTE_NOT_FOUND',
      +url: string,
    |}
  | {|
      +type: 'ASSIGN_TASK_TRACER_NAMES',
      +addressIndices: number[],
      +symbolNames: string[],
    |}
  | {|
      +type: 'CHANGE_SELECTED_CALL_NODE',
      +threadIndex: ThreadIndex,
      +selectedCallNodePath: CallNodePath,
      +optionalExpandedToCallNodePath: ?CallNodePath,
    |}
  | {|
      +type: 'UPDATE_TRACK_THREAD_HEIGHT',
      +height: CssPixels,
      +threadIndex: ThreadIndex,
    |}
  | {|
      +type: 'CHANGE_RIGHT_CLICKED_CALL_NODE',
      +threadIndex: ThreadIndex,
      +callNodePath: CallNodePath | null,
    |}
  | {|
      +type: 'FOCUS_CALL_TREE',
    |}
  | {|
      +type: 'CHANGE_EXPANDED_CALL_NODES',
      +threadIndex: ThreadIndex,
      +expandedCallNodePaths: Array<CallNodePath>,
    |}
  | {|
      +type: 'CHANGE_SELECTED_MARKER',
      +threadIndex: ThreadIndex,
      +selectedMarker: MarkerIndex | null,
    |}
  | {|
      +type: 'CHANGE_RIGHT_CLICKED_MARKER',
      +threadIndex: ThreadIndex,
      +markerIndex: MarkerIndex | null,
    |}
  | {|
      +type: 'UPDATE_PREVIEW_SELECTION',
      +previewSelection: PreviewSelection,
    |}
  | {|
      +type: 'CHANGE_SELECTED_ZIP_FILE',
      +selectedZipFileIndex: IndexIntoZipFileTable | null,
    |}
  | {|
      +type: 'CHANGE_EXPANDED_ZIP_FILES',
      +expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>,
    |}
  | {|
      +type: 'CHANGE_GLOBAL_TRACK_ORDER',
      +globalTrackOrder: TrackIndex[],
    |}
  | {|
      +type: 'HIDE_GLOBAL_TRACK',
      +trackIndex: TrackIndex,
      +selectedThreadIndex: ThreadIndex,
    |}
  | {|
      +type: 'SHOW_GLOBAL_TRACK',
      +trackIndex: TrackIndex,
    |}
  | {|
      // Isolate only the process track, and not the local tracks.
      +type: 'ISOLATE_PROCESS',
      +hiddenGlobalTracks: Set<TrackIndex>,
      +isolatedTrackIndex: TrackIndex,
      +selectedThreadIndex: ThreadIndex,
    |}
  | {|
      // Isolate the process track, and hide the local tracks.
      type: 'ISOLATE_PROCESS_MAIN_THREAD',
      pid: Pid,
      hiddenGlobalTracks: Set<TrackIndex>,
      isolatedTrackIndex: TrackIndex,
      selectedThreadIndex: ThreadIndex,
      hiddenLocalTracks: Set<TrackIndex>,
    |}
  | {|
      // Isolate only the screenshot track
      +type: 'ISOLATE_SCREENSHOT_TRACK',
      +hiddenGlobalTracks: Set<TrackIndex>,
    |}
  | {|
      +type: 'CHANGE_LOCAL_TRACK_ORDER',
      +localTrackOrder: TrackIndex[],
      +pid: Pid,
    |}
  | {|
      +type: 'HIDE_LOCAL_TRACK',
      +pid: Pid,
      +trackIndex: TrackIndex,
      +selectedThreadIndex: ThreadIndex,
    |}
  | {|
      +type: 'SHOW_LOCAL_TRACK',
      +pid: Pid,
      +trackIndex: TrackIndex,
    |}
  | {|
      +type: 'ISOLATE_LOCAL_TRACK',
      +pid: Pid,
      +hiddenGlobalTracks: Set<TrackIndex>,
      +hiddenLocalTracks: Set<TrackIndex>,
      +selectedThreadIndex: ThreadIndex,
    |}
  | {|
      +type: 'SET_CONTEXT_MENU_VISIBILITY',
      +isVisible: boolean,
    |}
  | {|
      +type: 'INCREMENT_PANEL_LAYOUT_GENERATION',
    |}
  | {| +type: 'HAS_ZOOMED_VIA_MOUSEWHEEL' |}
  | {| +type: 'DISMISS_NEWLY_PUBLISHED' |};

type ReceiveProfileAction =
  | {|
      +type: 'BULK_SYMBOLICATION',
      +symbolicatedThreads: Thread[],
      +oldFuncToNewFuncMaps: Map<ThreadIndex, FuncToFuncMap>,
    |}
  | {|
      +type: 'DONE_SYMBOLICATING',
    |}
  | {|
      +type: 'TEMPORARY_ERROR',
      +error: TemporaryError,
    |}
  | {|
      +type: 'FATAL_ERROR',
      +error: Error,
    |}
  | {|
      +type: 'PROFILE_LOADED',
      +profile: Profile,
      +pathInZipFile: ?string,
      +implementationFilter: ?ImplementationFilter,
      +transformStacks: ?TransformStacksPerThread,
    |}
  | {|
      +type: 'VIEW_FULL_PROFILE',
      +selectedThreadIndex: ThreadIndex,
      +globalTracks: GlobalTrack[],
      +globalTrackOrder: TrackIndex[],
      +hiddenGlobalTracks: Set<TrackIndex>,
      +localTracksByPid: Map<Pid, LocalTrack[]>,
      +hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
      +localTrackOrderByPid: Map<Pid, TrackIndex[]>,
      +showTabOnly?: BrowsingContextID | null,
    |}
  | {|
      +type: 'VIEW_ORIGINS_PROFILE',
      +selectedThreadIndex: ThreadIndex,
      +originsTimeline: OriginsTimeline,
    |}
  | {|
      +type: 'VIEW_ACTIVE_TAB_PROFILE',
      +selectedThreadIndex: ThreadIndex,
      +globalTracks: ActiveTabGlobalTrack[],
      +resourceTracks: ActiveTabResourceTrack[],
      +browsingContextID: BrowsingContextID,
    |}
  | {|
      +type: 'DATA_RELOAD',
    |}
  | {| +type: 'RECEIVE_ZIP_FILE', +zip: JSZip |}
  | {| +type: 'PROCESS_PROFILE_FROM_ZIP_FILE', +pathInZipFile: string |}
  | {| +type: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE', +error: any |}
  | {| +type: 'DISMISS_PROCESS_PROFILE_FROM_ZIP_ERROR' |}
  | {| +type: 'RETURN_TO_ZIP_FILE_LIST' |}
  | {| +type: 'FILE_NOT_FOUND_IN_ZIP_FILE', +pathInZipFile: string |}
  | {| +type: 'REQUESTING_SYMBOL_TABLE', +requestedLib: RequestedLib |}
  | {| +type: 'RECEIVED_SYMBOL_TABLE_REPLY', +requestedLib: RequestedLib |}
  | {| +type: 'START_SYMBOLICATING' |}
  | {| +type: 'WAITING_FOR_PROFILE_FROM_ADDON' |}
  | {| +type: 'WAITING_FOR_PROFILE_FROM_STORE' |}
  | {| +type: 'WAITING_FOR_PROFILE_FROM_URL', +profileUrl: ?string |}
  | {| +type: 'TRIGGER_LOADING_FROM_URL', +profileUrl: string |};

type UrlEnhancerAction =
  | {| +type: 'START_FETCHING_PROFILES' |}
  | {| +type: 'URL_SETUP_DONE' |}
  | {| +type: 'UPDATE_URL_STATE', +newUrlState: UrlState | null |};

type UrlStateAction =
  | {| +type: 'WAITING_FOR_PROFILE_FROM_FILE' |}
  | {|
      +type: 'PROFILE_PUBLISHED',
      +hash: string,
      +prePublishedState: State | null,
    |}
  | {| +type: 'CHANGE_SELECTED_TAB', +selectedTab: TabSlug |}
  | {| +type: 'COMMIT_RANGE', +start: number, +end: number |}
  | {| +type: 'POP_COMMITTED_RANGES', +firstPoppedFilterIndex: number |}
  | {| +type: 'CHANGE_SELECTED_THREAD', +selectedThreadIndex: ThreadIndex |}
  | {|
      +type: 'SELECT_TRACK',
      +selectedThreadIndex: ThreadIndex,
      +selectedTab: TabSlug,
    |}
  | {|
      +type: 'CHANGE_RIGHT_CLICKED_TRACK',
      +trackReference: TrackReference | null,
    |}
  | {| +type: 'CHANGE_CALL_TREE_SEARCH_STRING', +searchString: string |}
  | {|
      +type: 'ADD_TRANSFORM_TO_STACK',
      +threadIndex: ThreadIndex,
      +transform: Transform,
      +transformedThread: Thread,
    |}
  | {|
      +type: 'POP_TRANSFORMS_FROM_STACK',
      +threadIndex: ThreadIndex,
      +firstPoppedFilterIndex: number,
    |}
  | {|
      +type: 'CHANGE_TIMELINE_TYPE',
      +timelineType: TimelineType,
    |}
  | {|
      +type: 'CHANGE_IMPLEMENTATION_FILTER',
      +implementation: ImplementationFilter,
      +threadIndex: ThreadIndex,
      +transformedThread: Thread,
      +previousImplementation: ImplementationFilter,
      +implementation: ImplementationFilter,
    |}
  | {|
      type: 'CHANGE_CALL_TREE_SUMMARY_STRATEGY',
      callTreeSummaryStrategy: CallTreeSummaryStrategy,
    |}
  | {|
      +type: 'CHANGE_INVERT_CALLSTACK',
      +invertCallstack: boolean,
      +callTree: CallTree,
      +callNodeTable: CallNodeTable,
      +selectedThreadIndex: ThreadIndex,
    |}
  | {|
      +type: 'CHANGE_SHOW_USER_TIMINGS',
      +showUserTimings: boolean,
    |}
  | {|
      +type: 'CHANGE_SHOW_JS_TRACER_SUMMARY',
      +showSummary: boolean,
    |}
  | {| +type: 'CHANGE_MARKER_SEARCH_STRING', +searchString: string |}
  | {| +type: 'CHANGE_NETWORK_SEARCH_STRING', +searchString: string |}
  | {| +type: 'CHANGE_PROFILES_TO_COMPARE', +profiles: string[] |}
  | {| +type: 'CHANGE_PROFILE_NAME', +profileName: string |}
  | {|
      +type: 'SANITIZED_PROFILE_PUBLISHED',
      +hash: string,
      +committedRanges: StartEndRange[] | null,
      +oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex> | null,
      +prePublishedState: State,
    |}
  | {|
      +type: 'SET_DATA_SOURCE',
      +dataSource: DataSource,
    |}
  | {|
      +type: 'TOGGLE_RESOURCES_PANEL',
      +selectedThreadIndex: ThreadIndex,
    |};

type IconsAction =
  | {| +type: 'ICON_HAS_LOADED', +icon: string |}
  | {| +type: 'ICON_IN_ERROR', +icon: string |};

type SidebarAction = {|
  +type: 'CHANGE_SIDEBAR_OPEN_STATE',
  +tab: TabSlug,
  +isOpen: boolean,
|};

type PublishAction =
  | {|
      +type: 'TOGGLE_CHECKED_SHARING_OPTION',
      +slug: $Keys<CheckedSharingOptions>,
    |}
  | {|
      +type: 'UPLOAD_STARTED',
      +abortFunction: () => void,
    |}
  | {|
      +type: 'UPDATE_UPLOAD_PROGRESS',
      +uploadProgress: number,
    |}
  | {|
      +type: 'UPLOAD_FAILED',
      +error: mixed,
    |}
  | {|
      +type: 'UPLOAD_ABORTED',
    |}
  | {|
      +type: 'UPLOAD_RESET',
    |}
  | {|
      +type: 'UPLOAD_COMPRESSION_STARTED',
    |}
  | {|
      +type: 'CHANGE_UPLOAD_STATE',
      +changes: $Shape<UploadState>,
    |}
  | {|
      +type: 'REVERT_TO_PRE_PUBLISHED_STATE',
      +prePublishedState: State,
    |}
  | {| +type: 'HIDE_STALE_PROFILE' |};

type DragAndDropAction =
  | {|
      +type: 'START_DRAGGING',
    |}
  | {|
      +type: 'STOP_DRAGGING',
    |}
  | {|
      +type: 'REGISTER_DRAG_AND_DROP_OVERLAY',
    |}
  | {|
      +type: 'UNREGISTER_DRAG_AND_DROP_OVERLAY',
    |};

export type Action =
  | ProfileAction
  | ReceiveProfileAction
  | SidebarAction
  | UrlEnhancerAction
  | UrlStateAction
  | IconsAction
  | PublishAction
  | DragAndDropAction
  | LoadingStateAction;
