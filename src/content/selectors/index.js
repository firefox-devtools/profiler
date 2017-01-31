import { createSelector } from 'reselect';
import * as ProfileData from '../profile-data';
import * as StackTiming from '../stack-timing';
import * as ProfileTree from '../profile-tree';
import * as TaskTracer from '../task-tracer';
import * as reducers from '../reducers';
import { urlFromState } from '../url-handling';

export const getView = state => state.view;
export const getProfileView = state => state.profileView;
export const getProfile = state => getProfileView(state).profile;
export const getProfileInterval = state => getProfile(state).meta.interval;
export const getProfileViewOptions = state => getProfileView(state).viewOptions;
export const getThreadNames = state => getProfile(state).threads.map(t => t.name);
export const getProfileTaskTracerData = state => getProfile(state).tasktracer;

const getURLState = state => state.urlState;

export const getDataSource = state => getURLState(state).dataSource;
export const getHash = state => getURLState(state).hash;
export const getRangeFilters = state => getURLState(state).rangeFilters;
export const getJSOnly = state => getURLState(state).jsOnly;
export const getInvertCallstack = state => getURLState(state).invertCallstack;
export const getSearchString = state => getURLState(state).callTreeSearchString;
export const getSelectedTab = state => getURLState(state).selectedTab;
export const getSelectedThreadIndex = state => getURLState(state).selectedThread;

export const getURLPredictor = createSelector(
  getURLState,
  urlState => actionOrActionList => {
    const actionList = ('type' in actionOrActionList) ? [actionOrActionList] : actionOrActionList;
    const newURLState = actionList.reduce(reducers.urlState, urlState);
    return urlFromState(newURLState);
  }
);

export const getScrollToSelectionGeneration = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.scrollToSelectionGeneration
);

export const getDisplayRange = createSelector(
  state => getProfileViewOptions(state).rootRange,
  state => getProfileViewOptions(state).zeroAt,
  getRangeFilters,
  (rootRange, zeroAt, rangeFilters) => {
    if (rangeFilters.length > 0) {
      let { start, end } = rangeFilters[rangeFilters.length - 1];
      start += zeroAt;
      end += zeroAt;
      return { start, end };
    }
    return rootRange;
  }
);

export const getZeroAt = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.zeroAt
);

export const getThreadOrder = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.threadOrder
);

export const getTasksByThread = createSelector(
  state => getProfileTaskTracerData(state).taskTable,
  state => getProfileTaskTracerData(state).threadTable,
  TaskTracer.getTasksByThread
);

export const getProfileSummaries = state => {
  return state.summaryView.summary;
};

export const getProfileExpandedSummaries = state => {
  return state.summaryView.expanded;
};

const selectorsForThreads = {};

