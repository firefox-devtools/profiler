/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent, PropTypes } from 'react';
import { connect, Provider } from 'react-redux';
import { oneLine } from 'common-tags';

import { retrieveProfileFromAddon, retrieveProfileFromStore, retrieveProfileFromUrl } from '../actions/receive-profile';
import ProfileViewer from '../components/ProfileViewer';
import Home from '../containers/Home';
import { urlFromState, stateFromLocation } from '../url-handling';
import { getView } from '../reducers/app';
import { getDataSource, getHash, getProfileURL } from '../reducers/url-state';
import URLManager from './URLManager';

import type { Store } from '../types';
import type { AppViewState } from '../reducers/types';

const LOADING_MESSAGES = Object.freeze({
  'from-addon': 'Retrieving profile from the gecko profiler addon...',
  'from-file': 'Reading the file and parsing the profile in it...',
  'local': 'Not implemented yet.',
  'public': 'Retrieving profile from the public profile store...',
  'from-url': 'Retrieving profile from URL...',
});

const ERROR_MESSAGES = Object.freeze({
  'from-addon': "Couldn't retrieve the profile from the gecko profiler addon.",
  'from-file': "Couldn't read the file or parse the profile in it.",
  'local': 'Not implemented yet.',
  'public': "Couldn't Retrieve the profile from the public profile store.",
  'from-url': "Couldn't Retrieving profile from specified URL...",
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
  profileURL: string,
  retrieveProfileFromAddon: void => void,
  retrieveProfileFromStore: string => void,
  retrieveProfileFromUrl: string => void,
};

class ProfileViewWhenReadyImpl extends PureComponent {
  props: ProfileViewProps;

  componentDidMount() {
    const { dataSource, hash, profileURL, retrieveProfileFromAddon, retrieveProfileFromStore, retrieveProfileFromUrl } = this.props;
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
        retrieveProfileFromStore(hash);
        break;
      case 'from-url':
        retrieveProfileFromUrl(profileURL);
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
        let additionalMessage = '';
        if (view.additionalData) {
          if (view.additionalData.message) {
            additionalMessage = view.additionalData.message;
          }

          if (view.additionalData.attempt) {
            const attempt = view.additionalData.attempt;
            additionalMessage += `Tried ${fewTimes(attempt.count)} out of ${attempt.total}.`;
          }
        }

        return (
          <div>
            <div>{ message }</div>
            { additionalMessage && <div>{ additionalMessage }</div>}
          </div>
        );
      }
      case 'FATAL_ERROR': {
        const message = ERROR_MESSAGES[dataSource] || "Couldn't retrieve the profile.";
        let additionalMessage = null;
        if (view.error) {
          console.error(view.error);
          additionalMessage = oneLine`
            Error was "${view.error.toString()}".
            The full stack has been written to the Web Console.
          `;
        }

        return (
          <div>
            <div>{ message }</div>
            { additionalMessage && <div>{ additionalMessage }</div>}
          </div>
        );
      }
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
    additionalData: PropTypes.object,
    error: PropTypes.instanceOf(Error),
  }).isRequired,
  dataSource: PropTypes.string.isRequired,
  hash: PropTypes.string,
  retrieveProfileFromAddon: PropTypes.func.isRequired,
  retrieveProfileFromStore: PropTypes.func.isRequired,
  retrieveProfileFromUrl: PropTypes.func.isRequired,
};

const ProfileViewWhenReady = connect(
  state => ({
    view: getView(state),
    dataSource: getDataSource(state),
    hash: getHash(state),
    profileURL: getProfileURL(state),
  }),
  { retrieveProfileFromStore, retrieveProfileFromUrl, retrieveProfileFromAddon }
)(ProfileViewWhenReadyImpl);

type RootProps = {
  store: Store,
};

export default class Root extends PureComponent {
  props: RootProps;

  render() {
    const { store } = this.props;
    return (
      <Provider store={store}>
        <URLManager urlFromState={urlFromState} stateFromLocation={stateFromLocation}>
          <ProfileViewWhenReady/>
        </URLManager>
      </Provider>
    );
  }
}

Root.propTypes = {
  store: PropTypes.any.isRequired,
};
