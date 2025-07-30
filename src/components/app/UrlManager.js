/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getView, getUrlSetupPhase } from 'firefox-profiler/selectors/app';
import {
  updateUrlState,
  startFetchingProfiles,
  urlSetupDone,
  show404,
  setupInitialUrlState,
  updateBrowserConnectionStatus,
} from 'firefox-profiler/actions/app';
import {
  urlFromState,
  stateFromLocation,
  getIsHistoryReplaceState,
} from 'firefox-profiler/app-logic/url-handling';
import { createBrowserConnection } from 'firefox-profiler/app-logic/browser-connection';
import {
  retrieveProfileForRawUrl,
  typeof retrieveProfileForRawUrl as RetrieveProfileForRawUrl,
} from 'firefox-profiler/actions/receive-profile';
import { ProfileLoaderAnimation } from './ProfileLoaderAnimation';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  ConnectedProps,
  WrapFunctionInDispatch,
} from 'firefox-profiler/utils/connect';
import type { UrlState, Phase, UrlSetupPhase } from 'firefox-profiler/types';

type StateProps = {
  readonly phase: Phase,
  readonly urlState: UrlState,
  readonly urlSetupPhase: UrlSetupPhase,
};

type DispatchProps = {
  readonly updateUrlState: typeof updateUrlState,
  readonly startFetchingProfiles: typeof startFetchingProfiles,
  readonly urlSetupDone: typeof urlSetupDone,
  readonly show404: typeof show404,
  readonly retrieveProfileForRawUrl: typeof retrieveProfileForRawUrl,
  readonly updateBrowserConnectionStatus: typeof updateBrowserConnectionStatus,
  readonly setupInitialUrlState: typeof setupInitialUrlState,
};

