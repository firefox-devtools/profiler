/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { changeProfilesToCompare } from '../../actions/app';

import explicitConnect from '../../utils/connect';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import './CompareHome.css';

type DispatchProps = {|
  +changeProfilesToCompare: typeof changeProfilesToCompare,
|};

type Props = ConnectedProps<{||}, {||}, DispatchProps>;

type State = {
  profile1: string,
  profile2: string,
};

class CompareHome extends PureComponent<Props, State> {
  state = { profile1: '', profile2: '' };

  handleInputChange = (event: SyntheticInputEvent<>) => {
    const { name, value } = event.target;
    this.setState({ [name]: value });
  };

  handleFormSubmit = (e: SyntheticEvent<>) => {
    e.preventDefault();
    const { profile1, profile2 } = this.state;
    const { changeProfilesToCompare } = this.props;
    changeProfilesToCompare(profile1, profile2);
  };

  render() {
    const { profile1, profile2 } = this.state;

    return (
      <form className="compareHome" onSubmit={this.handleFormSubmit}>
        <h1>Enter the 2 profile URLs that you’d like to compare</h1>
        <label htmlFor="profile1">Profile 1:</label>
        <input
          name="profile1"
          className="compareHome-input"
          onChange={this.handleInputChange}
          value={profile1}
        />
        <label htmlFor="profile2">Profile 2:</label>
        <input
          name="profile2"
          className="compareHome-input"
          onChange={this.handleInputChange}
          value={profile2}
        />
        <input
          className="compareHome-submit-button"
          type="submit"
          value="Retrieve profiles"
        />
      </form>
    );
  }
}

const options: ExplicitConnectOptions<{||}, {||}, Props> = {
  mapDispatchToProps: { changeProfilesToCompare },
  component: CompareHome,
};

export default explicitConnect(options);
