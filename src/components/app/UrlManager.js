/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';
import { getUrlSetupPhase } from 'selectors/app';
import {
  updateUrlState,
  startFetchingProfiles,
  urlSetupDone,
  show404,
  setupInitialUrlState,
} from '../../actions/app';
import {
  urlFromState,
  stateFromLocation,
  getIsHistoryReplaceState,
} from '../../app-logic/url-handling';
import {
  getProfilesFromRawUrl,
  typeof getProfilesFromRawUrl as GetProfilesFromRawUrl,
} from '../../actions/receive-profile';
import { ProfileLoaderAnimation } from './ProfileLoaderAnimation';
import { assertExhaustiveCheck } from '../../utils/flow';

import type {
  ConnectedProps,
  WrapFunctionInDispatch,
} from '../../utils/connect';
import type { UrlState, UrlSetupPhase } from '../../types/state';
import type { Profile } from '../../types/profile';

type StateProps = {|
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
class UrlManager extends React.PureComponent<Props> {
  async _processInitialUrls() {
    const {
      startFetchingProfiles,
      setupInitialUrlState,
      urlSetupDone,
    } = this.props;
    // We have to wrap this because of the error introduced by upgrading to v0.96.0. See issue #1936.
    const getProfilesFromRawUrl: WrapFunctionInDispatch<GetProfilesFromRawUrl> = (this
      .props.getProfilesFromRawUrl: any);
    startFetchingProfiles();

    try {
      // Process the raw url and fetch the profile.
      const results: {
        profile: Profile | null,
        shouldSetupInitialUrlState: boolean,
      } = await getProfilesFromRawUrl(window.location);

      // Manually coerce these into the proper type due to the FlowFixMe above.
      // Profile may be null only for the `from-addon` dataSource since we do
      // not `await` for retrieveProfileFromAddon function.
      const profile: Profile | null = results.profile;
      const shouldSetupInitialUrlState: boolean =
        results.shouldSetupInitialUrlState;
      if (profile !== null && shouldSetupInitialUrlState) {
        setupInitialUrlState(window.location, profile);
      } else {
        urlSetupDone();
      }
    } catch (error) {
      // Silently complete the url setup.
      urlSetupDone();
    }
  }

  _updateState() {
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

    if (
      previousUrlState.dataSource !== newUrlState.dataSource ||
      previousUrlState.hash !== newUrlState.hash
    ) {
      // Profile sanitization and publishing can do weird things for the history API.
      // Rather than write lots of complicated interactions, just prevent the back button
      // from working when going between a published profile, and one that is not.
      window.history.replaceState(
        previousUrlState,
        document.title,
        urlFromState(previousUrlState)
      );
      return;
    }

    // Update the Redux store.
    updateUrlState(newUrlState);
  }

  componentDidMount() {
    this._processInitialUrls();
    window.addEventListener('popstate', () => this._updateState());
  }

  componentWillReceiveProps(nextProps: Props) {
    if (nextProps.urlSetupPhase !== 'done') {
      return;
    }
    const newUrl = urlFromState(nextProps.urlState);
    if (newUrl !== window.location.pathname + window.location.search) {
      if (!getIsHistoryReplaceState()) {
        // Push the URL state only when the url setup is done, and we haven't set
        // a flag to only replace the state.
        window.history.pushState(nextProps.urlState, document.title, newUrl);
      } else {
        // Replace the URL state before the URL setup is done, and if we've specifically
        // flagged to replace the URL state.
        window.history.replaceState(nextProps.urlState, document.title, newUrl);
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

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    urlState: state.urlState,
    urlSetupPhase: getUrlSetupPhase(state),
  }),
  mapDispatchToProps: {
    updateUrlState,
    startFetchingProfiles,
    urlSetupDone,
    show404,
    setupInitialUrlState,
    getProfilesFromRawUrl,
  },
  component: UrlManager,
});
