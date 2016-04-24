export function waitingForProfileFromAddon() {
  return {
    type: 'WAITING_FOR_PROFILE_FROM_ADDON'
  };
}

export function receiveProfileFromAddon(profile) {
  return {
    type: 'RECEIVE_PROFILE_FROM_ADDON',
    profile: profile
  };
}

export function requestingSymbolTable(requestedLib) {
  return {
    type: 'REQUESTING_SYMBOL_TABLE',
    requestedLib
  };
}

export function receivedSymbolTableReply(requestedLib) {
  return {
    type: 'RECEIVED_SYMBOL_TABLE_REPLY',
    requestedLib
  };
}

export function startSymbolicating() {
  return {
    type: 'START_SYMBOLICATING'
  };
}

export function profileSymbolicationStep(profile) {
  return {
    type: 'PROFILE_SYMBOLICATION_STEP',
    profile
  };
}

export function doneSymbolicating() {
  return { type: 'DONE_SYMBOLICATING' };
}

export function mergeFunctions(threadIndex, oldFuncToNewFuncMap) {
  return {
    type: 'MERGE_FUNCTIONS',
    threadIndex, oldFuncToNewFuncMap
  };
}

export function assignFunctionNames(threadIndex, funcIndices, funcNames) {
  return {
    type: 'ASSIGN_FUNCTION_NAMES',
    threadIndex, funcIndices, funcNames
  };
}

export function changeSelectedFuncStack(selectedFuncStack) {
  return {
    type: 'CHANGE_SELECTED_FUNC_STACK',
    selectedFuncStack
  };
}
