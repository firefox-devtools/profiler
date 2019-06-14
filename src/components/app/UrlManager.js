/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';
import { getUrlSetupPhase } from '../../selectors/app';
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
import { getProfilesFromRawUrl } from '../../actions/receive-profile';
import { ProfileLoaderAnimation } from './ProfileLoaderAnimation';
import { assertExhaustiveCheck } from '../../utils/flow';

import type { ConnectedProps } from '../../utils/connect';
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
 */
class UrlManager extends React.PureComponent<Props> {
  async _processInitialUrls() {
    const {
      startFetchingProfiles,
      getProfilesFromRawUrl,
      setupInitialUrlState,
      urlSetupDone,
    } = this.props;
    let profile: Profile | null = null;
    let error;

    startFetchingProfiles();

    try {
      // Process the raw url and fetch the profile.
      // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
      profile = await getProfilesFromRawUrl(window.location);
    } catch (err) {
      error = err;
    }

    if (profile) {
      setupInitialUrlState(window.location, profile);
    } else if (error) {
      // Just silently finish the url setup and return to home.
      urlSetupDone();
    } else {
      throw new Error(
        'An unhandled case was reached during the initial processing of URLs'
      );
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
    const { urlSetupPhase } = this.props;
    if (urlSetupPhase !== 'done') {
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
