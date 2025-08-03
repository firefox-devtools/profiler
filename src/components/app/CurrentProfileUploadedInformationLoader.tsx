/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This component is responsible for caching the stored profile data in the
// redux state.  This will control whether we can delete this profile.

// Implementation note:
// This is done as a separate component than where the deletion button is
// rendered, so that the button doesn't flick, because the access to the stored
// profile data is asynchronous. It also nicely splits the responsibilities.
// Also this isn't in a thunk action to make it independent from any other
// change. It only depends on the current hash being changed.

import { PureComponent } from 'react';

import { getHash } from 'firefox-profiler/selectors/url-state';
import { setCurrentProfileUploadedInformation } from 'firefox-profiler/actions/app';

import { retrieveUploadedProfileInformationFromDb } from 'firefox-profiler/app-logic/uploaded-profiles-db';
import explicitConnect from 'firefox-profiler/utils/connect';

import { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {
  readonly hash: string;
};

type DispatchProps = {
  readonly setCurrentProfileUploadedInformation: typeof setCurrentProfileUploadedInformation;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class CurrentProfileUploadedInformationLoaderImpl extends PureComponent<Props> {
  async updateCurrentProfileInformationState() {
    // In tests we don't always have the indexeddb object. To avoid that we have
    // to add it to a lot of tests, let's bail out in this case.
    if (process.env.NODE_ENV === 'test' && window.indexedDB === undefined) {
      return;
    }

    const { hash, setCurrentProfileUploadedInformation } = this.props;
    const uploadedProfileInformation =
      await retrieveUploadedProfileInformationFromDb(hash);

    // The previous action is asynchronous, so let's make sure the current hash
    // is still the one we retrieved the information for.
    if (this.props.hash === hash) {
      setCurrentProfileUploadedInformation(uploadedProfileInformation || null);
    }
  }

  override componentDidMount() {
    this.updateCurrentProfileInformationState();
  }

  override componentDidUpdate() {
    this.updateCurrentProfileInformationState();
  }

  override render() {
    return null;
  }
}

export const CurrentProfileUploadedInformationLoader = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    hash: getHash(state),
  }),
  mapDispatchToProps: { setCurrentProfileUploadedInformation },
  component: CurrentProfileUploadedInformationLoaderImpl,
});
