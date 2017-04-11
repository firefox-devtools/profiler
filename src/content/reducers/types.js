// @flow

import type { Summary } from '../../common/summarize-profile';
import type { Action, ExpandedSet, CallTreeFiltersPerThread, DataSource, ProfileSelection } from '../actions/types';
import type { Milliseconds, StartEndRange } from '../../common/types/units';
import type { IndexIntoMarkersTable, IndexIntoFuncTable, Profile, ThreadIndex } from '../../common/types/profile';

export type Reducer<T> = (T, Action) => T;

export type RequestedLib = { pdbName: string, breakpadId: string };
export type SymbolicationStatus = 'DONE' | 'SYMBOLICATING';
export type ThreadViewOptions = {
  selectedFuncStack: IndexIntoFuncTable[],
  expandedFuncStacks: Array<IndexIntoFuncTable[]>,
  selectedMarker: IndexIntoMarkersTable | -1,
};
export type ProfileViewState = {
  viewOptions: {
    threadOrder: number[],
    perThread: ThreadViewOptions[],
    symbolicationStatus: SymbolicationStatus,
    waitingForLibs: Set<RequestedLib>,
    selection: ProfileSelection,
    scrollToSelectionGeneration: number,
    rootRange: StartEndRange,
    zeroAt: Milliseconds,
    tabOrder: number[],
  },
  profile: Profile,
};

export type AppState = {
  view: string,
  isURLSetupDone: boolean,
};

export type SummaryViewState = {
  summary: null|Summary,
  expanded: null|ExpandedSet,
};

export type RangeFilterState = {
  start: number,
  end: number,
};

export type URLState = {
  dataSource: DataSource,
  hash: string,
  selectedTab: string,
  rangeFilters: RangeFilterState[],
  selectedThread: ThreadIndex,
  callTreeSearchString: string,
  callTreeFilters: CallTreeFiltersPerThread,
  jsOnly: boolean,
  invertCallstack: boolean,
  hidePlatformDetails: boolean,
}

export type State = {
  app: AppState,
  profileView: ProfileViewState,
  summaryView: SummaryViewState,
  urlState: URLState,
};
