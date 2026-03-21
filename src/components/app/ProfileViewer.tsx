/* this source code form is subject to the terms of the mozilla public
 * license, v. 2.0. if a copy of the mpl was not distributed with this
 * file, you can obtain one at http://mozilla.org/mpl/2.0/. */

import { PureComponent } from 'react';
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

type StateProps = {
  readonly hasZipFile: boolean;
  readonly timelineHeight: CssPixels | null;
  readonly uploadProgress: number;
  readonly isUploading: boolean;
  readonly isHidingStaleProfile: boolean;
  readonly hasSanitizedProfile: boolean;
  readonly icons: IconsWithClassNames;
  readonly isBottomBoxOpen: boolean;
};

type DispatchProps = {
  readonly returnToZipFileList: typeof returnToZipFileList;
  readonly invalidatePanelLayout: typeof invalidatePanelLayout;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class ProfileViewerImpl extends PureComponent<Props> {
  override render() {
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
              : ({
                  '--profile-viewer-splitter-max-height': `${timelineHeight}px`,
                } as React.CSSProperties)
          }
        >
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
            {
              // TODO: Update the sroll position when other elements are updated.
            }
            <ProfileFilterNavigator />
            <MenuButtons />
            {isUploading ? (
              <div
                className="publishPanelUploadBarInner"
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
          <div id="screenshot-hover"></div>
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

export const ProfileViewer = explicitConnect<{}, StateProps, DispatchProps>({
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
