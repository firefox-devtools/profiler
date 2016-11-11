import { createSelector } from 'reselect';
import * as ProfileData from '../profile-data';
import * as ProfileTree from '../profile-tree';
import * as TaskTracer from '../task-tracer';
import { parseRangeFilters } from '../range-filters';
import { summarizeProfile } from '../summarize-profile';

export const getProfileView = state => state.profileView;
export const getProfile = state => getProfileView(state).profile;
export const getProfileInterval = state => getProfile(state).meta.interval;
export const getProfileViewOptions = state => getProfileView(state).viewOptions;
export const getJSOnly = (state, props) => ('jsOnly' in props.location.query);
export const getInvertCallstack = (state, props) => ('invertCallstack' in props.location.query);
export const getProfileTaskTracerData = state => getProfile(state).tasktracer;

export const getIsSymbolicationStatus = state => {
  return getProfileViewOptions(state).symbolicationStatus;
};

export const getRangeFiltersStringParam = (state, props) => {
  const { query } = props.location;
  if ('rangeFilters' in query) {
    return query.rangeFilters;
  }
  return '';
};

export const getRangeFilters = createSelector(
  getRangeFiltersStringParam,
  parseRangeFilters
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

export const getSelectedThreadIndex = createSelector(
  getProfile,
  viewOptions => viewOptions.selectedThread
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

export const getThreadSummaries = state => {
  return summarizeProfile(getProfile(state), getIsSymbolicationStatus(state));
};

const selectorsForThreads = {};

export const selectorsForThread = threadIndex => {
  if (!(threadIndex in selectorsForThreads)) {
    const getThread = state => getProfile(state).threads[threadIndex];
    const getViewOptions = state => getProfileViewOptions(state).threads[threadIndex];
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
    const getThreadName = createSelector(
      getThread,
      thread => thread.name
    );
    const getJankInstances = createSelector(
      getRangeFilteredThreadSamples,
      getThreadName,
      (samples, threadName) => ProfileData.getJankInstances(samples, threadName, 50)
    );
    const getTracingMarkers = createSelector(
      getThread,
      getRangeFilteredThreadMarkers,
      (thread, markers) => ProfileData.getTracingMarkers(thread, markers)
    );
    const getJSOnlyFilteredThread = createSelector(
      getRangeFilteredThread,
      getJSOnly,
      (thread, jsOnly) => {
        return jsOnly ? ProfileData.filterThreadToJSOnly(thread) : thread;
      }
    );
    const getFilteredThread = createSelector(
      getJSOnlyFilteredThread,
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
    const getCallTree = createSelector(
      getRangeSelectionFilteredThread,
      getProfileInterval,
      getFuncStackInfo,
      ProfileTree.getCallTree
    );
    selectorsForThreads[threadIndex] = {
      getThread,
      getViewOptions,
      getFilteredThread,
      getJankInstances,
      getTracingMarkers,
      getRangeSelectionFilteredThread,
      getFuncStackInfo,
      getSelectedFuncStack,
      getExpandedFuncStacks,
      getCallTree,
    };
  }
  return selectorsForThreads[threadIndex];
};

export const selectedThreadSelectors = (() => {
  const anyThreadSelectors = selectorsForThread(0);
  const result = {};
  for (const key in anyThreadSelectors) {
    result[key] = (state, props) => selectorsForThread(getSelectedThreadIndex(state, props))[key](state, props);
  }
  return result;
})();
