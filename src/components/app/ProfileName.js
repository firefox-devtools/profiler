/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { getProfileNameWithDefault } from 'firefox-profiler/selectors';
import { changeProfileName } from 'firefox-profiler/actions/profile-view';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './ProfileName.css';
import { Localized } from '@fluent/react';

type StateProps = {|
  +profileNameWithDefault: string,
|};

type DispatchProps = {|
  +changeProfileName: typeof changeProfileName,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

type State = {|
  focusedWithKey: null | string,
  // Every time the input is focused, it's recreated to consistently set the initial
  // value.
  focusGeneration: number,
|};

/**
 * Allow the user to rename profiles. These get persisted to the URL, and the document
 * title is updated with the new name. This component uses a button as a focus
 * target, but then switches to a text input when it is used. This is done because
 * the button can be dynamically sized according to its content (the default inactive
 * state), and then when active, it switches to an input, which is only fixed in size.
 */
class ProfileNameImpl extends React.PureComponent<Props, State> {
  state = {
    focusedWithKey: null,
    focusGeneration: 0,
  };

  inputRef = React.createRef();

  blurInput() {
    this.setState((state) => ({
      focusedWithKey: null,
      focusGeneration: state.focusGeneration + 1,
    }));
  }

  // This key determines if focusing and the current input are still valid. When
  // either the profile name or the focus generation changes, the input and
  // its focus state is invalidated.
  getKey(): string {
    return `${this.props.profileNameWithDefault}-${this.state.focusGeneration}`;
  }

  changeProfileNameIfChanged = (event: SyntheticEvent<HTMLInputElement>) => {
    const { changeProfileName, profileNameWithDefault } = this.props;
    const newProfileName = event.currentTarget.value.trim();
    this.blurInput();

    if (
      // Make sure the profile name has changed.
      newProfileName !== profileNameWithDefault
    ) {
      changeProfileName(newProfileName ? newProfileName : null);
    }
  };

  blurOnEscapeOrEnter = (event: SyntheticKeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Escape': {
        this.blurInput();
        break;
      }
      case 'Enter': {
        this.changeProfileNameIfChanged(event);
        break;
      }
      default:
      // Do nothing.
    }
  };

  handleButtonFocus = () => {
    this.setState({ focusedWithKey: this.getKey() });
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
    const { focusedWithKey } = this.state;
    // The profileNameWithDefault is either set by the user, or a default is chosen.
    const { profileNameWithDefault } = this.props;
    const key = this.getKey();

    // Only stay focused with the current focus key. This will be invalidated when
    // the input is unfocused, or when the URL state changes the current profile
    // name.
    const isFocused = focusedWithKey === key;

    // Use both a button and input at the same time. Buttons can be sized according
    // to their content, and text inputs cannot. Once the button is focused, it
    // activates the input. The input ref needs to be available to focus, so it
    // is unconditionally attached the DOM, and both element's visibility is
    // controlled by CSS.
    return (
      <>
        <Localized
          id="ProfileName--edit-profile-name-button"
          attrs={{ title: true }}
        >
          <button
            type="button"
            style={{
              display: isFocused ? 'none' : null,
            }}
            title="Edit the profile name"
            className="profileNameButton menuButtonsButton menuButtonsButton-hasRightBorder menuButtonsButton-hasIcon"
            onFocus={this.handleButtonFocus}
            onClick={this.handleButtonFocus}
          >
            {profileNameWithDefault}
          </button>
        </Localized>
        <Localized
          id="ProfileName--edit-profile-name-input"
          attrs={{ title: true, 'aria-label': true }}
        >
          <input
            // Make sure and use the profile name and focus generation to support the
            // back button invalidating the state
            key={key}
            className="profileNameInput"
            style={{
              display: isFocused ? null : 'none',
            }}
            defaultValue={profileNameWithDefault}
            aria-label="Profile name"
            title="Edit the profile name"
            onBlur={this.changeProfileNameIfChanged}
            ref={this.inputRef}
            // Keypress won't
            onKeyDown={this.blurOnEscapeOrEnter}
          />
        </Localized>
      </>
    );
  }
}

export const ProfileName = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    profileNameWithDefault: getProfileNameWithDefault(state),
  }),
  mapDispatchToProps: {
    changeProfileName,
  },
  component: ProfileNameImpl,
});
