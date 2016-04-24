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
      const profile = Object.assign({}, state.profile, { threads });
      return Object.assign({}, state, { profile });
    }
    case 'ASSIGN_FUNCTION_NAMES': {
      const { threadIndex, funcIndices, funcNames } = action;
      const threads = state.profile.threads.slice();
      threads[threadIndex] = setFuncNames(threads[threadIndex], funcIndices, funcNames);
      const profile = Object.assign({}, state.profile, { threads });
      return Object.assign({}, state, { profile });
    }
    case 'CHANGE_SELECTED_FUNC_STACK':
      const { selectedFuncStack } = action;
      const viewOptions = Object.assign({}, state.viewOptions, { selectedFuncStack });
      return Object.assign({}, state, { viewOptions });
    default:
      return state;
  }
}

export default function reducer(state, action) {
  console.log('processing an action');
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
      return { status: 'WAITING_FOR_PROFILE' };
    case 'RECEIVE_PROFILE_FROM_ADDON':
      return {
        status: 'DONE',
        view: 'PROFILE',
        profileView: {
          viewOptions: {
            threadOrder: defaultThreadOrder(action.profile.threads),
            selectedFuncStack: null,
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
