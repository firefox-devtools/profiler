/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import DetailsContainer from './DetailsContainer';
import ProfileFilterNavigator from './ProfileFilterNavigator';
import MenuButtons from './MenuButtons';
import SymbolicationStatusOverlay from './SymbolicationStatusOverlay';
import { returnToZipFileList } from '../../actions/zipped-profiles';
import { getProfileName } from '../../selectors/url-state';
import Timeline from '../timeline';
import { getHasZipFile } from '../../selectors/zipped-profiles';
import SplitterLayout from 'react-splitter-layout';
import { invalidatePanelLayout } from '../../actions/app';
import { getTimelineHeight } from '../../selectors/app';

import type { CssPixels } from '../../types/units';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./ProfileViewer.css');

type StateProps = {|
  +profileName: string | null,
  +hasZipFile: boolean,
  +timelineHeight: CssPixels | null,
|};

type DispatchProps = {|
  +returnToZipFileList: typeof returnToZipFileList,
  +invalidatePanelLayout: typeof invalidatePanelLayout,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileViewer extends PureComponent<Props> {
  render() {
    const {
      hasZipFile,
      profileName,
      returnToZipFileList,
      invalidatePanelLayout,
      timelineHeight,
    } = this.props;

    return (
      <div
        className="profileViewer"
        style={
          timelineHeight === null
            ? {}
            : {
                '--profile-viewer-splitter-max-height': `${timelineHeight}px`,
              }
        }
      >
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
          {/*
           * Define a spacer in the middle that will shrink based on the availability
           * of space in the top bar. It will shrink away before any of the items
           * with actual content in them do.
           */}
          <div className="profileViewerSpacer" />
          <MenuButtons />
        </div>
        <SplitterLayout
          customClassName="profileViewerSplitter"
          vertical
          percentage={false}
          // The DetailsContainer is primary.
          primaryIndex={1}
          // The Timeline is secondary.
          secondaryInitialSize={270}
          onDragEnd={invalidatePanelLayout}
        >
          <Timeline />
          <DetailsContainer />
        </SplitterLayout>
        <SymbolicationStatusOverlay />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    profileName: getProfileName(state),
    hasZipFile: getHasZipFile(state),
    timelineHeight: getTimelineHeight(state),
  }),
  mapDispatchToProps: {
    returnToZipFileList,
    invalidatePanelLayout,
  },
  component: ProfileViewer,
};

// $FlowFixMe Error introduced by upgrading to v0.96.0.
export default explicitConnect(options);
