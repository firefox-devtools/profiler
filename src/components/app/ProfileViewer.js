/* this source code form is subject to the terms of the mozilla public
 * license, v. 2.0. if a copy of the mpl was not distributed with this
 * file, you can obtain one at http://mozilla.org/mpl/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';

import { DetailsContainer } from './DetailsContainer';
import { SourceCodeFetcher } from './SourceCodeFetcher';
import { AssemblyCodeFetcher } from './AssemblyCodeFetcher';
import { BottomBox } from './BottomBox';
import { ProfileFilterNavigator } from './ProfileFilterNavigator';
import { MenuButtons } from './MenuButtons';
import { CurrentProfileUploadedInformationLoader } from './CurrentProfileUploadedInformationLoader';
import { SymbolicationStatusOverlay } from './SymbolicationStatusOverlay';
import { ProfileName } from './ProfileName';
import { BeforeUnloadManager } from './BeforeUnloadManager';
import { KeyboardShortcut } from './KeyboardShortcut';

import { returnToZipFileList } from 'firefox-profiler/actions/zipped-profiles';
import { Timeline } from 'firefox-profiler/components/timeline';
import { getHasZipFile } from 'firefox-profiler/selectors/zipped-profiles';
import SplitterLayout from 'react-splitter-layout';
import { invalidatePanelLayout } from 'firefox-profiler/actions/app';
import { getTimelineHeight } from 'firefox-profiler/selectors/app';
import { getIsBottomBoxOpen } from 'firefox-profiler/selectors/url-state';
import {
  getUploadProgress,
  getUploadPhase,
  getIsHidingStaleProfile,
  getHasSanitizedProfile,
} from 'firefox-profiler/selectors/publish';

import { getIconsWithClassNames } from 'firefox-profiler/selectors/icons';
import { BackgroundImageStyleDef } from 'firefox-profiler/components/shared/StyleDef';
import classNames from 'classnames';
import { DebugWarning } from 'firefox-profiler/components/app/DebugWarning';

import type { CssPixels, IconsWithClassNames } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './ProfileViewer.css';

type StateProps = {|
  +hasZipFile: boolean,
  +timelineHeight: CssPixels | null,
  +uploadProgress: number,
  +isUploading: boolean,
  +isHidingStaleProfile: boolean,
  +hasSanitizedProfile: boolean,
  +icons: IconsWithClassNames,
  +isBottomBoxOpen: boolean,
|};

type DispatchProps = {|
  +returnToZipFileList: typeof returnToZipFileList,
  +invalidatePanelLayout: typeof invalidatePanelLayout,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileViewerImpl extends PureComponent<Props> {
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
      isBottomBoxOpen,
    } = this.props;

    return (
      <KeyboardShortcut
        wrapperClassName={classNames({
          profileViewerWrapper: true,
          profileViewerWrapperBackground: hasSanitizedProfile,
        })}
      >
        {[...icons].map(([icon, className]) => (
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
          <div id="screenshot-hover"></div>
          <div className="profileViewerTopBar">
            {hasZipFile ? (
              <button
                type="button"
                className="profileViewerZipButton"
                title="View all files in the archive"
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
            <SplitterLayout
              vertical
              percentage={true}
              // The DetailsContainer is primary.
              primaryIndex={0}
              // The BottomBox is secondary.
              secondaryInitialSize={40}
              onDragEnd={invalidatePanelLayout}
            >
              <DetailsContainer />
              {isBottomBoxOpen ? <BottomBox /> : null}
            </SplitterLayout>
          </SplitterLayout>
          <SymbolicationStatusOverlay />
          <BeforeUnloadManager />
          <DebugWarning />
          <CurrentProfileUploadedInformationLoader />
          <SourceCodeFetcher />
          <AssemblyCodeFetcher />
        </div>
      </KeyboardShortcut>
    );
  }
}

export const ProfileViewer = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    hasZipFile: getHasZipFile(state),
    timelineHeight: getTimelineHeight(state),
    uploadProgress: getUploadProgress(state),
    isUploading: getUploadPhase(state) === 'uploading',
    isHidingStaleProfile: getIsHidingStaleProfile(state),
    hasSanitizedProfile: getHasSanitizedProfile(state),
    icons: getIconsWithClassNames(state),
    isBottomBoxOpen: getIsBottomBoxOpen(state),
  }),
  mapDispatchToProps: {
    returnToZipFileList,
    invalidatePanelLayout,
  },
  component: ProfileViewerImpl,
});
