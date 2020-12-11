/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import memoize from 'memoize-immutable';
import classNames from 'classnames';

import { InnerNavigationLink } from 'firefox-profiler/components/shared/InnerNavigationLink';
import { ProfileMetaInfoSummary } from 'firefox-profiler/components/shared/ProfileMetaInfoSummary';
import { ProfileDeleteButton } from './ProfileDeleteButton';

import {
  listAllUploadedProfileInformationFromDb,
  type UploadedProfileInformation,
} from 'firefox-profiler/app-logic/uploaded-profiles-db';
import { formatSeconds } from 'firefox-profiler/utils/format-numbers';

import type { Milliseconds, StartEndRange } from 'firefox-profiler/types/units';

import './ListOfPublishedProfiles.css';

// This component displays all published profile, and makes it possible to load
// them by clicking on them, or delete them.

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const ONE_YEAR_IN_MS = 365 * ONE_DAY_IN_MS;

// All formats are lazy-initialized at the first use by using the `memoize`
// tool, because the DateTimeFormat constructor is slow.
// Because there's no parameter to these functions there will only ever be
// memoized once and should be fairly efficient. We can replace with a dedicated
// "lazy" function in the future if performance ever becomes a problem.
const dateFormats = {
  thisDay: memoize(
    () =>
      new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: 'numeric' })
  ),
  thisYear: memoize(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
      })
  ),
  ancient: memoize(
    () =>
      new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
  ),
};

function _formatDate(date: Date, nowTimestamp: Milliseconds) {
  const timeDifference = nowTimestamp - +date;
  if (timeDifference < 0 || timeDifference > ONE_YEAR_IN_MS) {
    return dateFormats.ancient().format(date);
  }
  if (timeDifference > ONE_DAY_IN_MS) {
    return dateFormats.thisYear().format(date);
  }
  return dateFormats.thisDay().format(date);
}

function _formatRange(range: StartEndRange): string {
  return formatSeconds(range.end - range.start, 3, 1);
}

type PublishedProfileProps = {|
  +onProfileDelete: () => void,
  +uploadedProfileInformation: UploadedProfileInformation,
  +nowTimestamp: Milliseconds,
  +withActionButtons: boolean,
|};

type PublishedProfileState = {|
  +confirmDialogIsOpen: boolean,
|};

/**
 * This implements one line in the list of published profiles.
 */
class PublishedProfile extends React.PureComponent<
  PublishedProfileProps,
  PublishedProfileState
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
    const {
      uploadedProfileInformation,
      nowTimestamp,
      withActionButtons,
    } = this.props;
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
        <a
          className="publishedProfilesLink"
          href={urlPath}
          title={`Click here to load profile ${smallProfileName}`}
        >
          <div className="publishedProfilesDate">
            {_formatDate(
              uploadedProfileInformation.publishedDate,
              nowTimestamp
            )}
          </div>
          <div className="publishedProfilesInfo">
            <div className="publishedProfilesName">
              <strong>{profileName}</strong> (
              {_formatRange(uploadedProfileInformation.publishedRange)})
            </div>
            <ProfileMetaInfoSummary meta={uploadedProfileInformation.meta} />
          </div>
        </a>
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
              <button
                className="publishedProfilesDeleteButton photon-button photon-button-default"
                type="button"
                title="This profile cannot be deleted because we lack the authorization information."
                disabled
              >
                Delete
              </button>
            )}
          </div>
        ) : null}
      </li>
    );
  }
}

type Props = {|
  withActionButtons: boolean,
  limit?: number,
|};

type State = {|
  uploadedProfileInformationList: null | UploadedProfileInformation[],
|};

export class ListOfPublishedProfiles extends PureComponent<Props, State> {
  _isMounted = false;

  state = {
    uploadedProfileInformationList: null,
  };

  _refreshList = async () => {
    const uploadedProfileInformationList = await listAllUploadedProfileInformationFromDb();
    if (this._isMounted) {
      // It isn't ideal to use a setState here, but this is the only way.
      this.setState({
        // We want to display the list with the most recent uploaded profile first.
        uploadedProfileInformationList: uploadedProfileInformationList.reverse(),
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
        <p className="photon-body-30">No profile has been uploaded yet!</p>
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
        <>See and manage all your recordings ({profilesRestCount} more)</>
      );
    } else {
      profileRestLabel =
        uploadedProfileInformationList.length > 1 ? (
          <>Manage these recordings</>
        ) : (
          <>Manage this recording</>
        );
    }

    const nowTimestamp = Date.now();

    return (
      <>
        <ul className="publishedProfilesList">
          {reducedUploadedProfileInformationList.map(
            uploadedProfileInformation => (
              <PublishedProfile
                onProfileDelete={this.onProfileDelete}
                key={uploadedProfileInformation.profileToken}
                uploadedProfileInformation={uploadedProfileInformation}
                nowTimestamp={nowTimestamp}
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
