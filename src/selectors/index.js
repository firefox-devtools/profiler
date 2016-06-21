import { createSelector } from 'reselect';
import * as ProfileData from '../profile-data';
import * as ProfileTree from '../profile-tree';

export const getProfileView = state => state.profileView;

export const getProfile = createSelector(
  getProfileView,
  profileView => profileView.profile
);

export const getProfileInterval = createSelector(
  getProfile,
  profile => profile.meta.interval
);

export const getProfileViewOptions = createSelector(
  getProfileView,
  profileView => profileView.viewOptions
);

export const getJSOnly = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.jsOnly
);

export const getScrollToSelectionGeneration = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.scrollToSelectionGeneration
);

export const getInvertCallstack = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.invertCallstack
);

export const getDisplayRange = createSelector(
  getProfileViewOptions,
  viewOptions => {
    if (viewOptions.rangeFilters.length > 0) {
      return viewOptions.rangeFilters[viewOptions.rangeFilters.length - 1];
    }
    return viewOptions.rootRange;
  }
);

export const getSelectedThreadIndex = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.selectedThread
);

export const getThreadOrder = createSelector(
  getProfileViewOptions,
  viewOptions => viewOptions.threadOrder
);

const selectorsForThreads = {};

export const selectorsForThread = threadIndex => {
  if (!(threadIndex in selectorsForThreads)) {
    const getThread = createSelector(getProfile, profile => profile.threads[threadIndex]);
    const getViewOptions = createSelector(
      getProfileViewOptions,
      viewOptions => viewOptions.threads[threadIndex]
    );
    const getRangeFilteredThread = createSelector(
      getThread,
      getDisplayRange,
      (thread, range) => {
        const { start, end } = range;
        return ProfileData.filterThreadToRange(thread, start, end);
      }
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
  const stateToState = state => state;
  const result = {};
  for (const key in anyThreadSelectors) {
    const selectedThreadSelectorForKey = createSelector(
      getSelectedThreadIndex,
      stateToState,
      (selectedThreadIndex, state) => {
        return selectorsForThread(selectedThreadIndex)[key](state);
      }
    );
    result[key] = selectedThreadSelectorForKey;
  }
  return result;
})();
