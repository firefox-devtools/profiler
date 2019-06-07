/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';

import explicitConnect from '../../utils/connect';
import { getProfileName } from '../../selectors/url-state';
import { changeProfileName } from '../../actions/profile-view';

import type { ConnectedProps } from '../../utils/connect';

import './ProfileName.css';

type StateProps = {|
  +profileName: string | null,
|};

type DispatchProps = {|
  +changeProfileName: typeof changeProfileName,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;
class ProfileNameImpl extends React.PureComponent<Props> {
  render() {
    const { profileName } = this.props;
    return <div className="profileViewerName">{profileName}</div>;
  }
}

export const ProfileName = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    profileName: getProfileName(state),
  }),
  mapDispatchToProps: {
    changeProfileName,
  },
  component: ProfileNameImpl,
});
