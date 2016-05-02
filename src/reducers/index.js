import { applyFunctionMerging, setFuncNames } from '../symbolication';
import { defaultThreadOrder } from '../profile-data';

function profileViewReducer(state, action) {
  switch (action.type) {
    case 'PROFILE_SYMBOLICATION_STEP':
      return Object.assign({}, state, { profile: action.profile });
    case 'START_SYMBOLICATING':
      return Object.assign({}, state, { symbolicationStatus: 'SYMBOLICATING' });
    case 'DONE_SYMBOLICATING':
      let newState = Object.assign({}, state, { symbolicationStatus: 'DONE' });
      delete newState.waitingForLibs;
      return newState;
    case 'REQUESTING_SYMBOL_TABLE': {
      let newWaitingForLibs = new Set(state.waitingForLibs || []);
      newWaitingForLibs.add(action.requestedLib);
      return Object.assign({}, state, { waitingForLibs: newWaitingForLibs });
    }
    case 'RECEIVED_SYMBOL_TABLE_REPLY': {
      let newWaitingForLibs = new Set(state.waitingForLibs || []);
      newWaitingForLibs.delete(action.requestedLib);
      return Object.assign({}, state, { waitingForLibs: newWaitingForLibs });
    }
    case 'MERGE_FUNCTIONS': {
      const { threadIndex, oldFuncToNewFuncMap } = action;
      const threads = state.profile.threads.slice();
      threads[threadIndex] = applyFunctionMerging(threads[threadIndex], oldFuncToNewFuncMap);
      const selectedFuncStacks = state.viewOptions.selectedFuncStacks.map((selectedFuncStack, ti) => {
        if (ti !== threadIndex) {
          return selectedFuncStack;
        }
        return selectedFuncStack.map(oldFunc => {
          const newFunc = oldFuncToNewFuncMap.get(oldFunc);
          return newFunc === undefined ? oldFunc : newFunc;
        });
      });
      const viewOptions = Object.assign({}, state.viewOptions, { selectedFuncStacks });
      const profile = Object.assign({}, state.profile, { threads });
      return Object.assign({}, state, { profile, viewOptions });
    }
    case 'ASSIGN_FUNCTION_NAMES': {
      const { threadIndex, funcIndices, funcNames } = action;
      const threads = state.profile.threads.slice();
      threads[threadIndex] = setFuncNames(threads[threadIndex], funcIndices, funcNames);
      const profile = Object.assign({}, state.profile, { threads });
      return Object.assign({}, state, { profile });
    }
    case 'CHANGE_SELECTED_FUNC_STACK': {
      const { selectedFuncStack, threadIndex } = action;
      const selectedFuncStacks = state.viewOptions.selectedFuncStacks.map((sf, ti) => ti === threadIndex ? selectedFuncStack : sf);
      const viewOptions = Object.assign({}, state.viewOptions, { selectedFuncStacks });
      return Object.assign({}, state, { viewOptions });
    }
    case 'CHANGE_SELECTED_THREAD': {
      const { threadIndex } = action;
      const viewOptions = Object.assign({}, state.viewOptions, { selectedThread: threadIndex });
      return Object.assign({}, state, { viewOptions });
    }
    default:
      return state;
  }
}

export default function reducer(state, action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
      return { status: 'WAITING_FOR_PROFILE' };
    case 'RECEIVE_PROFILE_FROM_ADDON':
      const threadOrder = defaultThreadOrder(action.profile.threads);
      return {
        status: 'DONE',
        view: 'PROFILE',
        profileView: {
          viewOptions: {
            threadOrder: threadOrder,
            selectedThread: threadOrder[0],
            selectedFuncStacks: action.profile.threads.map(thread => []),
            symbolicationStatus: null,
          },
          profile: action.profile
        },
      };
    default:
      if ('profileView' in state) {
        const profileView = profileViewReducer(state.profileView, action);
        if (profileView !== state.profileView) {
          return Object.assign({}, state, { profileView });
        }
        return state;
      }
      return state;
  }
}
