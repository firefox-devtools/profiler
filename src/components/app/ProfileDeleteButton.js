/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import classNames from 'classnames';

import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';

import { deleteUploadedProfileInformationFromDb } from 'firefox-profiler/app-logic/uploaded-profiles-db';
import { deleteProfileOnServer } from 'firefox-profiler/profile-logic/profile-store';

import './ProfileDeleteButton.css';

/*
 * You can use this component directly if you want to provide a button to delete
 * a specific profile on the server.
 * If you're interested by the panel displayed when clicking on this button,
 * you'll want to use ProfileDeletePanel defined below.
 */
type ButtonProps = {
  /* This string will be used in a title */
  +profileName: string,
  /* This string will be used in longer sentence in a tooltip */
  +smallProfileName: string,
  /* This identifies the profile we want to delete. This is also commonly known as the "hash" of the profile. */
  +profileToken: string,
  /* This token is used to authenticate the deletion HTTP request to the server. */
  +jwtToken: string,
  +buttonClassName?: string,
  +onOpenConfirmDialog: () => mixed,
  +onCloseConfirmDialog: () => mixed,
  +onCloseSuccessMessage: () => mixed,
};

export class ProfileDeleteButton extends PureComponent<ButtonProps> {
  _hasBeenDeleted = false;
  _componentDeleteButtonRef = React.createRef<ButtonWithPanel>();

  onCloseConfirmDialog = () => {
    // In case we deleted the profile, and the user dismisses the success panel,
    // let's move directly to the deleted state:
    if (this._hasBeenDeleted) {
      this.props.onCloseSuccessMessage();
    }

    this.props.onCloseConfirmDialog();
  };

  onProfileDeleted = () => {
    this._hasBeenDeleted = true;
  };

  onProfileDeleteCanceled = () => {
    // Close the panel when the user clicks on the Cancel button.
    if (this._componentDeleteButtonRef.current) {
      this._componentDeleteButtonRef.current.closePanel();
    }
  };

  render() {
    const {
      profileName,
      smallProfileName,
      buttonClassName,
      jwtToken,
      profileToken,
    } = this.props;

    return (
      <Localized
        id="ProfileDeleteButton--delete-button"
        attrs={{ label: true, title: true }}
        vars={{ smallProfileName: smallProfileName }}
      >
        <ButtonWithPanel
          ref={this._componentDeleteButtonRef}
          buttonClassName={classNames(
            buttonClassName,
            'photon-button',
            'photon-button-default'
          )}
          panelClassName="profileDeletePanel"
          label="Delete"
          title={`Click here to delete the profile ${smallProfileName}`}
          onPanelOpen={this.props.onOpenConfirmDialog}
          onPanelClose={this.onCloseConfirmDialog}
          panelContent={
            <ProfileDeletePanel
              profileName={profileName}
              profileToken={profileToken}
              jwtToken={jwtToken}
              onProfileDeleted={this.onProfileDeleted}
              onProfileDeleteCanceled={this.onProfileDeleteCanceled}
            />
          }
        />
      </Localized>
    );
  }
}

/*
 * This Panel implements a confirmation dialog to delete a profile, as well as
 * calling the deletion process when the user confirms.
 */
type PanelProps = {
  +profileName: string,
  /* This identifies the profile we want to delete. This is also commonly known as the "hash" of the profile. */
  +profileToken: string,
  /* This token is used to authenticate the deletion HTTP request to the server. */
  +jwtToken: string,
  +onProfileDeleted: () => mixed,
  +onProfileDeleteCanceled: () => mixed,
};

type PanelState = {
  +status: 'idle' | 'working' | 'deleted',
  +error: Error | null,
};

export class ProfileDeletePanel extends PureComponent<PanelProps, PanelState> {
  state = { error: null, status: 'idle' };

  onConfirmDeletion = async () => {
    const { profileToken, jwtToken } = this.props;

    this.setState({ status: 'working' });
    try {
      if (!jwtToken) {
        throw new Error(
          `We have no JWT token for this profile, so we can't delete it. This shouldn't happen.`
        );
      }
      await deleteProfileOnServer({ profileToken, jwtToken });
      await deleteUploadedProfileInformationFromDb(profileToken);
      this.setState({ status: 'deleted' });
      this.props.onProfileDeleted();
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

  preventClick(e: SyntheticMouseEvent<>) {
    e.preventDefault();
  }

  _renderPossibleErrorMessage() {
    const { error } = this.state;
    if (!error) {
      return null;
    }

    return (
      <Localized
        id="ProfileDeletePanel--delete-error"
        elems={{
          a: <a href="#" title={error.message} onClick={this.preventClick} />,
        }}
      >
        <p className="profileDeleteButtonError">
          An error happened while deleting this profile.{' '}
          <a>Hover to know more.</a>
        </p>
      </Localized>
    );
  }
  render() {
    const { profileName } = this.props;
    const { status } = this.state;

    if (status === 'deleted') {
      return <ProfileDeleteSuccess />;
    }

    return (
      <div className="confirmDialog">
        <Localized id="ProfileDeletePanel--dialog-title" vars={{ profileName }}>
          <h2 className="confirmDialogTitle">Delete {profileName}</h2>
        </Localized>
        <div className="confirmDialogContent">
          <Localized id="ProfileDeletePanel--dialog-confirmation-question">
            Are you sure you want to delete uploaded data for this profile?
            Links that were previously shared will no longer work.
          </Localized>
          {this._renderPossibleErrorMessage()}
        </div>
        <div className="confirmDialogButtons">
          <Localized
            id="ProfileDeletePanel--dialog-cancel-button"
            attrs={{ value: true }}
          >
            <input
              type="button"
              className="photon-button photon-button-default"
              value="Cancel"
              disabled={status === 'working'}
              onClick={this.props.onProfileDeleteCanceled}
            />
          </Localized>
          <Localized
            id={
              status === 'working'
                ? 'ProfileDeletePanel--dialog-deleting-button'
                : 'ProfileDeletePanel--dialog-delete-button'
            }
            attrs={{ value: true }}
          >
            <input
              type="button"
              className="photon-button photon-button-destructive"
              value={status === 'working' ? 'Deleting…' : 'Delete'}
              disabled={status === 'working'}
              onClick={this.onConfirmDeletion}
            />
          </Localized>
        </div>
      </div>
    );
  }
}

export function ProfileDeleteSuccess(_props: {}) {
  return (
    <Localized id="ProfileDeletePanel--message-success">
      <p className="profileDeleteButtonSuccess">
        The uploaded data was successfully deleted.
      </p>
    </Localized>
  );
}
