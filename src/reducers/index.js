import { applyFunctionMerging, setFuncNames } from '../symbolication';
import { defaultThreadOrder } from '../profile-data';

function profileViewReducer(state, action) {
  switch (action.type) {
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
    case 'COALESCED_FUNCTIONS_UPDATE': {
      const { functionsUpdatePerThread } = action;
      const threads = state.profile.threads.map((thread, threadIndex) => {
        if (!functionsUpdatePerThread[threadIndex])
          return thread;
        const { oldFuncToNewFuncMap, funcIndices, funcNames } = functionsUpdatePerThread[threadIndex];
        thread = applyFunctionMerging(thread, oldFuncToNewFuncMap);
        thread = setFuncNames(thread, funcIndices, funcNames);
        return thread;
      });
      const profile = Object.assign({}, state.profile, { threads });
      const vothreads = state.viewOptions.threads.map((thread, threadIndex) => {
        if (!functionsUpdatePerThread[threadIndex]) {
          return thread;
        }
        const { oldFuncToNewFuncMap } = functionsUpdatePerThread[threadIndex];
        const selectedFuncStack = thread.selectedFuncStack.map(oldFunc => {
          const newFunc = oldFuncToNewFuncMap.get(oldFunc);
          return newFunc === undefined ? oldFunc : newFunc;
        });
        const expandedFuncStacks = thread.expandedFuncStacks.map(oldFuncArray => {
          return oldFuncArray.map(oldFunc => {
            const newFunc = oldFuncToNewFuncMap.get(oldFunc);
            return newFunc === undefined ? oldFunc : newFunc;
          });
        });
        return Object.assign({}, thread, { selectedFuncStack, expandedFuncStacks });
      });
      const viewOptions = Object.assign({}, state.viewOptions, { threads: vothreads });
      return Object.assign({}, state, { profile, viewOptions });
    }
    case 'CHANGE_SELECTED_FUNC_STACK': {
      const { selectedFuncStack, threadIndex } = action;
      const threads = state.viewOptions.threads.map((thread, ti) => {
        if (ti !== threadIndex) {
          return thread;
        }
        return Object.assign({}, thread, { selectedFuncStack });
      });
      const viewOptions = Object.assign({}, state.viewOptions, { threads });
      return Object.assign({}, state, { viewOptions });
    }
    case 'CHANGE_SELECTED_THREAD': {
      const { selectedThread } = action;
      const viewOptions = Object.assign({}, state.viewOptions, { selectedThread });
      return Object.assign({}, state, { viewOptions });
    }
    case 'CHANGE_EXPANDED_FUNC_STACKS': {
      const { threadIndex, expandedFuncStacks } = action;
      const threads = state.viewOptions.threads.map((thread, ti) => {
        if (ti !== threadIndex) {
          return thread;
        }
        return Object.assign({}, thread, { expandedFuncStacks });
      });
      const viewOptions = Object.assign({}, state.viewOptions, { threads });
      return Object.assign({}, state, { viewOptions });
    }
    default:
      return state;
  }
}

export default function reducer(state = {}, action) {
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
            threads: action.profile.threads.map(thread => ({
              selectedFuncStack: [],
              expandedFuncStacks: [],
            })),
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
