/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// It's important to import the base CSS file first, so that CSS in the
// subcomponents can more easily override the rules.
import './index.css';

import * as React from 'react';
import classNames from 'classnames';
import { Localized } from '@fluent/react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import {
  getDataSource,
  getProfileUrl,
} from 'firefox-profiler/selectors/url-state';
import {
  getIsNewlyPublished,
  getCurrentProfileUploadedInformation,
} from 'firefox-profiler/selectors/app';

/* Note: the order of import is important, from most general to most specific,
 * so that the CSS rules are in the correct order. */
import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';
import { MetaInfoPanel } from './MetaInfo';
import { PublishPanel } from './Publish';
import { MenuButtonsPermalink } from './Permalink';
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
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

import type {
  StartEndRange,
  DataSource,
  UploadPhase,
  UploadedProfileInformation,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import { isLocalURL } from 'firefox-profiler/utils/url';

type OwnProps = {
  // This is for injecting a URL shortener for tests. Normally we would use a Jest mock
  // that would mock out a local module, but I was having trouble getting it working
  // correctly (perhaps due to ES6 modules), so I just went with dependency injection
  // instead.
  injectedUrlShortener?: (url: string) => Promise<string>;
};

type StateProps = {
  readonly rootRange: StartEndRange;
  readonly dataSource: DataSource;
  readonly profileUrl: string;
  readonly isNewlyPublished: boolean;
  readonly uploadPhase: UploadPhase;
  readonly hasPrePublishedState: boolean;
  readonly abortFunction: () => void;
  readonly currentProfileUploadedInformation: UploadedProfileInformation | null;
};

type DispatchProps = {
  readonly dismissNewlyPublished: typeof dismissNewlyPublished;
  readonly revertToPrePublishedState: typeof revertToPrePublishedState;
  readonly profileRemotelyDeleted: typeof profileRemotelyDeleted;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;
type State = {
  metaInfoPanelState: 'initial' | 'delete-confirmation';
};

class MenuButtonsImpl extends React.PureComponent<Props, State> {
  override state: State = { metaInfoPanelState: 'initial' };

  override componentDidMount() {
    // Clear out the newly published notice from the URL.
    this.props.dismissNewlyPublished();
  }

  _getUploadedStatus(dataSource: DataSource, profileUrl: string) {
    switch (dataSource) {
      case 'public':
      case 'compare':
        return 'uploaded';
      case 'from-browser':
      case 'from-post-message':
      case 'unpublished':
      case 'from-file':
      case 'local':
        return 'local';
      case 'from-url':
        return isLocalURL(profileUrl) ? 'local' : 'uploaded';
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
          <span className="profileInfoUploadedLabel">
            <Localized id="MenuButtons--index--profile-info-uploaded-label">
              Uploaded:
            </Localized>
          </span>
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
                : undefined
            }
            disabled={currentProfileUploadedInformation.jwtToken === null}
          >
            <Localized id="MenuButtons--index--profile-info-uploaded-actions">
              Delete
            </Localized>
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
            <h2 className="metaInfoSubTitle">
              <Localized id="MenuButtons--index--metaInfo-subtitle">
                Profile Information
              </Localized>
            </h2>
            {currentProfileUploadedInformation
              ? this._renderUploadedProfileActions(
                  currentProfileUploadedInformation
                )
              : null}
            <MetaInfoPanel />
          </>
        );
      }

      case 'delete-confirmation':
        if (currentProfileUploadedInformation) {
          const { name, profileToken, jwtToken } =
            currentProfileUploadedInformation;

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

        // The profile data has been deleted

        // Note that <ProfileDeletePanel> can also render <ProfileDeleteSuccess>
        // in some situations. However it's not suitable for this case, because
        // we still have to pass jwtToken / profileToken, and we don't have
        // these values anymore when we're in this state.
        return <ProfileDeleteSuccess />;
      default:
        throw assertExhaustiveCheck(
          metaInfoPanelState,
          `Unhandled metaInfoPanelState`
        );
    }
  }

  _renderMetaInfoButton() {
    return (
      <Localized
        id="MenuButtons--index--metaInfo-button"
        attrs={{ label: true }}
      >
        <ButtonWithPanel
          buttonClassName="menuButtonsButton menuButtonsMetaInfoButtonButton menuButtonsButton-hasIcon"
          // The empty string value for the label following will be replaced by the <Localized /> wrapper.
          label=""
          onPanelClose={this._resetMetaInfoState}
          panelClassName="metaInfoPanel"
          panelContent={this._renderMetaInfoPanel()}
        />
      </Localized>
    );
  }

  _renderPublishPanel() {
    const { uploadPhase, dataSource, abortFunction, profileUrl } = this.props;

    const isUploading =
      uploadPhase === 'uploading' || uploadPhase === 'compressing';

    if (isUploading) {
      return (
        <button
          type="button"
          className="menuButtonsButton menuButtonsShareButtonButton menuButtonsButton-hasIcon menuButtonsShareButtonButton-uploading"
          onClick={abortFunction}
        >
          <Localized id="MenuButtons--index--cancel-upload">
            Cancel Upload
          </Localized>
        </button>
      );
    }

    const uploadedStatus = this._getUploadedStatus(dataSource, profileUrl);
    const isRepublish = uploadedStatus === 'uploaded';
    const isError = uploadPhase === 'error';

    let labelL10nId = 'MenuButtons--index--share-upload';
    if (isRepublish) {
      labelL10nId = 'MenuButtons--index--share-re-upload';
    }

    if (isError) {
      labelL10nId = 'MenuButtons--index--share-error-uploading';
    }

    return (
      <Localized id={labelL10nId} attrs={{ label: true }}>
        <ButtonWithPanel
          buttonClassName={classNames(
            'menuButtonsButton menuButtonsShareButtonButton menuButtonsButton-hasIcon',
            {
              menuButtonsShareButtonError: isError,
            }
          )}
          panelClassName="publishPanelPanel"
          // The value for the label following will be replaced
          label=""
          panelContent={<PublishPanel isRepublish={isRepublish} />}
        />
      </Localized>
    );
  }

  _renderPermalink() {
    const { dataSource, isNewlyPublished, injectedUrlShortener, profileUrl } =
      this.props;

    const showPermalink =
      this._getUploadedStatus(dataSource, profileUrl) === 'uploaded';

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
        <Localized id="MenuButtons--index--revert">
          Revert to Original Profile
        </Localized>
      </button>
    );
  }

  override render() {
    return (
      <>
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
          <Localized id="MenuButtons--index--docs">Docs</Localized>
          <i className="open-in-new" />
        </a>
      </>
    );
  }
}

export const MenuButtons = explicitConnect<OwnProps, StateProps, DispatchProps>(
  {
    mapStateToProps: (state) => ({
      rootRange: getProfileRootRange(state),
      dataSource: getDataSource(state),
      profileUrl: getProfileUrl(state),
      isNewlyPublished: getIsNewlyPublished(state),
      uploadPhase: getUploadPhase(state),
      hasPrePublishedState: getHasPrePublishedState(state),
      abortFunction: getAbortFunction(state),
      currentProfileUploadedInformation:
        getCurrentProfileUploadedInformation(state),
    }),
    mapDispatchToProps: {
      dismissNewlyPublished,
      revertToPrePublishedState,
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
