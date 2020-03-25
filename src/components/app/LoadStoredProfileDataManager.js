/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// This component is responsible for caching the stored profile data in the
// redux state.  This will control whether we can delete this profile.

// Implementation note:
// This is done as a separate component than where the deletion button is
// rendered, so that the button doesn't flick, because the access to the stored
// profile data is asynchronous.
// Also this isn't in a thunk action to make it independent from any other
// change. It only depends on the current hash being changed.

import { PureComponent } from 'react';

import { getHash } from 'firefox-profiler/selectors/url-state';
import { cacheStoredProfileData } from 'firefox-profiler/actions/app';

import { retrieveProfileData } from 'firefox-profiler/app-logic/published-profiles-store';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +hash: string,
|};

type DispatchProps = {|
  +cacheStoredProfileData: typeof cacheStoredProfileData,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class LoadStoredProfileDataManagerImpl extends PureComponent<Props> {
  async updateCanBeDeletedState() {
    // In tests we don't always have the indexeddb object. To avoid that we have
    // to add it to a lot of tests, let's bail out in this case.
    if (process.env.NODE_ENV === 'test' && window.indexedDB === undefined) {
      return;
    }

    const { hash, cacheStoredProfileData } = this.props;
    const profileData = await retrieveProfileData(hash);
    cacheStoredProfileData(profileData || null);
  }

  componentDidMount() {
    this.updateCanBeDeletedState();
  }

  componentDidUpdate() {
    this.updateCanBeDeletedState();
  }

  render() {
    return null;
  }
}

export const LoadStoredProfileDataManager = explicitConnect<
  {||},
  StateProps,
  DispatchProps
>({
  mapStateToProps: state => ({
    hash: getHash(state),
  }),
  mapDispatchToProps: { cacheStoredProfileData },
  component: LoadStoredProfileDataManagerImpl,
});
