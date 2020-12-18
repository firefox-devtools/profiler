/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// It's important to import the base CSS file first, so that CSS in the
// subcomponents can more easily override the rules.
import './index.css';

import * as React from 'react';
import classNames from 'classnames';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import {
  getDataSource,
  getTimelineTrackOrganization,
} from 'firefox-profiler/selectors/url-state';
import {
  getIsNewlyPublished,
  getCurrentProfileUploadedInformation,
} from 'firefox-profiler/selectors/app';

/* Note: the order of import is important, from most general to most specific,
 * so that the CSS rules are in the correct order. */
import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';
import { MetaInfoPanel } from 'firefox-profiler/components/app/MenuButtons/MetaInfo';
import { MenuButtonsPublish } from 'firefox-profiler/components/app/MenuButtons/Publish';
import { MenuButtonsPermalink } from 'firefox-profiler/components/app/MenuButtons/Permalink';
import {
  ProfileDeletePanel,
  ProfileDeleteSuccess,
} from 'firefox-profiler/components/app/ProfileDeleteButton';
import { revertToPrePublishedState } from 'firefox-profiler/actions/publish';
import {
  dismissNewlyPublished,
  profileRemotelyDeleted,
} from 'firefox-profiler/actions/app';

import {
  getAbortFunction,
  getUploadPhase,
  getHasPrePublishedState,
} from 'firefox-profiler/selectors/publish';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import { changeTimelineTrackOrganization } from 'firefox-profiler/actions/receive-profile';

