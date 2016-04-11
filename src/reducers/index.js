
export default function reducer(state, action) {
  switch (action.type) {
    case 'WAITING_FOR_PROFILE_FROM_ADDON':
      return { status: 'WAITING_FOR_PROFILE' };
    case 'RECEIVE_PROFILE_FROM_ADDON':
      return { status: 'DONE', profile: action.profile };
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
    default:
      return state;
  }
}
