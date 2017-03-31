import type { Summary } from '../../common/summarize-profile';
import type { Action, ExpandedSet, CallTreeFiltersPerThread, DataSource } from '../actions/types';
import type { Milliseconds, StartEndRange } from '../../common/types/units';
import type { Profile, ThreadIndex } from '../../common/types/profile';

export type Reducer<T> = (T, Action) => T;

export type ProfileViewState = {
  viewOptions: {
    threads: ThreadViewOptions[],
    threadOrder: number[],
    symbolicationStatus: SymbolicationStatus,
    waitingForLibs: Set<RequestedLib>,
    selection: ProfileSelection,
    scrollToSelectionGeneration: number,
    rootRange: StartEndRange,
    zeroAt: Milliseconds,
    tabOrder: number[],
  },
  profile: Profile | null,
};

export type AppState = {
  view: string,
  isURLSetupDone: boolean,
};

export type SummaryViewState = {
  summary: null|Summary,
  expanded: null|ExpandedSet,
};

export type URLState = {
  dataSource: DataSource,
  hash: string,
  selectedTab: string,
  rangeFilters: RangeFiltersState,
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

export type IconWithClassName = {
  icon: string,
  className: string,
};
