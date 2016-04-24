import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { preprocessProfile } from '../preprocess-profile';
import { getTimeRangeIncludingAllThreads } from '../profile-data';
import { symbolicateProfile } from '../symbolication';
import { SymbolStore } from '../symbol-store';
import * as Actions from '../actions';
import ProfileViewer from '../components/ProfileViewer';
import ReactUpdates from 'react/lib/ReactUpdates';

/*eslint-env browser*/
/**
 * Cribbed from:
 * github.com/facebook/react/blob/master/src/addons/ReactRAFBatchingStrategy.js
 * github.com/petehunt/react-raf-batching/blob/master/ReactRAFBatching.js
 */


var ReactRAFBatchingStrategy = {
  isBatchingUpdates: true,

  /**
   * Call the provided function in a context within which calls to `setState`
   * and friends are batched such that components aren't updated unnecessarily.
   */
  batchedUpdates: function(callback, a, b, c, d, e, f) {
    callback(a, b, c, d, e, f);
  }
};

ReactUpdates.injection.injectBatchingStrategy(ReactRAFBatchingStrategy);

function tick() {
  ReactUpdates.flushBatchedUpdates();
  requestAnimationFrame(tick);
}

if (window && typeof window.requestAnimationFrame == 'function') {
  window.requestAnimationFrame(tick);
}

class App extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    const { dispatch } = this.props;

    dispatch(Actions.waitingForProfileFromAddon());

    window.geckoProfilerPromise.then((geckoProfiler) => {
      geckoProfiler.getProfile().then(profile => {
        profile = preprocessProfile(profile);
        dispatch(Actions.receiveProfileFromAddon(profile));

        const symbolStore = new SymbolStore("cleopatra-async-storage", {
          requestSymbolTable: (pdbName, breakpadId) => {
            let requestedLib = { pdbName, breakpadId };
            dispatch(Actions.requestingSymbolTable(requestedLib));
            return geckoProfiler.getSymbolTable(pdbName, breakpadId).then(symbolTable => {
              dispatch(Actions.receivedSymbolTableReply(requestedLib));
              return symbolTable;
            }, error => {
              dispatch(Actions.receivedSymbolTableReply(requestedLib));
              throw error;
            });
          }
        });

        dispatch(Actions.startSymbolicating());
        symbolicateProfile(profile, symbolStore, {
          onMergeFunctions: (threadIndex, oldFuncToNewFuncMap) => {
            dispatch(Actions.mergeFunctions(threadIndex, oldFuncToNewFuncMap));
          },
          onGotFuncNames: (threadIndex, funcIndices, funcNames) => {
            dispatch(Actions.assignFunctionNames(threadIndex, funcIndices, funcNames));
          }
        }).then(() => dispatch(Actions.doneSymbolicating()));
      });
    });
  }

  render() {
    const { view, profileView } = this.props;
    if (view !== 'PROFILE') {
      return (<div></div>);
    }
    const { profile, viewOptions } = profileView;
    return (
      <ProfileViewer profile={profile} viewOptions={viewOptions}/>
    );
  }
};
export default connect(state => state)(App);
