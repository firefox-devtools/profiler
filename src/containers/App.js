import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { preprocessProfile } from '../preprocess-profile';
import { symbolicateProfile } from '../symbolication';
import { SymbolStore } from '../symbol-store';
import * as Actions from '../actions';
import TreeView from '../components/TreeView';

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
    const { profile, status } = this.props;
    if (status !== 'DONE') {
      return (<div></div>);
    }
    return (
      <div>
        <TreeView thread={profile.threads[0]} depthLimit={20} />
      </div>
    );
  }
};
export default connect(state => state)(App);
