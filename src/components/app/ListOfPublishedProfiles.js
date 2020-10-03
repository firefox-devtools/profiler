/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import memoize from 'memoize-immutable';
import classNames from 'classnames';

import { InnerNavigationLink } from 'firefox-profiler/components/shared/InnerNavigationLink';
import { ProfileMetaInfoSummary } from 'firefox-profiler/components/shared/ProfileMetaInfoSummary';
import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';

import {
  listAllProfileData,
  deleteProfileData,
  type ProfileData,
} from 'firefox-profiler/app-logic/published-profiles-store';
import { formatSeconds } from 'firefox-profiler/utils/format-numbers';
import { deleteProfileOnServer } from 'firefox-profiler/profile-logic/profile-store';

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
  +profileData: ProfileData,
  +nowTimestamp: Milliseconds,
  +withActionButtons: boolean,
|};

type PublishedProfileState = {|
  +confirmDialogIsOpen: boolean,
  +status: 'idle' | 'working' | 'just-deleted' | 'deleted',
  +error: Error | null,
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
    error: null,
    status: 'idle',
  };
  _componentDeleteButtonRef = React.createRef();
  _domDeleteButtonRef = React.createRef();
  _actionButtonsRef = React.createRef();

  onConfirmDeletion = async () => {
    const { profileToken, jwtToken } = this.props.profileData;

    this.setState({ status: 'working' });
    try {
      if (!jwtToken) {
        throw new Error(
          `We have no JWT token for this profile, so we can't delete it. This shouldn't happen.`
        );
      }
      await deleteProfileOnServer({ profileToken, jwtToken });
      await deleteProfileData(profileToken);
      this.setState({ status: 'just-deleted' });
    } catch (e) {
      this.setState({
        error: e,
        status: 'idle',
      });
      // Also output the error to the console for easier debugging.
      console.error(
        'An error was triggered when we tried to delete a profile.',
        e
      );
    }
  };

  onCancelDeletion = () => {
    // Close the panel when the user clicks on the Cancel button.
    if (this._componentDeleteButtonRef.current) {
      this._componentDeleteButtonRef.current.closePanel();
    }
  };

  onCloseConfirmDialog = () => {
    this.setState({ confirmDialogIsOpen: false });

    // In case we deleted the profile, and the user dismisses the success panel,
    // let's move directly to the deleted state:
    if (this.state.status === 'just-deleted') {
      this.setState({ status: 'deleted' });
    }

    // Let's focus the delete button after dismissing the dialog, but _only_ if
    // the focus was part of the dialog before.
    // Note: we might need to get a more precise ref to the right
    // buttonWithPanel wrapper when we'll have more buttons.
    const deleteButton = this._domDeleteButtonRef.current;
    const actionButtons = this._actionButtonsRef.current;
    try {
      if (
        deleteButton &&
        actionButtons &&
        actionButtons.matches(':focus-within')
      ) {
        deleteButton.focus();
      }
    } catch (e) {
      // This browser doesn't support :focus-within (especially JSDOM), let's
      // degrade gracefully by not refocusing the delete button.
    }
  };

  onOpenConfirmDialog = () => {
    this.setState({ confirmDialogIsOpen: true });
  };

  preventClick(e) {
    e.preventDefault();
  }

  _renderPossibleErrorMessage() {
    const { error } = this.state;
    if (!error) {
      return null;
    }

    return (
      <p className="publishedProfilesDeleteError">
        An error happened while deleting this profile.{' '}
        <a href="#" title={error.message} onClick={this.preventClick}>
          Hover to know more.
        </a>
      </p>
    );
  }

  render() {
    const { profileData, nowTimestamp, withActionButtons } = this.props;
    const { confirmDialogIsOpen, status } = this.state;

    if (status === 'deleted') {
      return null;
    }

    let { urlPath } = profileData;
    if (!urlPath.startsWith('/')) {
      urlPath = '/' + urlPath;
    }
    const location = `${window.location.origin}/${urlPath}`;
    const slicedProfileToken = profileData.profileToken.slice(0, 6);
    const profileName = profileData.name
      ? profileData.name
      : `Profile #${slicedProfileToken}`;
    const smallProfileName = profileData.name
      ? profileData.name
      : '#' + slicedProfileToken;

    return (
      <li
        className={classNames('publishedProfilesListItem', {
          publishedProfilesListItem_ConfirmDialogIsOpen: confirmDialogIsOpen,
        })}
      >
        <a
          className="publishedProfilesLink"
          href={location}
          title={`Click here to load profile ${smallProfileName}`}
        >
          <div className="publishedProfilesDate">
            {_formatDate(profileData.publishedDate, nowTimestamp)}
          </div>
          <div className="publishedProfilesInfo">
            <div className="publishedProfilesName">
              <strong>{profileName}</strong> (
              {_formatRange(profileData.publishedRange)})
            </div>
            <ProfileMetaInfoSummary meta={profileData.meta} />
          </div>
        </a>
        {withActionButtons ? (
          <div
            className="publishedProfilesActionButtons"
            ref={this._actionButtonsRef}
          >
            {profileData.jwtToken ? (
              <ButtonWithPanel
                ref={this._componentDeleteButtonRef}
                buttonRef={this._domDeleteButtonRef}
                buttonClassName="publishedProfilesDeleteButton photon-button photon-button-default"
                label="Delete"
                title={`Click here to delete the profile ${smallProfileName}`}
                onPanelOpen={this.onOpenConfirmDialog}
                onPanelClose={this.onCloseConfirmDialog}
                panelContent={
                  status === 'just-deleted' ? (
                    <p className="publishedProfilesDeleteSuccess">
                      Successfully deleted uploaded data.
                    </p>
                  ) : (
                    <div className="confirmDialog">
                      <h2 className="confirmDialogTitle">
                        Delete {profileName}
                      </h2>
                      <div className="confirmDialogContent">
                        Are you sure you want to delete uploaded data for this
                        profile? Links that were previously shared will no
                        longer work.
                        {this._renderPossibleErrorMessage()}
                      </div>
                      <div className="confirmDialogButtons">
                        <input
                          type="button"
                          className="photon-button photon-button-default"
                          value="Cancel"
                          disabled={status === 'working'}
                          onClick={this.onCancelDeletion}
                        />
                        <input
                          type="button"
                          className="photon-button photon-button-destructive"
                          value={status === 'working' ? 'Deleting…' : 'Delete'}
                          disabled={status === 'working'}
                          onClick={this.onConfirmDeletion}
                        />
                      </div>
                    </div>
                  )
                }
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
  profileDataList: null | ProfileData[],
|};

export class ListOfPublishedProfiles extends PureComponent<Props, State> {
  state = {
    profileDataList: null,
  };

  async componentDidMount() {
    const profileDataList = await listAllProfileData();

    // It isn't ideal to use a setState here, but this is the only way.
    // eslint-disable-next-line react/no-did-mount-set-state
    this.setState({
      // We want to display the list with the most recent uploaded profile first.
      profileDataList: profileDataList.reverse(),
    });
  }

  render() {
    const { limit, withActionButtons } = this.props;
    const { profileDataList } = this.state;

    if (!profileDataList) {
      return null;
    }

    if (!profileDataList.length) {
      return (
        <p className="photon-body-30">No profile has been published yet!</p>
      );
    }

    const reducedProfileDataList = limit
      ? profileDataList.slice(0, limit)
      : profileDataList;

    const profilesRestCount =
      profileDataList.length - reducedProfileDataList.length;

    const profileListLabel =
      profileDataList.length > 1 ? (
        <>Manage these recordings</>
      ) : (
        <>Manage this recording</>
      );

    const profileRestLabel =
      profilesRestCount > 0 ? (
        <>See and manage all your recordings ({profilesRestCount} more)</>
      ) : (
        profileListLabel
      );

    const nowTimestamp = Date.now();

    return (
      <>
        <ul className="publishedProfilesList">
          {reducedProfileDataList.map(profileData => (
            <PublishedProfile
              key={profileData.profileToken}
              profileData={profileData}
              nowTimestamp={nowTimestamp}
              withActionButtons={withActionButtons}
            />
          ))}
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
