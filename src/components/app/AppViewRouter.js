/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';

import { ProfileViewer } from './ProfileViewer';
import { ZipFileViewer } from './ZipFileViewer';
import { Home } from './Home';
import { CompareHome } from './CompareHome';
import { ProfileRootMessage } from './ProfileRootMessage';
import { getView } from 'firefox-profiler/selectors/app';
import { getHasZipFile } from 'firefox-profiler/selectors/zipped-profiles';
import {
  getDataSource,
  getProfilesToCompare,
} from 'firefox-profiler/selectors/url-state';
import { ProfileLoaderAnimation } from './ProfileLoaderAnimation';
import { UploadedRecordingsHome } from './UploadedRecordingsHome';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type { AppViewState, State, DataSource } from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

const ERROR_MESSAGES: { [string]: string } = Object.freeze({
  'from-addon': "Couldn't retrieve the profile from Firefox.",
  unpublished: "Couldn't retrieve the profile from Firefox.",
  'from-file': "Couldn't read the file or parse the profile in it.",
  local: 'Not implemented yet.',
  public: 'Could not download the profile.',
  'from-url': 'Could not download the profile.',
  compare: 'Could not retrieve the profile',
});

type AppViewRouterStateProps = {|
  +view: AppViewState,
  +dataSource: DataSource,
  +profilesToCompare: string[] | null,
  +hasZipFile: boolean,
|};

type AppViewRouterProps = ConnectedProps<{||}, AppViewRouterStateProps, {||}>;

class AppViewRouterImpl extends PureComponent<AppViewRouterProps> {
  render() {
    const { view, dataSource, profilesToCompare, hasZipFile } = this.props;
    const phase = view.phase;

    // We're using a switch to assert that all values for the dataSource has
    // been checked. This is useful when we add a new dataSource, as Flow will
    // error here if we forget to update this code.
    switch (dataSource) {
      case 'none':
        return <Home />;
      case 'compare':
        if (profilesToCompare === null) {
          return <CompareHome />;
        }
        break;
      case 'uploaded-recordings':
        return <UploadedRecordingsHome />;
      case 'from-addon':
      case 'unpublished':
      case 'from-file':
      case 'local':
      case 'public':
      case 'from-url':
        break;
      default:
        throw assertExhaustiveCheck(dataSource);
    }

    switch (phase) {
      case 'INITIALIZING':
      case 'PROFILE_LOADED':
      case 'DATA_RELOAD':
        return <ProfileLoaderAnimation />;
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
        (phase: 'ROUTE_NOT_FOUND');
        return (
          <Home specialMessage="The URL you came in on was not recognized." />
        );
    }
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
