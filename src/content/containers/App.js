import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { preprocessProfile } from '../preprocess-profile';
import { symbolicateProfile } from '../symbolication';
import { SymbolStore } from '../symbol-store';
import * as Actions from '../actions';
import ProfileViewer from '../components/ProfileViewer';
import SummarizeProfile from '../containers/SummarizeProfile';
import Initializing from '../components/Initializing';

class App extends Component {
  constructor(props) {
    super(props);
  }

  componentDidMount() {
    const { dispatch } = this.props;

    dispatch(Actions.waitingForProfileFromAddon());

    window.geckoProfilerPromise.then((geckoProfiler) => {
      geckoProfiler.getProfile().then(rawProfile => {
        const profile = preprocessProfile(rawProfile);
        dispatch(Actions.receiveProfileFromAddon(profile));

        const symbolStore = new SymbolStore('cleopatra-async-storage', {
          requestSymbolTable: (pdbName, breakpadId) => {
            const requestedLib = { pdbName, breakpadId };
            dispatch(Actions.requestingSymbolTable(requestedLib));
            return geckoProfiler.getSymbolTable(pdbName, breakpadId).then(symbolTable => {
              dispatch(Actions.receivedSymbolTableReply(requestedLib));
              return symbolTable;
            }, error => {
              dispatch(Actions.receivedSymbolTableReply(requestedLib));
              throw error;
            });
          },
        });

        dispatch(Actions.startSymbolicating());
        symbolicateProfile(profile, symbolStore, {
          onMergeFunctions: (threadIndex, oldFuncToNewFuncMap) => {
            dispatch(Actions.mergeFunctions(threadIndex, oldFuncToNewFuncMap));
          },
          onGotFuncNames: (threadIndex, funcIndices, funcNames) => {
            dispatch(Actions.assignFunctionNames(threadIndex, funcIndices, funcNames));
          },
          onGotTaskTracerNames: (addressIndices, symbolNames) => {
            dispatch(Actions.assignTaskTracerNames(addressIndices, symbolNames));
          },
        }).then(() => dispatch(Actions.doneSymbolicating()));
      });
    });
  }

  render() {
    const { view, params, location } = this.props;

    // Temporarily hook into the search params here:
    const paramView = new URL(window.location).searchParams.get('view');

    // Always show initializing
    if (view === 'INITIALIZING') {
      return (
        <Initializing />
      );
    }

    switch (paramView || view) {
      case 'PROFILE':
        return (
          <ProfileViewer params={params} location={location}/>
        );
      case 'SUMMARIZE_PROFILE':
        return (
          <SummarizeProfile />
        );
      default:
        return (
          <div>View not found.</div>
        );
    }
  }
}

App.propTypes = {
  view: PropTypes.string.isRequired,
  profileView: PropTypes.shape({
    profile: PropTypes.object.isRequired,
    viewOptions: PropTypes.object.isRequired,
  }).isRequired,
  dispatch: PropTypes.func.isRequired,
  params: PropTypes.any.isRequired,
  location: PropTypes.any.isRequired,
};

export default connect(state => state)(App);
