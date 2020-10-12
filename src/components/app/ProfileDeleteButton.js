/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';

import { ButtonWithPanel } from 'firefox-profiler/components/shared/ButtonWithPanel';

import { deleteProfileData } from 'firefox-profiler/app-logic/published-profiles-store';
import { deleteProfileOnServer } from 'firefox-profiler/profile-logic/profile-store';

import './ProfileDeleteButton.css';

type Props = {|
  +profileName: string,
  +smallProfileName: string,
  +jwtToken: string,
  +profileToken: string,
  +buttonClassName?: string,
  +onOpenConfirmDialog?: () => mixed,
  +onCloseConfirmDialog?: () => mixed,
  +onCloseSuccessMessage?: () => mixed,
|};

type State = {|
  +status: 'idle' | 'working' | 'just-deleted' | 'deleted',
  +error: Error | null,
|};

export class ProfileDeleteButton extends PureComponent<Props, State> {
  state = { error: null, status: 'idle' };
  _componentDeleteButtonRef = React.createRef<ButtonWithPanel>();

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

  _renderPossibleErrorMessage() {
    const { error } = this.state;
    if (!error) {
      return null;
    }

    return (
      <p className="profileDeleteButtonError">
        An error happened while deleting this profile.{' '}
        <a href="#" title={error.message} onClick={this.preventClick}>
          Hover to know more.
        </a>
      </p>
    );
  }

  onCloseConfirmDialog = () => {
    // In case we deleted the profile, and the user dismisses the success panel,
    // let's move directly to the deleted state:
    if (this.state.status === 'just-deleted') {
      this.setState({ status: 'deleted' });
      if (this.props.onCloseSuccessMessage) {
        this.props.onCloseSuccessMessage();
      }
    }

    if (this.props.onCloseConfirmDialog) {
      this.props.onCloseConfirmDialog();
    }
  };

  preventClick(e: SyntheticMouseEvent<>) {
    e.preventDefault();
  }

  render() {
    const { profileName, smallProfileName, buttonClassName } = this.props;
    const { status } = this.state;

    return (
      <ButtonWithPanel
        ref={this._componentDeleteButtonRef}
        buttonClassName={classNames(
          buttonClassName,
          'photon-button',
          'photon-button-default'
        )}
        label="Delete"
        title={`Click here to delete the profile ${smallProfileName}`}
        onPanelOpen={this.props.onOpenConfirmDialog}
        onPanelClose={this.onCloseConfirmDialog}
        panelContent={
          status === 'just-deleted' ? (
            <p className="profileDeleteButtonSuccess">
              Successfully deleted uploaded data.
            </p>
          ) : (
            <div className="confirmDialog">
              <h2 className="confirmDialogTitle">Delete {profileName}</h2>
              <div className="confirmDialogContent">
                Are you sure you want to delete uploaded data for this profile?
                Links that were previously shared will no longer work.
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
    );
  }
}
