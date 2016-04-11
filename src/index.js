import 'babel-polyfill';
import React, { Component, PropTypes } from 'react';
import { render } from 'react-dom';
import { Provider, connect } from 'react-redux';
import { createStore } from 'redux';

import rootReducer from './reducers';
import { preprocessProfile } from './preprocess-profile';
import { symbolicateProfile } from './symbolication';
import { SymbolStore } from './symbol-store';
import { getCallTree } from './profile-tree';

window.onerror = function (e) {
  console.log(e);
}

window.geckoProfilerPromise = new Promise(function (resolve, reject) {
  window.connectToGeckoProfiler = resolve;
});

let TreeView = ({ tree, depthLimit }) => {
  // TODO: don't reconstruct tree if funcStackTable and samples haven't changed
  function renderNode(node, depth) {
    if (depth > depthLimit) {
      return '';
    }
    return '  '.repeat(depth) + node._totalSampleCount + ' ' + node._name + '\n' +
      node._children.map(child => renderNode(child, depth + 1)).join('');
  }
  return (
    <div> { renderNode(tree, 0) } </div>
  );
};
TreeView = connect()(TreeView)

class App extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    const { dispatch } = this.props;

    dispatch({
      type: 'WAITING_FOR_PROFILE_FROM_ADDON'
    });

    window.geckoProfilerPromise.then((geckoProfiler) => {
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
    });
  }

  render() {
    const { profile, status } = this.props;
    if (status !== 'DONE') {
      return (<div></div>);
    }
    return (
      <div>
        <TreeView tree={getCallTree(profile.threads[0])} depthLimit={20} />
      </div>
    );
  }
};
App = connect(state => state)(App);

let store = createStore(rootReducer, {});

render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('root')
);
