/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { CallTree } from '../profile-logic/call-tree';
import { ReactLocalization } from '@fluent/react';
import type JSZip from 'jszip';
import type { Profile, Thread, ThreadIndex, Pid, TabID } from './profile';
import type {
  CallNodePath,
  CallNodeTable,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
  MarkerIndex,
  OriginsTimeline,
  ActiveTabTimeline,
  ThreadsKey,
} from './profile-derived';
import type { FuncToFuncMap } from '../profile-logic/symbolication';
import type { TemporaryError } from '../utils/errors';
import type { Transform, TransformStacksPerThread } from './transforms';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { TabSlug } from '../app-logic/tabs-handling';
import type {
  UrlState,
  UploadState,
  State,
  UploadedProfileInformation,
  SourceTab,
} from './state';
import type { CssPixels, StartEndRange, Milliseconds } from './units';
import { string } from 'prop-types';

export type DataSource =
  | 'none'
  // This is used when the profile is loaded from a local file, via drag and
  // drop or via a file input. Reloading a URL with this data source cannot
  // work automatically because the file would need to be picked again.
  | 'from-file'
  // This datasource is used to fetch a profile from Firefox via a frame script.
  // This is the first entry-point when a profile is captured in the browser.
  | 'from-browser'
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

export type Localization = ReactLocalization;

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
      +threadsKey: ThreadsKey,
      +selectedCallNodePath: CallNodePath,
      +optionalExpandedToCallNodePath: ?CallNodePath,
    |}
  | {|
      +type: 'UPDATE_TRACK_THREAD_HEIGHT',
      +height: CssPixels,
      +threadsKey: ThreadsKey,
    |}
  | {|
      +type: 'CHANGE_RIGHT_CLICKED_CALL_NODE',
      +threadsKey: ThreadsKey,
      +callNodePath: CallNodePath | null,
    |}
  | {|
      +type: 'FOCUS_CALL_TREE',
    |}
  | {|
      +type: 'CHANGE_EXPANDED_CALL_NODES',
      +threadsKey: ThreadsKey,
      +expandedCallNodePaths: Array<CallNodePath>,
    |}
  | {|
      +type: 'CHANGE_SELECTED_MARKER',
      +threadsKey: ThreadsKey,
      +selectedMarker: MarkerIndex | null,
    |}
  | {|
      +type: 'CHANGE_SELECTED_NETWORK_MARKER',
      +threadsKey: ThreadsKey,
      +selectedNetworkMarker: MarkerIndex | null,
    |}
  | {|
      +type: 'CHANGE_RIGHT_CLICKED_MARKER',
      +threadsKey: ThreadsKey,
      +markerIndex: MarkerIndex | null,
    |}
  | {|
      +type: 'CHANGE_HOVERED_MARKER',
      +threadsKey: ThreadsKey,
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
      +selectedThreadIndexes: Set<ThreadIndex>,
    |}
  | {|
      +type: 'SHOW_ALL_TRACKS',
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
      +selectedThreadIndexes: Set<ThreadIndex>,
    |}
  | {|
      // Isolate the process track, and hide the local tracks.
      type: 'ISOLATE_PROCESS_MAIN_THREAD',
      pid: Pid,
      hiddenGlobalTracks: Set<TrackIndex>,
      isolatedTrackIndex: TrackIndex,
      selectedThreadIndexes: Set<ThreadIndex>,
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
      +selectedThreadIndexes: Set<ThreadIndex>,
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
      +selectedThreadIndexes: Set<ThreadIndex>,
    |}
  | {|
      +type: 'SET_CONTEXT_MENU_VISIBILITY',
      +isVisible: boolean,
    |}
  | {|
      +type: 'INCREMENT_PANEL_LAYOUT_GENERATION',
    |}
  | {| +type: 'HAS_ZOOMED_VIA_MOUSEWHEEL' |}
  | {| +type: 'DISMISS_NEWLY_PUBLISHED' |}
  | {|
      +type: 'ENABLE_EVENT_DELAY_TRACKS',
      +localTracksByPid: Map<Pid, LocalTrack[]>,
      +localTrackOrderByPid: Map<Pid, TrackIndex[]>,
    |}
  | {|
      +type: 'ENABLE_EXPERIMENTAL_CPU_GRAPHS',
    |}
  | {|
      +type: 'CREATE_SOURCE_TAB_IF_NEEDED_AND_SELECT',
      +tab: SourceTab,
    |};

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
      +selectedThreadIndexes: Set<ThreadIndex>,
      +globalTracks: GlobalTrack[],
      +globalTrackOrder: TrackIndex[],
      +hiddenGlobalTracks: Set<TrackIndex>,
      +localTracksByPid: Map<Pid, LocalTrack[]>,
      +hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
      +localTrackOrderByPid: Map<Pid, TrackIndex[]>,
      +timelineType: TimelineType | null,
    |}
  | {|
      +type: 'VIEW_ORIGINS_PROFILE',
      +selectedThreadIndexes: Set<ThreadIndex>,
      +originsTimeline: OriginsTimeline,
    |}
  | {|
      +type: 'VIEW_ACTIVE_TAB_PROFILE',
      +selectedThreadIndexes: Set<ThreadIndex>,
      +activeTabTimeline: ActiveTabTimeline,
      +tabID: TabID | null,
      +timelineType: TimelineType | null,
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
  | {| +type: 'WAITING_FOR_PROFILE_FROM_BROWSER' |}
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
      +profileName: string,
      +prePublishedState: State | null,
    |}
  | {| +type: 'CHANGE_SELECTED_TAB', +selectedTab: TabSlug |}
  | {| +type: 'COMMIT_RANGE', +start: number, +end: number |}
  | {| +type: 'POP_COMMITTED_RANGES', +firstPoppedFilterIndex: number |}
  | {|
      +type: 'CHANGE_SELECTED_THREAD',
      +selectedThreadIndexes: Set<ThreadIndex>,
    |}
  | {|
      +type: 'SELECT_TRACK',
      +selectedThreadIndexes: Set<ThreadIndex>,
      +selectedTab: TabSlug,
    |}
  | {|
      +type: 'CHANGE_RIGHT_CLICKED_TRACK',
      +trackReference: TrackReference | null,
    |}
  | {| +type: 'CHANGE_CALL_TREE_SEARCH_STRING', +searchString: string |}
  | {|
      +type: 'ADD_TRANSFORM_TO_STACK',
      +threadsKey: ThreadsKey,
      +transform: Transform,
      +transformedThread: Thread,
    |}
  | {|
      +type: 'POP_TRANSFORMS_FROM_STACK',
      +threadsKey: ThreadsKey,
      +firstPoppedFilterIndex: number,
    |}
  | {|
      +type: 'CHANGE_TIMELINE_TYPE',
      +timelineType: TimelineType,
    |}
  | {|
      +type: 'CHANGE_IMPLEMENTATION_FILTER',
      +implementation: ImplementationFilter,
      +threadsKey: ThreadsKey,
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
      +selectedThreadIndexes: Set<ThreadIndex>,
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
  | {| +type: 'CHANGE_PROFILE_NAME', +profileName: string | null |}
  | {|
      +type: 'SANITIZED_PROFILE_PUBLISHED',
      +hash: string,
      +committedRanges: StartEndRange[] | null,
      +oldThreadIndexToNew: Map<ThreadIndex, ThreadIndex> | null,
      +profileName: string,
      +prePublishedState: State | null,
    |}
  | {|
      +type: 'SET_DATA_SOURCE',
      +dataSource: DataSource,
    |}
  | {|
      +type: 'CHANGE_MOUSE_TIME_POSITION',
      +mouseTimePosition: Milliseconds | null,
    |}
  | {|
      +type: 'TOGGLE_RESOURCES_PANEL',
      +selectedThreadIndexes: Set<ThreadIndex>,
    |}
  | {|
      +type: 'PROFILE_REMOTELY_DELETED',
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
      +abortFunction: () => void,
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

type CurrentProfileUploadedInformationAction = {|
  +type: 'SET_CURRENT_PROFILE_UPLOADED_INFORMATION',
  +uploadedProfileInformation: UploadedProfileInformation | null,
|};

type L10nAction =
  | {| +type: 'REQUEST_L10N' |}
  | {|
      +type: 'RECEIVE_L10N',
      +localization: Localization,
      +primaryLocale: string,
      +direction: 'ltr' | 'rtl',
    |};

    type SourcesAction =
    | {| +type: 'SOURCE_LOADING_BEGIN', file: string, url: string |}
    | {| +type: 'SOURCE_LOADING_SUCCESS', file: string, source: string |}
    | {| +type: 'SOURCE_LOADING_ERROR', file: string, error: string |};

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
  | L10nAction
  | SourcesAction;
