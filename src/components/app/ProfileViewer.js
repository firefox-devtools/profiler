/* this source code form is subject to the terms of the mozilla public
 * license, v. 2.0. if a copy of the mpl was not distributed with this
 * file, you can obtain one at http://mozilla.org/mpl/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import DetailsContainer from './DetailsContainer';
import ProfileFilterNavigator from './ProfileFilterNavigator';
import MenuButtons from './MenuButtons';
import WindowTitle from '../shared/WindowTitle';
import SymbolicationStatusOverlay from './SymbolicationStatusOverlay';
import { ProfileName } from './ProfileName';
import BeforeUnloadManager from './BeforeUnloadManager';

import { returnToZipFileList } from '../../actions/zipped-profiles';
import Timeline from '../timeline';
import { getHasZipFile } from '../../selectors/zipped-profiles';
import SplitterLayout from 'react-splitter-layout';
import { invalidatePanelLayout } from '../../actions/app';
import { getTimelineHeight } from '../../selectors/app';
import {
  getUploadProgress,
  getUploadPhase,
  getIsHidingStaleProfile,
  getHasSanitizedProfile,
} from '../../selectors/publish';
import { getIconsWithClassNames } from '../../selectors/icons';
import { BackgroundImageStyleDef } from '../shared/StyleDef';
import classNames from 'classnames';
import { DebugWarning } from '../app/DebugWarning';

import type { CssPixels, IconWithClassName } from 'firefox-profiler/types';
import type { ConnectedProps } from '../../utils/connect';

require('./ProfileViewer.css');

type StateProps = {|
  +hasZipFile: boolean,
  +timelineHeight: CssPixels | null,
  +uploadProgress: number,
  +isUploading: boolean,
  +isHidingStaleProfile: boolean,
  +hasSanitizedProfile: boolean,
  +icons: IconWithClassName[],
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
      returnToZipFileList,
      invalidatePanelLayout,
      timelineHeight,
      isUploading,
      uploadProgress,
      isHidingStaleProfile,
      hasSanitizedProfile,
      icons,
    } = this.props;

    return (
      <div
        className={classNames({
          profileViewerWrapper: true,
          profileViewerWrapperBackground: hasSanitizedProfile,
        })}
      >
        {icons.map(({ className, icon }) => (
          <BackgroundImageStyleDef
            className={className}
            url={icon}
            key={className}
          />
        ))}
        <div
          className={classNames({
            profileViewer: true,
            profileViewerFadeInSanitized:
              hasSanitizedProfile && !isHidingStaleProfile,
            profileViewerFadeOut: isHidingStaleProfile,
          })}
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
            <ProfileName />
            <ProfileFilterNavigator />
            {
              // Define a spacer in the middle that will shrink based on the availability
              // of space in the top bar. It will shrink away before any of the items
              // with actual content in them do.
            }
            <div className="profileViewerSpacer" />
            <MenuButtons />
            {isUploading ? (
              <div
                className="menuButtonsPublishUploadBarInner"
                style={{ width: `${uploadProgress * 100}%` }}
              />
            ) : null}
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
          <WindowTitle />
          <SymbolicationStatusOverlay />
          <BeforeUnloadManager />
          <DebugWarning />
        </div>
      </div>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    hasZipFile: getHasZipFile(state),
    timelineHeight: getTimelineHeight(state),
    uploadProgress: getUploadProgress(state),
    isUploading: getUploadPhase(state) === 'uploading',
    isHidingStaleProfile: getIsHidingStaleProfile(state),
    hasSanitizedProfile: getHasSanitizedProfile(state),
    icons: getIconsWithClassNames(state),
  }),
  mapDispatchToProps: {
    returnToZipFileList,
    invalidatePanelLayout,
  },
  component: ProfileViewer,
});
