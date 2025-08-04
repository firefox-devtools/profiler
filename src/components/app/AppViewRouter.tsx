/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
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
import { Localized } from '@fluent/react';

const ERROR_MESSAGES_L10N_ID: { [key: string]: string } = Object.freeze({
  'from-browser': 'AppViewRouter--error-unpublished',
  'from-post-message': 'AppViewRouter--error-from-post-message',
  unpublished: 'AppViewRouter--error-unpublished',
  'from-file': 'AppViewRouter--error-from-file',
  local: 'AppViewRouter--error-local',
  public: 'AppViewRouter--error-public',
  'from-url': 'AppViewRouter--error-from-url',
  compare: 'AppViewRouter--error-compare',
});

type AppViewRouterStateProps = {
  readonly view: AppViewState;
  readonly dataSource: DataSource;
  readonly profilesToCompare: string[] | null;
  readonly hasZipFile: boolean;
};

type AppViewRouterProps = ConnectedProps<{}, AppViewRouterStateProps, {}>;

class AppViewRouterImpl extends PureComponent<AppViewRouterProps> {
  override render() {
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
      case 'from-browser':
      case 'from-post-message':
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
        let message =
          ERROR_MESSAGES_L10N_ID[dataSource] || 'AppViewRouter--error-public';
        let additionalMessage = null;
        if (view.error) {
          if (view.error.name === 'SafariLocalhostHTTPLoadError') {
            message = 'AppViewRouter--error-from-localhost-url-safari';
          } else {
            console.error(view.error);
            additionalMessage = (
              <>
                <p>{view.error.toString()}</p>
                <p>The full stack has been written to the Web Console.</p>
              </>
            );
          }
        }

        return (
          <Localized
            id={message}
            attrs={{ title: true }}
            elems={{
              // WebKit bug link, only used for AppViewRouter--message-from-localhost-url-safari
              a: (
                <a
                  href="https://bugs.webkit.org/show_bug.cgi?id=171934"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
            }}
          >
            <ProfileRootMessage
              additionalMessage={additionalMessage}
              showLoader={false}
              showBackHomeLink={true}
            >{`missing translation for ${message}`}</ProfileRootMessage>
          </Localized>
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
        // Assert with TypeScript that we've handled all the cases, as the only thing left
        // should be 'ROUTE_NOT_FOUND' or 'PROFILE_LOADED'.
        phase as 'ROUTE_NOT_FOUND';
        return (
          <Localized
            id="AppViewRouter--route-not-found--home"
            attrs={{ specialMessage: true }}
          >
            <Home specialMessage="The URL you tried to reach was not recognized." />
          </Localized>
        );
    }
  }
}

export const AppViewRouter = explicitConnect<{}, AppViewRouterStateProps, {}>({
  mapStateToProps: (state: State) => ({
    view: getView(state),
    dataSource: getDataSource(state),
    profilesToCompare: getProfilesToCompare(state),
    hasZipFile: getHasZipFile(state),
  }),
  component: AppViewRouterImpl,
});
