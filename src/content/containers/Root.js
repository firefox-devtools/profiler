import React, { PureComponent, PropTypes } from 'react';
import { connect, Provider } from 'react-redux';
import actions from '../actions';
import ProfileViewer from '../components/ProfileViewer';
import Home from '../containers/Home';
import { urlFromState, stateFromCurrentLocation } from '../url-handling';
import { getView } from '../reducers/app';
import { getDataSource, getHash } from '../reducers/url-state';
import URLManager from './URLManager';

import type { State, AppViewState } from '../reducers/types';
import type { Action } from '../actions/types';

const LOADING_MESSAGES = Object.freeze({
  'from-addon': 'Retrieving profile from the gecko profiler addon...',
  'from-file': 'Reading the file and parsing the profile in it...',
  'local': 'Not implemented yet.',
  'public': 'Retrieving profile from the public profile store...',
});

// TODO Switch to a proper i18n library
function fewTimes(count: number) {
  switch (count) {
    case 1: return 'once';
    case 2: return 'twice';
    default: return `${count} times`;
  }
}

type ProfileViewProps = {
  view: AppViewState,
  dataSource: string,
  hash: string,
  retrieveProfileFromAddon: void => void,
  retrieveProfileFromWeb: string => void,
};

class ProfileViewWhenReadyImpl extends PureComponent {
  props: ProfileViewProps;

  componentDidMount() {
    const { dataSource, hash, retrieveProfileFromAddon, retrieveProfileFromWeb } = this.props;
    switch (dataSource) {
      case 'from-addon':
        retrieveProfileFromAddon();
        break;
      case 'from-file':
        // retrieveProfileFromFile should already have been called
        break;
      case 'local':
        break;
      case 'public':
        retrieveProfileFromWeb(hash);
        break;
    }
  }

  render() {
    const { view, dataSource } = this.props;
    switch (view.phase) {
      case 'INITIALIZING': {
        if (dataSource === 'none') {
          return <Home />;
        }

        const message = LOADING_MESSAGES[dataSource] || 'View not found';
        let additionalMessage = null;
        if (view.additionalData && view.additionalData.attempt) {
          const attempt = view.additionalData.attempt;
          additionalMessage = `Tried ${fewTimes(attempt.count)} out of ${attempt.total}.`;
        }

        return (
          <div>
            <div>{ message }</div>
            { additionalMessage && <div>{ additionalMessage }</div>}
          </div>
        );
      }
      case 'FATAL_ERROR':
        return <div>{"Couldn't load the profile from the store."}</div>;
      case 'PROFILE':
        return <ProfileViewer/>;
      case 'ROUTE_NOT_FOUND':
        return <div>There is no route handler for the URL {window.location.pathname + window.location.search}</div>;
      default:
        return <div>View not found.</div>;
    }
  }
}

ProfileViewWhenReadyImpl.propTypes = {
  view: PropTypes.shape({
    phase: PropTypes.string.isRequired,
    additionalMessage: PropTypes.object,
  }).isRequired,
  dataSource: PropTypes.string.isRequired,
  hash: PropTypes.string,
  retrieveProfileFromAddon: PropTypes.func.isRequired,
  retrieveProfileFromWeb: PropTypes.func.isRequired,
};

const ProfileViewWhenReady = connect(state => ({
  view: getView(state),
  dataSource: getDataSource(state),
  hash: getHash(state),
}), actions)(ProfileViewWhenReadyImpl);

type RootProps = {
  store: Store<State, Action>,
};

export default class Root extends PureComponent {
  props: RootProps;

  render() {
    const { store } = this.props;
    return (
      <Provider store={store}>
        <URLManager urlFromState={urlFromState} stateFromCurrentLocation={stateFromCurrentLocation}>
          <ProfileViewWhenReady/>
        </URLManager>
      </Provider>
    );
  }
}

Root.propTypes = {
  store: PropTypes.any.isRequired,
};
