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
} from 'firefox-profiler/actions/app';
import {
  urlFromState,
  stateFromLocation,
  getIsHistoryReplaceState,
} from 'firefox-profiler/app-logic/url-handling';
import {
  getProfilesFromRawUrl,
  typeof getProfilesFromRawUrl as GetProfilesFromRawUrl,
} from 'firefox-profiler/actions/receive-profile';
import { ProfileLoaderAnimation } from './ProfileLoaderAnimation';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  ConnectedProps,
  WrapFunctionInDispatch,
} from 'firefox-profiler/utils/connect';
import type { UrlState, Phase, UrlSetupPhase } from 'firefox-profiler/types';

type StateProps = {|
  +phase: Phase,
  +urlState: UrlState,
  +urlSetupPhase: UrlSetupPhase,
|};

type DispatchProps = {|
  +updateUrlState: typeof updateUrlState,
  +startFetchingProfiles: typeof startFetchingProfiles,
  +urlSetupDone: typeof urlSetupDone,
  +show404: typeof show404,
  +getProfilesFromRawUrl: typeof getProfilesFromRawUrl,
  +setupInitialUrlState: typeof setupInitialUrlState,
|};

type OwnProps = {|
  +children: React.Node,
|};

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
    } = this.props;
    // We have to wrap this because of the error introduced by upgrading to v0.96.0. See issue #1936.
    const getProfilesFromRawUrl: WrapFunctionInDispatch<GetProfilesFromRawUrl> = (this
      .props.getProfilesFromRawUrl: any);

    // Notify the UI that we are starting to fetch profiles.
    startFetchingProfiles();

    try {
      // Process the raw url and fetch the profile.
      // We try to fetch the profile before setting the url state, because
      // while processing and especially upgrading the url information we may
      // need the profile data.
      //
      // Also note the profile may be null for the `from-addon` dataSource since
      // we do not `await` for retrieveProfileFromAddon function, but also in
      // case of fatal errors in the process of retrieving and processing a
      // profile. To handle the latter case properly, we won't `pushState` if
      // we're in a FATAL_ERROR state.
      const {
        profile,
        shouldSetupInitialUrlState,
      } = await getProfilesFromRawUrl(window.location);
      if (profile !== null && shouldSetupInitialUrlState) {
        setupInitialUrlState(window.location, profile);
      } else {
        urlSetupDone();
      }
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
    // 1 - between "from-addon" and "public" (in any direction)
    // 2 - with the "public" datasource when the hash changes (this means the
    //     user once published again an already public profile, and then wants to go
    //     back).
    // But we want to accept the other interactions.

    // 1. Do we move between "from-addon" and "public"?
    const movesBetweenFromAddonAndPublic =
      // from-addon -> public
      (previousUrlState.dataSource === 'from-addon' &&
        newUrlState.dataSource === 'public') ||
      // or public -> from-addon
      (previousUrlState.dataSource === 'public' &&
        newUrlState.dataSource === 'from-addon');

    // 2. Do we move between 2 different hashes for a public profile
    const movesBetweenHashValues =
      previousUrlState.dataSource === 'public' &&
      newUrlState.dataSource === 'public' &&
      previousUrlState.hash !== newUrlState.hash;

    if (movesBetweenFromAddonAndPublic || movesBetweenHashValues) {
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

    const newUrl = urlFromState(urlState);
    if (newUrl !== window.location.pathname + window.location.search) {
      if (!getIsHistoryReplaceState()) {
        // Push the URL state only when the url setup is done, and we haven't set
        // a flag to only replace the state.
        window.history.pushState(urlState, document.title, newUrl);
      } else {
        // Replace the URL state before the URL setup is done, and if we've specifically
        // flagged to replace the URL state.
        window.history.replaceState(urlState, document.title, newUrl);
      }
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
  mapStateToProps: state => ({
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
    getProfilesFromRawUrl,
  },
  component: UrlManagerImpl,
});
