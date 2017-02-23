import React, { Component, PropTypes } from 'react';
import { connect, Provider } from 'react-redux';
import * as actions from '../actions';
import ProfileViewer from '../components/ProfileViewer';
import Home from '../containers/Home';
import { urlFromState, stateFromCurrentLocation } from '../url-handling';
import { getView } from '../reducers/app';
import { getDataSource, getHash } from '../reducers/url-state';
import URLManager from './URLManager';

class ProfileViewWhenReadyImpl extends Component {
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
    switch (view) {
      case 'INITIALIZING': {
        switch (dataSource) {
          case 'none':
            return <Home />;
          case 'from-addon':
            return <div>Retrieving profile from the gecko profiler addon...</div>;
          case 'from-file':
            return <div>Reading the file and parsing the profile in it...</div>;
          case 'local':
            return <div>Not implemented yet.</div>;
          case 'public':
            return <div>Retrieving profile from the public profile store...</div>;
          default:
            return <div>View not found.</div>;
        }
      }
      case 'PROFILE':
        return <ProfileViewer/>;
      case 'FILE_NOT_FOUND':
        return <div>There is no route handler for the URL {window.location.pathname + window.location.search}</div>;
      default:
        return <div>View not found.</div>;
    }
  }
}

ProfileViewWhenReadyImpl.propTypes = {
  view: PropTypes.string.isRequired,
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

export default class Root extends Component {
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
