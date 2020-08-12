/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';

import explicitConnect from '../../utils/connect';
import {
  getProfileName,
  getProfileNameOrNull,
} from 'firefox-profiler/selectors';
import { changeProfileName } from '../../actions/profile-view';

import type { ConnectedProps } from '../../utils/connect';

import './ProfileName.css';

type StateProps = {|
  +profileName: string,
  +profileNameOrNull: string | null,
|};

type DispatchProps = {|
  +changeProfileName: typeof changeProfileName,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type State = {|
  isFocused: boolean,
|};

/**
 * Allow the user to rename profiles. These get persisted to the URL, and the document
 * title is updated with the new name. This component uses a button as a focus
 * target, but then switches to a text input when it is used.
 */
class ProfileNameImpl extends React.PureComponent<Props, State> {
  state = {
    isFocused: false,
  };

  inputRef = React.createRef();

  onInputChange = (e: SyntheticEvent<HTMLInputElement>) => {
    const { changeProfileName } = this.props;
    changeProfileName(e.currentTarget.value);
  };

  handleFinalChange() {
    // Don't allow whitespace at the ends. This can be really weird if you leave a
    // final space at the end.
    const { changeProfileName, profileName } = this.props;
    changeProfileName(profileName.trim());
    this.setState({ isFocused: false });
  }

  onInputBlur = () => {
    this.handleFinalChange();
  };

  blurOnEscapeOrEnter = (event: SyntheticKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      this.handleFinalChange();
    }
  };

  handleButtonFocus = () => {
    const { changeProfileName, profileName } = this.props;

    // Initially ensure that the profile name is not null when first selecting.
    changeProfileName(profileName);

    this.setState({ isFocused: true });

    const input = this.inputRef.current;
    if (input) {
      requestAnimationFrame(() => {
        // Allow time for React to render this.
        input.focus();
        input.select();
      });
    }
  };

  render() {
    const { isFocused } = this.state;
    const { profileName, profileNameOrNull } = this.props;
    const title = 'Edit the profile name';

    return (
      <>
        <button
          type="button"
          style={{
            display: isFocused ? 'none' : 'block',
          }}
          title={title}
          className="profileNameButton"
          onFocus={this.handleButtonFocus}
          onClick={this.handleButtonFocus}
        >
          {profileName}
        </button>
        <input
          className="profileNameInput"
          style={{
            display: isFocused ? 'block' : 'none',
          }}
          value={profileNameOrNull || ''}
          aria-label="Profile name"
          title={title}
          onBlur={this.onInputBlur}
          onChange={this.onInputChange}
          ref={this.inputRef}
          // Keypress won't
          onKeyDown={this.blurOnEscapeOrEnter}
        />
      </>
    );
  }
}

export const ProfileName = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    profileName: getProfileName(state),
    profileNameOrNull: getProfileNameOrNull(state),
  }),
  mapDispatchToProps: {
    changeProfileName,
  },
  component: ProfileNameImpl,
});
