import 'babel-polyfill';
import { preprocessProfile } from './merge-profiles';
import { symbolicateProfile } from './symbolication';
import { SymbolStore } from './symbol-store';
import { getCallTree } from './profile-tree';

let _state = {};

function reducer(state, action) {
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
      throw new Error("Unhandled action type");
  }
}

function renderProfile(profile) {
  const tree = getCallTree(profile.threads[0]);
  let depthLimit = 20;
  function renderNode(node, depth) {
    if (depth > depthLimit) {
      return '';
    }
    return '  '.repeat(depth) + node._totalSampleCount + ' ' + node._name + '\n' +
      node._children.map(child => renderNode(child, depth + 1)).join('');
  }
  document.body.textContent = renderNode(tree, 0);
}

let renderTimeout = 0;
function render() {
  renderProfile(_state.profile);
  // document.body.textContent = `${_state.status}, ${_state.symbolicationStatus}`;
  renderTimeout = 0;
}

function dispatch(action) {
  _state = reducer(_state, action);
  // console.log(_state);
  if (_state.status === 'DONE' && !renderTimeout) {
    renderTimeout = setTimeout(render, 0);
  }
}

dispatch({
  type: 'WAITING_FOR_PROFILE_FROM_ADDON'
});

window.onerror = function (e) {
  console.log(e);
}

window.connectToGeckoProfiler = (geckoProfiler) => {
setTimeout(()=>{
  console.log("connected!");
  geckoProfiler.getProfile().then(profile => {
    console.log("got profile!");
    let p = preprocessProfile(profile);
    dispatch({
      type: 'RECEIVE_PROFILE_FROM_ADDON',
      profile: p
    });
    // return;
    let symbolStore = new SymbolStore("cleopatra-async-storage", {
      requestSymbolTable: (pdbName, breakpadId) => {
        let requestedLib = { pdbName, breakpadId };
        dispatch({
          type: 'REQUESTING_SYMBOL_TABLE',
          requestedLib
        });
        return geckoProfiler.getSymbolTable(pdbName, breakpadId).then(symbolTable => {
          dispatch({
            type: 'RECEIVED_SYMBOL_TABLE_REPLY',
            requestedLib
          });
          return symbolTable;
        }, error => {
          dispatch({
            type: 'RECEIVED_SYMBOL_TABLE_REPLY',
            requestedLib
          });
          throw error;
        });
      }
    });
    dispatch({
      type: 'START_SYMBOLICATING'
    });
    symbolicateProfile(p, symbolStore, {
      onUpdateProfile: profile => {
        dispatch({
          type: 'PROFILE_SYMBOLICATION_STEP',
          profile
        });
      }
    }).then(() => dispatch({ type: 'DONE_SYMBOLICATING' }));
  });
}, 0);
}
window.addEventListener("load", e => {
  
});
