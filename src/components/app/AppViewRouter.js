/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { Fragment, PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import ProfileViewer from './ProfileViewer';
import ZipFileViewer from './ZipFileViewer';
import Home from './Home';
import CompareHome from './CompareHome';
import { ProfileRootMessage } from './ProfileRootMessage';
import { getView } from '../../selectors/app';
import { getHasZipFile } from '../../selectors/zipped-profiles';
import { getDataSource, getProfilesToCompare } from '../../selectors/url-state';
import ServiceWorkerManager from './ServiceWorkerManager';

import type { AppViewState, State } from '../../types/state';
import type { DataSource } from '../../types/actions';
import type { ConnectedProps } from '../../utils/connect';

const LOADING_MESSAGES: { [string]: string } = Object.freeze({
  'from-addon': 'Grabbing the profile from the Gecko Profiler Addon...',
  'from-file': 'Reading the file and processing the profile...',
  local: 'Not implemented yet.',
  public: 'Downloading and processing the profile...',
  'from-url': 'Downloading and processing the profile...',
  compare: 'Reading and processing profiles...',
});

const ERROR_MESSAGES: { [string]: string } = Object.freeze({
  'from-addon': "Couldn't retrieve the profile from the Gecko Profiler Addon.",
  'from-file': "Couldn't read the file or parse the profile in it.",
  local: 'Not implemented yet.',
  public: 'Could not download the profile.',
  'from-url': 'Could not download the profile.',
  compare: 'Could not retrieve the profile',
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

type AppViewRouterStateProps = {|
  +view: AppViewState,
  +dataSource: DataSource,
  +profilesToCompare: string[] | null,
  +hasZipFile: boolean,
|};

type AppViewRouterProps = ConnectedProps<{||}, AppViewRouterStateProps, {||}>;

class AppViewRouterImpl extends PureComponent<AppViewRouterProps> {
  renderCurrentRoute() {
    const { view, dataSource, profilesToCompare, hasZipFile } = this.props;
    const phase = view.phase;
    if (dataSource === 'none') {
      return <Home />;
    }

    if (dataSource === 'compare' && profilesToCompare === null) {
      return <CompareHome />;
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

        return (
          <ProfileRootMessage
            message={message}
            additionalMessage={additionalMessage}
            showLoader={showLoader}
          />
        );
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

        return (
          <ProfileRootMessage
            message={message}
            additionalMessage={additionalMessage}
            showLoader={false}
          />
        );
      }
      case 'DATA_LOADED':
        // The data is now loaded. This could be either a single profile, or a zip file
        // with multiple profiles. Only show the ZipFileViewer if the data loaded is a
        // Zip file, and there is no stored path into the zip file.
        return hasZipFile ? <ZipFileViewer /> : <ProfileViewer />;
      case 'TRANSITIONING_FROM_STALE_PROFILE':
        return null;
      case 'ROUTE_NOT_FOUND':
      default:
        // Assert with Flow that we've handled all the cases, as the only thing left
        // should be 'ROUTE_NOT_FOUND' or 'PROFILE_LOADED'.
        (phase: 'ROUTE_NOT_FOUND' | 'PROFILE_LOADED');
        return (
          <Home specialMessage="The URL you came in on was not recognized." />
        );
    }
  }

  render() {
    return (
      <Fragment>
        <ServiceWorkerManager />
        {this.renderCurrentRoute()}
      </Fragment>
    );
  }
}

export const AppViewRouter = explicitConnect<
  {||},
  AppViewRouterStateProps,
  {||}
>({
  mapStateToProps: (state: State) => ({
    view: getView(state),
    dataSource: getDataSource(state),
    profilesToCompare: getProfilesToCompare(state),
    hasZipFile: getHasZipFile(state),
  }),
  component: AppViewRouterImpl,
});