type OwnProps = {
  readonly children: React.Node,
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

/**
 * This component manages the interaction with the window.history browser API.
 *
 * There are two different profile loading paths currently:
 * 1. Initial URL processing:
 *    This happens when user loads a URL with a profile hash or URL.
 *    In the first load, we have the URL but we don't have the `UrlState` to get the
 *    information from it and download the profile. So we have these steps in the
 *    initial URL processsing:
 *    1. Get the intial raw url, set the `urlSetupPhase` as 'initial-load'.
 *    2. Extract the `dataSource` from the raw url.
 *    3. Extract the profile hash or URL from it if it's in the store and download
 *       it, or retrieve from Firefox. Set the `urlSetupPhase` as 'loading-profile'.
 *    4. Upgrade the URL with downloaded profile data and setup initial `UrlState`.
 *    5. Finalize the profile view with the `UrlState` information. (we couldn't
 *       finalize the profile view immediately after the download because we need
 *       `UrlState` for this step.)
 *    6. Set the `urlSetupPhase` as 'done' and display the profile view.
 *
 * 2. State changes after some user interactions (e.g. drag and drop):
 *    In this path, the initial URL processing is already done, and this path is
 *    being used if `dataSource` changes after some user interaction. This is
 *    handled by `ProfileLoader` component. This path has these steps:
 *    1. Get the `dataSource` and `hash/profileUrl` information from the store.
 *    2. Download the profile.
 *    3. Update the `UrlState` to reflect the changes and finalize the profile
 *       view with the `UrlState` information.
 *    4. Display the profile view.
 */
class UrlManagerImpl extends React.PureComponent<Props> {
  async _processInitialUrls() {
    const {
      startFetchingProfiles,
      setupInitialUrlState,
      urlSetupDone,
      updateBrowserConnectionStatus,
    } = this.props;
    // We have to wrap this because of the error introduced by upgrading to v0.96.0. See issue #1936.
    const retrieveProfileForRawUrl: WrapFunctionInDispatch<RetrieveProfileForRawUrl> =
      (this.props.retrieveProfileForRawUrl: any);

    // Notify the UI that we are starting to fetch profiles.
    startFetchingProfiles();

    // Establish a connection to the browser, for certain URLs. This isn't the best
    // place to do it, but hopefully this code will be cleaned up soon;
    // in the future, this will have a normal (non-overridden) UserAgent check and
    // will be done for all URLs.
    let browserConnectionStatus;
    const route = window.location.pathname.split('/').filter((s) => s)[0];
    if (
      ['from-browser', 'from-addon', 'from-file', 'from-post-message'].includes(
        route
      )
    ) {
      updateBrowserConnectionStatus({ status: 'WAITING' });
      browserConnectionStatus = await createBrowserConnection();
      updateBrowserConnectionStatus(browserConnectionStatus);
    }

    try {
      // Process the raw url and fetch the profile.
      // We try to fetch the profile before setting the url state, because we
      // may need the profile data during URL upgrading.
      //
      // In some cases, the returned profile will be null:
      //  - If the response is a zip file (even if the URL tells us which file
      //    to pick from the zip file).
      //  - If a fatal error was encountered in the process of retrieving and
      //    processing the profile.
      //
      // To handle the latter case properly, we won't `pushState` if we're in
      // a FATAL_ERROR state.

      const profile = await retrieveProfileForRawUrl(
        window.location,
        browserConnectionStatus
      );
      const browserConnection =
        browserConnectionStatus !== undefined &&
        browserConnectionStatus.status === 'ESTABLISHED'
          ? browserConnectionStatus.browserConnection
          : null;
      setupInitialUrlState(window.location, profile, browserConnection);
    } catch (error) {
      // Complete the URL setup, as values can come from the user, so we should
      // still proceed with loading the app.
      console.error('There was an error in the initial URL setup.', error);
      urlSetupDone();
    }
  }

  _updateState = () => {
    const { updateUrlState, show404, urlState: previousUrlState } = this.props;
    let newUrlState;
    if (window.history.state) {
      // The UrlState is serialized and stored in the history API. Pull out that state
      // and use it as the real UrlState.
      newUrlState = (window.history.state: UrlState);
    } else {
      // There is no state serialized and stored by the browser, attempt to create
      // a UrlState object by parsing the window.location.
      try {
        newUrlState = stateFromLocation(window.location);
      } catch (e) {
        // The location could not be parsed, show a 404 instead.
        console.error(e);
        show404(window.location.pathname + window.location.search);
        return;
      }
    }

    // Profile sanitization and publishing can do weird things for the history API
    // and we could end up having unconsistent state.
    // That's why we prevent going back in history in these cases:
    // 1 - between "from-browser" and "public" (in any direction)
    // 2 - with the "public" datasource when the hash changes (this means the
    //     user once published again an already public profile, and then wants to go
    //     back).
    // But we want to accept the other interactions.

    // 1. Do we move between a transient data source and "public"?
    const transientDataSources = [
      'from-browser',
      'from-post-message',
      'unpublished',
    ];
    const movesBetweenFromBrowserAndPublic =
      // transient -> public
      (transientDataSources.includes(previousUrlState.dataSource) &&
        newUrlState.dataSource === 'public') ||
      // or public -> transient
      (previousUrlState.dataSource === 'public' &&
        transientDataSources.includes(newUrlState.dataSource));

    // 2. Do we move between 2 different hashes for a public profile
    const movesBetweenHashValues =
      previousUrlState.dataSource === 'public' &&
      newUrlState.dataSource === 'public' &&
      previousUrlState.hash !== newUrlState.hash;

    if (movesBetweenFromBrowserAndPublic || movesBetweenHashValues) {
      window.history.replaceState(
        previousUrlState,
        document.title,
        urlFromState(previousUrlState)
      );
      return;
    }

    // Update the Redux store.
    updateUrlState(newUrlState);
  };

  componentDidMount() {
    this._processInitialUrls();
    window.addEventListener('popstate', this._updateState);
  }

  componentWillUnmount() {
    window.removeEventListener('popstate', this._updateState);
  }

  componentDidUpdate() {
    const { urlSetupPhase, phase, urlState } = this.props;
    if (urlSetupPhase !== 'done') {
      // Do not change the history before the url setup is done, because the URL
      // state isn't in a consistent state yet.
      return;
    }

    if (phase === 'FATAL_ERROR') {
      // Even if the url setup phase is done, we must not change the URL if
      // we're in a FATAL_ERROR state. Likely the profile update failed, and so
      // the url state wasn't initialized properly. Therefore trying to
      // pushState will result in a broken URL and break reload mechanisms,
      // especially the reload we do in ServiceWorkerManager.
      return;
    }

    const oldUrl = window.location.pathname + window.location.search;
    const newUrl = urlFromState(urlState);
    if (!window.history.state || getIsHistoryReplaceState()) {
      // Replace the URL state if we've specifically flagged to replace the URL
      // state. This happens during the loading process. Also do it if we don't
      // have an history state yet.
      window.history.replaceState(urlState, document.title, newUrl);
    } else if (newUrl !== oldUrl) {
      // Push the URL state when we haven't set a flag to only replace the state.
      window.history.pushState(urlState, document.title, newUrl);
    }
  }

  render() {
    const { urlSetupPhase, children } = this.props;
    switch (urlSetupPhase) {
      case 'initial-load':
        return null;
      case 'loading-profile':
        return <ProfileLoaderAnimation />;
      case 'done':
        return children;
      default:
        assertExhaustiveCheck(urlSetupPhase, `Unhandled URL setup phase.`);
        return null;
    }
  }
}

export const UrlManager = explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    urlState: state.urlState,
    urlSetupPhase: getUrlSetupPhase(state),
    phase: getView(state).phase,
  }),
  mapDispatchToProps: {
    updateUrlState,
    startFetchingProfiles,
    urlSetupDone,
    show404,
    setupInitialUrlState,
    retrieveProfileForRawUrl,
    updateBrowserConnectionStatus,
  },
  component: UrlManagerImpl,
});