export const selectorsForThread = threadIndex => {
  if (!(threadIndex in selectorsForThreads)) {
    const getThread = state => getProfile(state).threads[threadIndex];
    const getViewOptions = state => getProfileViewOptions(state).threads[threadIndex];
    const getCallTreeFilters = state => getURLState(state).callTreeFilters[threadIndex] || [];
    const getRangeFilteredThread = createSelector(
      getThread,
      getDisplayRange,
      (thread, range) => {
        const { start, end } = range;
        return ProfileData.filterThreadToRange(thread, start, end);
      }
    );
    const getRangeFilteredThreadSamples = createSelector(
      getRangeFilteredThread,
      thread => thread.samples
    );
    const getRangeFilteredThreadMarkers = createSelector(
      getRangeFilteredThread,
      thread => thread.markers
    );
    const getJankInstances = createSelector(
      getRangeFilteredThreadSamples,
      state => getThread(state).processType,
      (samples, processType) => ProfileData.getJankInstances(samples, processType, 50)
    );
    const getTracingMarkers = createSelector(
      getThread,
      getRangeFilteredThreadMarkers,
      (thread, markers) => ProfileData.getTracingMarkers(thread, markers)
    );
    const getRangeAndCallTreeFilteredThread = createSelector(
      getRangeFilteredThread,
      getCallTreeFilters,
      (thread, callTreeFilters) => {
        const result = callTreeFilters.reduce((t, filter) => {
          switch (filter.type) {
            case 'prefix':
              return ProfileData.filterThreadToPrefixStack(t, filter.prefixFuncs, filter.matchJSOnly);
            case 'postfix':
              return ProfileData.filterThreadToPostfixStack(t, filter.postfixFuncs, filter.matchJSOnly);
            default:
              throw new Error('unhandled call tree filter');
          }
        }, thread);
        return result;
      }
    );
    const getJSOnlyFilteredThread = createSelector(
      getRangeAndCallTreeFilteredThread,
      getJSOnly,
      (thread, jsOnly) => {
        return jsOnly ? ProfileData.filterThreadToJSOnly(thread) : thread;
      }
    );
    const getJSOnlyAndSearchFilteredThread = createSelector(
      getJSOnlyFilteredThread,
      getSearchString,
      (thread, searchString) => {
        return ProfileData.filterThreadToSearchString(thread, searchString);
      }
    );
    const getFilteredThread = createSelector(
      getJSOnlyAndSearchFilteredThread,
      getInvertCallstack,
      (thread, shouldInvertCallstack) => {
        return shouldInvertCallstack ? ProfileData.invertCallstack(thread) : thread;
      }
    );
    const getRangeSelectionFilteredThread = createSelector(
      getFilteredThread,
      getProfileViewOptions,
      (thread, viewOptions) => {
        if (!viewOptions.selection.hasSelection) {
          return thread;
        }
        const { selectionStart, selectionEnd } = viewOptions.selection;
        return ProfileData.filterThreadToRange(thread, selectionStart, selectionEnd);
      }
    );
    const getFuncStackInfo = createSelector(
      getFilteredThread,
      ({stackTable, frameTable, funcTable}) => {
        return ProfileData.getFuncStackInfo(stackTable, frameTable, funcTable);
      }
    );
    const getSelectedFuncStackAsFuncArray = createSelector(
      getViewOptions,
      threadViewOptions => threadViewOptions.selectedFuncStack
    );
    const getSelectedFuncStack = createSelector(
      getFuncStackInfo,
      getSelectedFuncStackAsFuncArray,
      (funcStackInfo, funcArray) => {
        return ProfileData.getFuncStackFromFuncArray(funcArray, funcStackInfo.funcStackTable);
      }
    );
    const getExpandedFuncStacksAsFuncArrays = createSelector(
      getViewOptions,
      threadViewOptions => threadViewOptions.expandedFuncStacks
    );
    const getExpandedFuncStacks = createSelector(
      getFuncStackInfo,
      getExpandedFuncStacksAsFuncArrays,
      (funcStackInfo, funcArrays) => {
        return funcArrays.map(funcArray => ProfileData.getFuncStackFromFuncArray(funcArray, funcStackInfo.funcStackTable));
      }
    );
    const getFuncStackMaxDepth = createSelector(
      getFilteredThread,
      getFuncStackInfo,
      StackTiming.computeFuncStackMaxDepth
    );
    // TODO - Memoize off of the initial profile, ignore changes to the symbol information.
    const getStackTimingByDepth = createSelector(
      getFilteredThread,
      getFuncStackInfo,
      getFuncStackMaxDepth,
      getProfileInterval,
      StackTiming.getStackTimingByDepth
    );
    const getCallTree = createSelector(
      getRangeSelectionFilteredThread,
      getProfileInterval,
      getFuncStackInfo,
      getJSOnly,
      ProfileTree.getCallTree
    );
    selectorsForThreads[threadIndex] = {
      getThread,
      getRangeFilteredThread,
      getViewOptions,
      getCallTreeFilters,
      getFilteredThread,
      getJankInstances,
      getTracingMarkers,
      getRangeSelectionFilteredThread,
      getFuncStackInfo,
      getSelectedFuncStack,
      getExpandedFuncStacks,
      getFuncStackMaxDepth,
      getStackTimingByDepth,
      getCallTree,
    };
  }
  return selectorsForThreads[threadIndex];
};

export const selectedThreadSelectors = (() => {
  const anyThreadSelectors = selectorsForThread(0);
  const result = {};
  for (const key in anyThreadSelectors) {
    result[key] = state => selectorsForThread(getSelectedThreadIndex(state))[key](state);
  }
  return result;
})();
