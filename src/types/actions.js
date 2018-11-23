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
  IndexIntoMarkersTable,
  IndexIntoFuncTable,
  Pid,
} from './profile';
import type {
  CallNodePath,
  CallNodeTable,
  GlobalTrack,
  LocalTrack,
  TrackIndex,
} from './profile-derived';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';
import type { TemporaryError } from '../utils/errors';
import type { Transform } from './transforms';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { ProfileSharingStatus, UrlState } from '../types/reducers';

export type DataSource =
  | 'none'
  | 'from-file'
  | 'from-addon'
  | 'local'
  | 'public'
  | 'from-url';
export type TimelineType = 'stack' | 'category';
export type PreviewSelection =
  | {| +hasSelection: false, +isModifying: false |}
  | {|
      +hasSelection: true,
      +isModifying: boolean,
      +selectionStart: number,
      +selectionEnd: number,
    |};
export type FuncToFuncMap = Map<IndexIntoFuncTable, IndexIntoFuncTable>;
export type FunctionsUpdatePerThread = {
  [id: ThreadIndex]: {|
    oldFuncToNewFuncMap: FuncToFuncMap,
    funcIndices: IndexIntoFuncTable[],
    funcNames: string[],
  |},
};

/**
 * A TrackReference uniquely identifies a track.
 * Note that TrackIndexes aren't globally unique: they're unique among global
 * tracks, and they're unique among local tracks for a specific Pid.
 */
export type TrackReference =
  | {| +type: 'global', +trackIndex: TrackIndex |}
  | {| +type: 'local', +trackIndex: TrackIndex, +pid: Pid |};
export type RequestedLib = {|
  +debugName: string,
  +breakpadId: string,
|};
export type ImplementationFilter = 'combined' | 'js' | 'cpp';

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
      +selectedMarker: IndexIntoMarkersTable | -1,
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
      +type: 'SET_CALL_NODE_CONTEXT_MENU_VISIBILITY',
      +isVisible: boolean,
    |}
  | {|
      +type: 'SET_PROFILE_SHARING_STATUS',
      +profileSharingStatus: ProfileSharingStatus,
    |}
  | {|
      +type: 'INCREMENT_PANEL_LAYOUT_GENERATION',
    |};

type ReceiveProfileAction =
  | {|
      +type: 'COALESCED_FUNCTIONS_UPDATE',
      +functionsUpdatePerThread: FunctionsUpdatePerThread,
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
      +type: 'VIEW_PROFILE',
      +profile: Profile,
      +selectedThreadIndex: ThreadIndex,
      +globalTracks: GlobalTrack[],
      +globalTrackOrder: TrackIndex[],
      +hiddenGlobalTracks: Set<TrackIndex>,
      +localTracksByPid: Map<Pid, LocalTrack[]>,
      +hiddenLocalTracksByPid: Map<Pid, Set<TrackIndex>>,
      +localTrackOrderByPid: Map<Pid, TrackIndex[]>,
      +pathInZipFile: ?string,
      +dataSource: DataSource,
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
  | {| +type: 'WAITING_FOR_PROFILE_FROM_URL' |};

type StackChartAction =
  | {| +type: 'CHANGE_STACK_CHART_COLOR_STRATEGY', +getCategory: GetCategory |}
  | {| +type: 'CHANGE_STACK_CHART_LABELING_STRATEGY', +getLabel: GetLabel |}
  | {| +type: 'HAS_ZOOMED_VIA_MOUSEWHEEL' |};

type UrlEnhancerAction =
  | {| +type: 'URL_SETUP_DONE' |}
  | {| +type: 'UPDATE_URL_STATE', +newUrlState: UrlState | null |};

type UrlStateAction =
  | {| +type: 'WAITING_FOR_PROFILE_FROM_FILE' |}
  | {| +type: 'PROFILE_PUBLISHED', +hash: string |}
  | {| +type: 'CHANGE_SELECTED_TAB', +selectedTab: TabSlug |}
  | {| +type: 'COMMIT_RANGE', +start: number, +end: number |}
  | {| +type: 'POP_COMMITTED_RANGES', +firstPoppedFilterIndex: number |}
  | {| +type: 'CHANGE_SELECTED_THREAD', +selectedThreadIndex: ThreadIndex |}
  | {|
      +type: 'SELECT_TRACK',
      +selectedThreadIndex: ThreadIndex,
      +selectedTab: TabSlug,
    |}
  | {| +type: 'CHANGE_RIGHT_CLICKED_TRACK', +trackReference: TrackReference |}
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
      +type: 'CHANGE_INVERT_CALLSTACK',
      +invertCallstack: boolean,
      +callTree: CallTree,
      +callNodeTable: CallNodeTable,
      +selectedThreadIndex: ThreadIndex,
    |}
  | {| +type: 'CHANGE_MARKER_SEARCH_STRING', +searchString: string |};

type IconsAction =
  | {| +type: 'ICON_HAS_LOADED', +icon: string |}
  | {| +type: 'ICON_IN_ERROR', +icon: string |};

type SidebarAction = {|
  +type: 'CHANGE_SIDEBAR_OPEN_STATE',
  +tab: TabSlug,
  +isOpen: boolean,
|};

export type Action =
  | ProfileAction
  | ReceiveProfileAction
  | SidebarAction
  | StackChartAction
  | UrlEnhancerAction
  | UrlStateAction
  | IconsAction;
