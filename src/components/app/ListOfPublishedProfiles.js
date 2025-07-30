/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { Localized } from '@fluent/react';

import { InnerNavigationLink } from 'firefox-profiler/components/shared/InnerNavigationLink';
import { ProfileMetaInfoSummary } from 'firefox-profiler/components/shared/ProfileMetaInfoSummary';
import { ProfileDeleteButton } from './ProfileDeleteButton';

import {
  listAllUploadedProfileInformationFromDb,
  type UploadedProfileInformation,
} from 'firefox-profiler/app-logic/uploaded-profiles-db';
import { formatSeconds } from 'firefox-profiler/utils/format-numbers';

import type { StartEndRange } from 'firefox-profiler/types/units';

import './ListOfPublishedProfiles.css';

// This component displays all published profile, and makes it possible to load
// them by clicking on them, or delete them.

function _formatRange(range: StartEndRange): string {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    // Do not attempt to show if the range is NaN or Infinity, which happens
    // if a profile doesn't have any samples or markers.
    return '';
  }
  return formatSeconds(range.end - range.start, 3, 1);
}

type PublishedProfileProps = {
  readonly onProfileDelete: () => void,
  readonly uploadedProfileInformation: UploadedProfileInformation,
  readonly withActionButtons: boolean,
};

type PublishedProfileState = {
  readonly confirmDialogIsOpen: boolean,
};

/**
 * This implements one line in the list of published profiles.
 */
class PublishedProfile extends React.PureComponent<
  PublishedProfileProps,
  PublishedProfileState,
> {
  state = {
    confirmDialogIsOpen: false,
  };

  onOpenConfirmDialog = () => {
    this.setState({ confirmDialogIsOpen: true });
  };

  onCloseConfirmDialog = () => {
    this.setState({ confirmDialogIsOpen: false });
  };

  onCloseSuccessMessage = () => {
    this.props.onProfileDelete();
  };

  render() {
    const { uploadedProfileInformation, withActionButtons } = this.props;
    const { confirmDialogIsOpen } = this.state;

    let { urlPath } = uploadedProfileInformation;
    if (!urlPath.startsWith('/')) {
      urlPath = '/' + urlPath;
    }
    const slicedProfileToken = uploadedProfileInformation.profileToken.slice(
      0,
      6
    );
    const profileName = uploadedProfileInformation.name
      ? uploadedProfileInformation.name
      : `Profile #${slicedProfileToken}`;
    const smallProfileName = uploadedProfileInformation.name
      ? uploadedProfileInformation.name
      : '#' + slicedProfileToken;

    return (
      <li
        className={classNames('publishedProfilesListItem', {
          publishedProfilesListItem_ConfirmDialogIsOpen: confirmDialogIsOpen,
        })}
      >
        <Localized
          id="ListOfPublishedProfiles--published-profiles-link"
          attrs={{ title: true }}
          vars={{ smallProfileName: smallProfileName }}
        >
          <a
            className="publishedProfilesLink"
            href={urlPath}
            title={`Click here to load profile ${smallProfileName}`}
          >
            <div className="publishedProfilesDate">
              <Localized
                id="NumberFormat--short-date"
                vars={{ date: uploadedProfileInformation.publishedDate }}
              />
            </div>
            <div className="publishedProfilesInfo">
              <div className="publishedProfilesName">
                <strong>{profileName}</strong> (
                {_formatRange(uploadedProfileInformation.publishedRange)})
              </div>
              <ProfileMetaInfoSummary meta={uploadedProfileInformation.meta} />
            </div>
          </a>
        </Localized>
        {withActionButtons ? (
          <div className="publishedProfilesActionButtons">
            {uploadedProfileInformation.jwtToken ? (
              <ProfileDeleteButton
                buttonClassName="publishedProfilesDeleteButton"
                profileName={profileName}
                smallProfileName={smallProfileName}
                jwtToken={uploadedProfileInformation.jwtToken}
                profileToken={uploadedProfileInformation.profileToken}
                onOpenConfirmDialog={this.onOpenConfirmDialog}
                onCloseConfirmDialog={this.onCloseConfirmDialog}
                onCloseSuccessMessage={this.onCloseSuccessMessage}
              />
            ) : (
              <Localized
                id="ListOfPublishedProfiles--published-profiles-delete-button-disabled"
                attrs={{ title: true }}
              >
                <button
                  className="publishedProfilesDeleteButton photon-button photon-button-default"
                  type="button"
                  title="This profile cannot be deleted because we lack the authorization information."
                  disabled
                >
                  Delete
                </button>
              </Localized>
            )}
          </div>
        ) : null}
      </li>
    );
  }
}

type Props = {
  withActionButtons: boolean,
  limit?: number,
};

type State = {
  uploadedProfileInformationList: null | UploadedProfileInformation[],
};

export class ListOfPublishedProfiles extends PureComponent<Props, State> {
  _isMounted = false;

  state = {
    uploadedProfileInformationList: null,
  };

  _refreshList = async () => {
    const uploadedProfileInformationList =
      await listAllUploadedProfileInformationFromDb();
    if (this._isMounted) {
      // It isn't ideal to use a setState here, but this is the only way.
      this.setState({
        // We want to display the list with the most recent uploaded profile first.
        uploadedProfileInformationList:
          uploadedProfileInformationList.reverse(),
      });
    }
  };

  async componentDidMount() {
    this._isMounted = true;
    this._refreshList();
    window.addEventListener('focus', this._refreshList);
  }

  componentWillUnmount() {
    this._isMounted = false;
    window.removeEventListener('focus', this._refreshList);
  }

  onProfileDelete = () => {
    this._refreshList();
  };

  render() {
    const { limit, withActionButtons } = this.props;
    const { uploadedProfileInformationList } = this.state;

    if (!uploadedProfileInformationList) {
      return null;
    }

    if (!uploadedProfileInformationList.length) {
      return (
        <p className="photon-body-30">
          <Localized id="ListOfPublishedProfiles--uploaded-profile-information-list-empty">
            No profile has been uploaded yet!
          </Localized>
        </p>
      );
    }

    const reducedUploadedProfileInformationList = limit
      ? uploadedProfileInformationList.slice(0, limit)
      : uploadedProfileInformationList;

    const profilesRestCount =
      uploadedProfileInformationList.length -
      reducedUploadedProfileInformationList.length;

    let profileRestLabel;
    if (profilesRestCount > 0) {
      profileRestLabel = (
        <Localized
          id="ListOfPublishedProfiles--uploaded-profile-information-label"
          vars={{ profilesRestCount: profilesRestCount }}
        >
          <>See and manage all your recordings ({profilesRestCount} more)</>
        </Localized>
      );
    } else {
      profileRestLabel = (
        <Localized
          id="ListOfPublishedProfiles--uploaded-profile-information-list"
          vars={{
            uploadedProfileCount: uploadedProfileInformationList.length,
          }}
        >
          <>Manage this recording</>
        </Localized>
      );
    }

    return (
      <>
        <ul className="publishedProfilesList">
          {reducedUploadedProfileInformationList.map(
            (uploadedProfileInformation) => (
              <PublishedProfile
                onProfileDelete={this.onProfileDelete}
                key={uploadedProfileInformation.profileToken}
                uploadedProfileInformation={uploadedProfileInformation}
                withActionButtons={withActionButtons}
              />
            )
          )}
        </ul>
        {withActionButtons ? null : (
          <p>
            <InnerNavigationLink dataSource="uploaded-recordings">
              {profileRestLabel}
            </InnerNavigationLink>
          </p>
        )}
      </>
    );
  }
}
