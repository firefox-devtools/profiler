/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import SplitterLayout from 'react-splitter-layout';

import explicitConnect from '../../utils/connect';
import DetailsContainer from './DetailsContainer';
import ProfileFilterNavigator from './ProfileFilterNavigator';
import ProfileSharing from './ProfileSharing';
import SymbolicationStatusOverlay from './SymbolicationStatusOverlay';
import { returnToZipFileList } from '../../actions/zipped-profiles';
import { getHiddenThreads, getProfileName } from '../../reducers/url-state';
import { getThreads } from '../../reducers/profile-view';
import ProfileViewerHeader from '../header/ProfileViewerHeader';
import { getHasZipFile } from '../../reducers/zipped-profiles';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./ProfileViewer.css');

type StateProps = {|
  +profileName: string | null,
  +hasZipFile: boolean,
  +visibleThreadsSize: number,
|};

type DispatchProps = {|
  +returnToZipFileList: typeof returnToZipFileList,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileViewer extends PureComponent<Props> {
  render() {
    const {
      hasZipFile,
      profileName,
      returnToZipFileList,
      visibleThreadsSize,
    } = this.props;

    // Each thread is 50px high, the time ruler is 20px.
    // Eventually we might use a more automatic way, see
    // https://github.com/zesik/react-splitter-layout/issues/20
    const headerInitialSize = visibleThreadsSize * 50 + 20;
    return (
      <div className="profileViewer">
        <div className="profileViewerTopBar">
          {hasZipFile ? (
            <button
              type="button"
              className="profileViewerZipButton"
              title="View all files in the zip file"
              onClick={returnToZipFileList}
            />
          ) : null}
          {profileName ? (
            <div className="profileViewerName">{profileName}</div>
          ) : null}
          <ProfileFilterNavigator />
          <ProfileSharing />
        </div>
        <SymbolicationStatusOverlay />
        <SplitterLayout
          vertical={true}
          primaryIndex={1}
          secondaryInitialSize={headerInitialSize}
        >
          <ProfileViewerHeader />
          <DetailsContainer />
        </SplitterLayout>
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    profileName: getProfileName(state),
    hasZipFile: getHasZipFile(state),
    visibleThreadsSize:
      getThreads(state).length - getHiddenThreads(state).length,
  }),
  mapDispatchToProps: {
    returnToZipFileList,
  },
  component: ProfileViewer,
};

export default explicitConnect(options);
