/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../../utils/connect';
import {
  getProfile,
  getProfileRootRange,
  getProfileSharingStatus,
} from '../../../selectors/profile';
import { getDataSource, getUrlPredictor } from '../../../selectors/url-state';
import actions from '../../../actions';
import { MenuButtonsMetaInfo } from './MetaInfo';
import { MenuButtonsProfileSharing } from './ProfileSharing';
import { ProfileDownloadButton } from './Download';

import type { StartEndRange } from '../../../types/units';
import type { Profile } from '../../../types/profile';
import type { Action, DataSource } from '../../../types/actions';
import type { ProfileSharingStatus } from '../../../types/state';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../../utils/connect';

require('./index.css');

type StateProps = {|
  +profile: Profile,
  +rootRange: StartEndRange,
  +dataSource: DataSource,
  +profileSharingStatus: ProfileSharingStatus,
  +predictUrl: (Action | Action[]) => string,
|};

type DispatchProps = {|
  +profilePublished: typeof actions.profilePublished,
  +setProfileSharingStatus: typeof actions.setProfileSharingStatus,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

const MenuButtons = ({
  profile,
  rootRange,
  dataSource,
  profilePublished,
  profileSharingStatus,
  setProfileSharingStatus,
  predictUrl,
}: Props) => (
  <>
    {/* Place the info button outside of the menu buttons to allow it to shrink. */}
    <MenuButtonsMetaInfo profile={profile} />
    <div className="menuButtons">
      <MenuButtonsProfileSharing
        profile={profile}
        dataSource={dataSource}
        onProfilePublished={profilePublished}
        profileSharingStatus={profileSharingStatus}
        setProfileSharingStatus={setProfileSharingStatus}
        predictUrl={predictUrl}
      />
      <ProfileDownloadButton profile={profile} rootRange={rootRange} />
      <a
        href="/docs/"
        target="_blank"
        className="menuButtonsLink"
        title="Open the documentation in a new window"
      >
        Docs<i className="open-in-new"></i>
      </a>
    </div>
  </>
);

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    profile: getProfile(state),
    rootRange: getProfileRootRange(state),
    dataSource: getDataSource(state),
    profileSharingStatus: getProfileSharingStatus(state),
    predictUrl: getUrlPredictor(state),
  }),
  mapDispatchToProps: {
    profilePublished: actions.profilePublished,
    setProfileSharingStatus: actions.setProfileSharingStatus,
  },
  component: MenuButtons,
};
export default explicitConnect(options);
