import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { preprocessProfile } from '../preprocess-profile';
import { symbolicateProfile } from '../symbolication';
import { SymbolStore } from '../symbol-store';
import { getCallTree } from '../profile-tree';
import TreeView from '../components/TreeView';

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
      let profilePromise = geckoProfiler.getProfile();
      profilePromise.then(profile => {
        console.log("got profile!");
        const p = preprocessProfile(profile);
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
export default connect(state => state)(App);
