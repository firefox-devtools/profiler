/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import { ProfileRootMessage } from './ProfileRootMessage';
import { getView, getDataSource } from 'selectors';

import type { AppViewState, State } from '../../types/state';
import type { DataSource } from '../../types/actions';
import type { ConnectedProps } from '../../utils/connect';

const LOADING_MESSAGES: { [string]: string } = Object.freeze({
  'from-addon': 'Grabbing the profile from the Gecko Profiler Addon...',
  'from-file': 'Reading the file and processing the profile...',
  local: 'Not implemented yet.',
  public: 'Downloading and processing the profile...',
  'from-url': 'Downloading and processing the profile...',
  compare: 'Reading and processing profiles...',
});

// TODO Switch to a proper i18n library
function fewTimes(count: number) {
  switch (count) {
    case 1:
      return 'once';
    case 2:
      return 'twice';
    default:
      return `${count} times`;
  }
}

type ProfileLoaderAnimationStateProps = {|
  +view: AppViewState,
  +dataSource: DataSource,
|};

type ProfileLoaderAnimationProps = ConnectedProps<
  {||},
  ProfileLoaderAnimationStateProps,
  {||}
>;

class ProfileLoaderAnimationImpl extends PureComponent<ProfileLoaderAnimationProps> {
  render() {
    const { view, dataSource } = this.props;
    const loadingMessage = LOADING_MESSAGES[dataSource];
    const message = loadingMessage ? loadingMessage : 'View not found';
    const showLoader = Boolean(loadingMessage);

    let additionalMessage = '';
    if (view.additionalData) {
      if (view.additionalData.message) {
        additionalMessage = view.additionalData.message;
      }

      if (view.additionalData.attempt) {
        const attempt = view.additionalData.attempt;
        additionalMessage += `\nTried ${fewTimes(attempt.count)} out of ${
          attempt.total
        }.`;
      }
    }

    return (
      <ProfileRootMessage
        message={message}
        additionalMessage={additionalMessage}
        showLoader={showLoader}
      />
    );
  }
}

export const ProfileLoaderAnimation = explicitConnect<
  {||},
  ProfileLoaderAnimationStateProps,
  {||}
>({
  mapStateToProps: (state: State) => ({
    view: getView(state),
    dataSource: getDataSource(state),
  }),
  component: ProfileLoaderAnimationImpl,
});
