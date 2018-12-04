/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { Fragment, PureComponent } from 'react';
import { Provider } from 'react-redux';
import explicitConnect from '../../utils/connect';

import {
  retrieveProfileFromAddon,
  retrieveProfileFromStore,
  retrieveProfileOrZipFromUrl,
} from '../../actions/receive-profile';
import ProfileViewer from './ProfileViewer';
import ZipFileViewer from './ZipFileViewer';
import Home from './Home';
import { getView } from '../../reducers/app';
import { getHasZipFile } from '../../reducers/zipped-profiles';
import {
  getDataSource,
  getHash,
  getProfileUrl,
} from '../../reducers/url-state';
import UrlManager from './UrlManager';
import ServiceWorkerManager from './ServiceWorkerManager';
import FooterLinks from './FooterLinks';

import type { Store } from '../../types/store';
import type { AppViewState, State } from '../../types/reducers';
import type { DataSource } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./Root.css');

const LOADING_MESSAGES: { [string]: string } = Object.freeze({
  'from-addon': 'Grabbing the profile from the Gecko Profiler Addon...',
  'from-file': 'Reading the file and processing the profile...',
  local: 'Not implemented yet.',
  public: 'Downloading and processing the profile...',
  'from-url': 'Downloading and processing the profile...',
});

const ERROR_MESSAGES: { [string]: string } = Object.freeze({
  'from-addon': "Couldn't retrieve the profile from the Gecko Profiler Addon.",
  'from-file': "Couldn't read the file or parse the profile in it.",
  local: 'Not implemented yet.',
  public: 'Could not download the profile.',
  'from-url': 'Could not download the profile.',
});

// TODO Switch to a proper i18n library
function fewTimes(count: number) {
  switch (count) {
    case 1:
      return 'once';
    case 2:
      return 'twice';
    default:
      return `${count} times`;
  }
}

function toParagraphs(str: string) {
  return str.split('\n').map((s, i) => {
    return <p key={i}>{s}</p>;
  });
}
type ProfileViewStateProps = {|
  +view: AppViewState,
  +dataSource: DataSource,
  +hash: string,
  +profileUrl: string,
  +hasZipFile: boolean,
|};

type ProfileViewDispatchProps = {|
  +retrieveProfileFromAddon: typeof retrieveProfileFromAddon,
  +retrieveProfileFromStore: typeof retrieveProfileFromStore,
  +retrieveProfileOrZipFromUrl: typeof retrieveProfileOrZipFromUrl,
|};

type ProfileViewProps = ConnectedProps<
  {||},
  ProfileViewStateProps,
  ProfileViewDispatchProps
>;

class ProfileViewWhenReadyImpl extends PureComponent<ProfileViewProps> {
  componentDidMount() {
    const {
      dataSource,
      hash,
      profileUrl,
      retrieveProfileFromAddon,
      retrieveProfileFromStore,
      retrieveProfileOrZipFromUrl,
    } = this.props;
    switch (dataSource) {
      case 'from-addon':
        retrieveProfileFromAddon().catch(e => console.error(e));
        break;
      case 'from-file':
        // retrieveProfileFromFile should already have been called
        break;
      case 'local':
        break;
      case 'public':
        retrieveProfileFromStore(hash).catch(e => console.error(e));
        break;
      case 'from-url':
        retrieveProfileOrZipFromUrl(profileUrl).catch(e => console.error(e));
        break;
      case 'none':
        // nothing to do
        break;
      default:
        throw new Error(`Unknown datasource ${dataSource}`);
    }
  }

  renderMessage(
    message: string,
    additionalMessage: string | null,
    showLoader: boolean
  ) {
    return (
      <div className="rootMessageContainer">
        <div className="rootMessage">
          <h1 className="rootMessageTitle">perf.html</h1>
          <div className="rootMessageText">{message}</div>
          {additionalMessage ? (
            <div className="rootMessageAdditional">
              {toParagraphs(additionalMessage)}
              <a href="/">Back to home</a>
            </div>
          ) : null}
          {showLoader ? (
            <div className="loading">
              <div className="loading-div loading-div-1 loading-row-1" />
              <div className="loading-div loading-div-2 loading-row-2" />
              <div className="loading-div loading-div-3 loading-row-3" />
              <div className="loading-div loading-div-4 loading-row-3" />
              <div className="loading-div loading-div-5 loading-row-4" />
              <div className="loading-div loading-div-6 loading-row-4" />
              <div className="loading-div loading-div-7 loading-row-4" />
              <div className="loading-div loading-div-8 loading-row-4" />
              <div className="loading-div loading-div-9 loading-row-4" />
              <div className="loading-div loading-div-10 loading-row-4" />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  renderAppropriateComponents() {
    const { view, dataSource, hasZipFile } = this.props;
    const phase = view.phase;
    if (dataSource === 'none') {
      return <Home />;
    }
    switch (phase) {
      case 'INITIALIZING': {
        const loadingMessage = LOADING_MESSAGES[dataSource];
        const message = loadingMessage ? loadingMessage : 'View not found';
        const showLoader = Boolean(loadingMessage);

        let additionalMessage = '';
        if (view.additionalData) {
          if (view.additionalData.message) {
            additionalMessage = view.additionalData.message;
          }

          if (view.additionalData.attempt) {
            const attempt = view.additionalData.attempt;
            additionalMessage += `\nTried ${fewTimes(attempt.count)} out of ${
              attempt.total
            }.`;
          }
        }

        return this.renderMessage(message, additionalMessage, showLoader);
      }
      case 'FATAL_ERROR': {
        const message =
          ERROR_MESSAGES[dataSource] || "Couldn't retrieve the profile.";
        let additionalMessage = null;
        if (view.error) {
          console.error(view.error);
          additionalMessage =
            `${view.error.toString()}\n` +
            'The full stack has been written to the Web Console.';
        }

        return this.renderMessage(message, additionalMessage, false);
      }
      case 'DATA_LOADED':
        // The data is now loaded. This could be either a single profile, or a zip file
        // with multiple profiles. Only show the ZipFileViewer if the data loaded is a
        // Zip file, and there is no stored path into the zip file.
        return hasZipFile ? <ZipFileViewer /> : <ProfileViewer />;
      case 'ROUTE_NOT_FOUND':
      default:
        // Assert with Flow that we've handled all the cases, as the only thing left
        // should be 'ROUTE_NOT_FOUND'.
        (phase: 'ROUTE_NOT_FOUND');
        return (
          <Home specialMessage="The URL you came in on was not recognized." />
        );
    }
  }

  render() {
    return (
      <Fragment>
        <ServiceWorkerManager />
        {this.renderAppropriateComponents()}
      </Fragment>
    );
  }
}

const options: ExplicitConnectOptions<
  {||},
  ProfileViewStateProps,
  ProfileViewDispatchProps
> = {
  mapStateToProps: (state: State) => ({
    view: getView(state),
    dataSource: getDataSource(state),
    hash: getHash(state),
    profileUrl: getProfileUrl(state),
    hasZipFile: getHasZipFile(state),
  }),
  mapDispatchToProps: {
    retrieveProfileFromStore,
    retrieveProfileOrZipFromUrl,
    retrieveProfileFromAddon,
  },
  component: ProfileViewWhenReadyImpl,
};
export const ProfileViewWhenReady = explicitConnect(options);

type RootProps = {
  store: Store,
};

export default class Root extends PureComponent<RootProps> {
  render() {
    const { store } = this.props;
    return (
      <Provider store={store}>
        <UrlManager>
          <ProfileViewWhenReady />
          <FooterLinks />
        </UrlManager>
      </Provider>
    );
  }
}
