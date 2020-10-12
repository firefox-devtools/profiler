/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import explicitConnect from '../../utils/connect';

import { getProfileLoadingState } from '../../selectors/profile';

import type { ProfileLoadingStep } from 'firefox-profiler/types';

import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +profileLoadingStep: ProfileLoadingStep,
  +progress: number,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class ProfileLoadingMessage extends React.PureComponent<Props> {
  // updateProfileLoadingMessage = () => {};

  // componentDidMount() {
  //   this.updateProfileLoadingMessage();
  // }

  // componentDidUpdate() {
  //   this.updateProfileLoadingMessage();
  // }

  render() {
    // const { profileLoadingStep, progress } = this.props;
    return (
      <div className="profileLoadingMessageContainer">
        <div className="loadingStep">This is the loading step</div>
        <div className="loadingStepProgress">This is the progress</div>
      </div>
    );
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    profileLoadingStep: getProfileLoadingState(state).profileLoadingStep,
    progress: getProfileLoadingState(state).progress,
  }),
  component: ProfileLoadingMessage,
});