import type {
  StartEndRange,
  DataSource,
  UploadPhase,
  TimelineTrackOrganization,
  UploadedProfileInformation,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {|
  // This is for injecting a URL shortener for tests. Normally we would use a Jest mock
  // that would mock out a local module, but I was having trouble getting it working
  // correctly (perhaps due to ES6 modules), so I just went with dependency injection
  // instead.
  injectedUrlShortener?: string => Promise<string>,
|};

type StateProps = {|
  +rootRange: StartEndRange,
  +dataSource: DataSource,
  +isNewlyPublished: boolean,
  +uploadPhase: UploadPhase,
  +hasPrePublishedState: boolean,
  +abortFunction: () => mixed,
  +timelineTrackOrganization: TimelineTrackOrganization,
  +currentProfileUploadedInformation: UploadedProfileInformation | null,
|};

type DispatchProps = {|
  +dismissNewlyPublished: typeof dismissNewlyPublished,
  +revertToPrePublishedState: typeof revertToPrePublishedState,
  +changeTimelineTrackOrganization: typeof changeTimelineTrackOrganization,
  +profileRemotelyDeleted: typeof profileRemotelyDeleted,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;
type State = $ReadOnly<{|
  metaInfoPanelState: 'initial' | 'delete-confirmation' | 'profile-deleted',
|}>;

class MenuButtonsImpl extends React.PureComponent<Props, State> {
  state = { metaInfoPanelState: 'initial' };

  componentDidMount() {
    // Clear out the newly published notice from the URL.
    this.props.dismissNewlyPublished();
  }

  _getUploadedStatus(dataSource: DataSource) {
    switch (dataSource) {
      case 'public':
      case 'compare':
      case 'from-url':
        return 'uploaded';
      case 'from-addon':
      case 'unpublished':
      case 'from-file':
      case 'local':
        return 'local';
      case 'none':
      case 'uploaded-recordings':
        throw new Error(`The datasource ${dataSource} shouldn't happen here.`);
      default:
        throw assertExhaustiveCheck(dataSource);
    }
  }

  _deleteThisProfileOnServer = () => {
    this.setState({
      metaInfoPanelState: 'delete-confirmation',
    });
  };

  _onProfileDeleted = () => {
    this.props.profileRemotelyDeleted();
    this.setState({
      metaInfoPanelState: 'profile-deleted',
    });
  };

  _resetMetaInfoState = () => {
    this.setState({
      metaInfoPanelState: 'initial',
    });
  };

  _renderUploadedProfileActions(
    currentProfileUploadedInformation: UploadedProfileInformation
  ) {
    return (
      <div className="profileInfoUploadedActions">
        <div className="profileInfoUploadedDate">
          <span className="profileInfoUploadedLabel">Uploaded:</span>
          {_formatDate(currentProfileUploadedInformation.publishedDate)}
        </div>
        <div className="profileInfoUploadedActionsButtons">
          <button
            type="button"
            className="photon-button photon-button-default photon-button-micro"
            onClick={this._deleteThisProfileOnServer}
            title={
              currentProfileUploadedInformation.jwtToken === null
                ? 'This profile cannot be deleted because we lack the authorization information.'
                : null
            }
            disabled={currentProfileUploadedInformation.jwtToken === null}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  _renderMetaInfoPanel() {
    const { currentProfileUploadedInformation } = this.props;
    const { metaInfoPanelState } = this.state;
    switch (metaInfoPanelState) {
      case 'initial': {
        return (
          <>
            <h2 className="metaInfoSubTitle">Profile Information</h2>
            {currentProfileUploadedInformation
              ? this._renderUploadedProfileActions(
                  currentProfileUploadedInformation
                )
              : null}
            <MetaInfoPanel />
          </>
        );
      }

      case 'delete-confirmation': {
        if (!currentProfileUploadedInformation) {
          throw new Error(
            `We're in the state "delete-confirmation" but there's no stored data for this profile, this should not happen.`
          );
        }

        const {
          name,
          profileToken,
          jwtToken,
        } = currentProfileUploadedInformation;

        if (!jwtToken) {
          throw new Error(
            `We're in the state "delete-confirmation" but there's no JWT token for this profile, this should not happen.`
          );
        }

        const slicedProfileToken = profileToken.slice(0, 6);
        const profileName = name ? name : `Profile #${slicedProfileToken}`;
        return (
          <ProfileDeletePanel
            profileName={profileName}
            profileToken={profileToken}
            jwtToken={jwtToken}
            onProfileDeleted={this._onProfileDeleted}
            onProfileDeleteCanceled={this._resetMetaInfoState}
          />
        );
      }

      case 'profile-deleted':
        // Note that <ProfileDeletePanel> can also render <ProfileDeleteSuccess>
        // in some situations. However it's not suitable for this case, because
        // we still have to pass jwtToken / profileToken, and we don't have
        // these values anymore when we're in this state.
        return <ProfileDeleteSuccess />;

      default:
        throw assertExhaustiveCheck(metaInfoPanelState);
    }
  }

  _renderMetaInfoButton() {
    const { dataSource } = this.props;
    const uploadedStatus = this._getUploadedStatus(dataSource);
    return (
      <ButtonWithPanel
        buttonClassName={`menuButtonsButton menuButtonsMetaInfoButtonButton menuButtonsButton-hasIcon menuButtonsMetaInfoButtonButton-${uploadedStatus}`}
        label={
          uploadedStatus === 'uploaded' ? 'Uploaded Profile' : 'Local Profile'
        }
        onPanelClose={this._resetMetaInfoState}
        panelClassName="metaInfoPanel"
        panelContent={this._renderMetaInfoPanel()}
      />
    );
  }

  _changeTimelineTrackOrganizationToFull = () => {
    this.props.changeTimelineTrackOrganization({ type: 'full' });
  };

  _renderFullViewButtonForActiveTab() {
    const { timelineTrackOrganization } = this.props;
    if (timelineTrackOrganization.type !== 'active-tab') {
      return null;
    }

    return (
      <button
        type="button"
        className="menuButtonsButton menuButtonsButton-hasIcon menuButtonsRevertToFullView"
        onClick={this._changeTimelineTrackOrganizationToFull}
      >
        Full View
      </button>
    );
  }

  _renderPublishPanel() {
    const { uploadPhase, dataSource, abortFunction } = this.props;

    const isUploading =
      uploadPhase === 'uploading' || uploadPhase === 'compressing';

    if (isUploading) {
      return (
        <button
          type="button"
          className="menuButtonsButton menuButtonsShareButtonButton menuButtonsButton-hasIcon menuButtonsShareButtonButton-uploading"
          onClick={abortFunction}
        >
          Cancel Upload
        </button>
      );
    }

    const uploadedStatus = this._getUploadedStatus(dataSource);
    const isRepublish = uploadedStatus === 'uploaded';
    const isError = uploadPhase === 'error';

    let label = 'Upload';
    if (isRepublish) {
      label = 'Re-upload';
    }

    if (isError) {
      label = 'Error uploading';
    }

    return (
      <ButtonWithPanel
        buttonClassName={classNames(
          'menuButtonsButton menuButtonsShareButtonButton menuButtonsButton-hasIcon',
          {
            menuButtonsShareButtonError: isError,
          }
        )}
        panelClassName="menuButtonsPublishPanel"
        label={label}
        panelContent={<MenuButtonsPublish isRepublish={isRepublish} />}
      />
    );
  }

  _renderPermalink() {
    const { dataSource, isNewlyPublished, injectedUrlShortener } = this.props;

    const showPermalink =
      dataSource === 'public' ||
      dataSource === 'from-url' ||
      dataSource === 'compare';

    return showPermalink ? (
      <MenuButtonsPermalink
        isNewlyPublished={isNewlyPublished}
        injectedUrlShortener={injectedUrlShortener}
      />
    ) : null;
  }

  _renderRevertProfile() {
    const { hasPrePublishedState, revertToPrePublishedState } = this.props;
    if (!hasPrePublishedState) {
      return null;
    }
    return (
      <button
        type="button"
        className="menuButtonsButton menuButtonsButton-hasIcon menuButtonsRevertButton"
        onClick={revertToPrePublishedState}
      >
        Revert to Original Profile
      </button>
    );
  }

  render() {
    return (
      <>
        {this._renderFullViewButtonForActiveTab()}
        {this._renderRevertProfile()}
        {this._renderMetaInfoButton()}
        {this._renderPublishPanel()}
        {this._renderPermalink()}
        <a
          href="/docs/"
          target="_blank"
          className="menuButtonsButton menuButtonsButton-hasLeftBorder"
          title="Open the documentation in a new window"
        >
          Docs
          <i className="open-in-new" />
        </a>
      </>
    );
  }
}

export const MenuButtons = explicitConnect<OwnProps, StateProps, DispatchProps>(
  {
    mapStateToProps: state => ({
      rootRange: getProfileRootRange(state),
      dataSource: getDataSource(state),
      isNewlyPublished: getIsNewlyPublished(state),
      uploadPhase: getUploadPhase(state),
      hasPrePublishedState: getHasPrePublishedState(state),
      abortFunction: getAbortFunction(state),
      timelineTrackOrganization: getTimelineTrackOrganization(state),
      currentProfileUploadedInformation: getCurrentProfileUploadedInformation(
        state
      ),
    }),
    mapDispatchToProps: {
      dismissNewlyPublished,
      revertToPrePublishedState,
      changeTimelineTrackOrganization,
      profileRemotelyDeleted,
    },
    component: MenuButtonsImpl,
  }
);

function _formatDate(date: Date): string {
  const timestampDate = date.toLocaleString(undefined, {
    month: 'short',
    year: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
  });
  return timestampDate;
}
