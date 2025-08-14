/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import { AppHeader } from './AppHeader';
import { changeProfilesToCompare } from 'firefox-profiler/actions/app';
import explicitConnect from 'firefox-profiler/utils/connect';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import './CompareHome.css';

type DispatchProps = {
  readonly changeProfilesToCompare: typeof changeProfilesToCompare;
};

type Props = ConnectedProps<{}, {}, DispatchProps>;

type State = {
  profile1: string;
  profile2: string;
};

class CompareHomeImpl extends PureComponent<Props, State> {
  override state = { profile1: '', profile2: '' };

  handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    this.setState((prevState) => ({ ...prevState, [name]: value }));
  };

  handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { profile1, profile2 } = this.state;
    const { changeProfilesToCompare } = this.props;
    changeProfilesToCompare([profile1, profile2]);
  };

  override render() {
    const { profile1, profile2 } = this.state;

    return (
      <main className="compareHome">
        <AppHeader />
        <h2 className="photon-title-20">
          <Localized id="CompareHome--instruction-title">
            Enter the profile URLs that you’d like to compare
          </Localized>
        </h2>
        <p className="photon-body-20">
          <Localized id="CompareHome--instruction-content">
            The tool will extract the data from the selected track and range for
            each profile, and put them both on the same view to make them easy
            to compare.
          </Localized>
        </p>
        <form className="compareHomeForm" onSubmit={this.handleFormSubmit}>
          <label className="compareHomeFormLabel" htmlFor="compareHomeProfile1">
            <Localized id="CompareHome--form-label-profile1">
              Profile 1:
            </Localized>
          </label>
          <input
            name="profile1"
            id="compareHomeProfile1"
            className="photon-input"
            type="url"
            required
            placeholder="http://"
            onChange={this.handleInputChange}
            value={profile1}
          />
          <label className="compareHomeFormLabel" htmlFor="compareHomeProfile2">
            <Localized id="CompareHome--form-label-profile2">
              Profile 2:
            </Localized>
          </label>
          <input
            name="profile2"
            id="compareHomeProfile2"
            className="photon-input"
            type="url"
            required
            placeholder="http://"
            onChange={this.handleInputChange}
            value={profile2}
          />
          <Localized id="CompareHome--submit-button" attrs={{ value: true }}>
            <input
              className="compareHomeSubmitButton photon-button photon-button-primary"
              type="submit"
              value="Retrieve profiles"
            />
          </Localized>
        </form>
      </main>
    );
  }
}

export const CompareHome = explicitConnect<{}, {}, DispatchProps>({
  mapDispatchToProps: { changeProfilesToCompare },
  component: CompareHomeImpl,
});
