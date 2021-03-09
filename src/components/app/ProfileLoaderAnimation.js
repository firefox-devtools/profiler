/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import explicitConnect from 'firefox-profiler/utils/connect';

import { ProfileRootMessage } from 'firefox-profiler/components/app/ProfileRootMessage';
import { getView } from 'firefox-profiler/selectors/app';
import { getDataSource } from 'firefox-profiler/selectors/url-state';

import type { AppViewState, State, DataSource } from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

const LOADING_MESSAGES_L10N_ID: { [string]: string } = Object.freeze({
  'from-addon': 'ProfileLoaderAnimation--loading-message-from-addon',
  unpublished: 'ProfileLoaderAnimation--loading-message-unpublished',
  'from-file': 'ProfileLoaderAnimation--loading-message-from-file',
  local: 'ProfileLoaderAnimation--loading-message-local',
  public: 'ProfileLoaderAnimation--loading-message-public',
  'from-url': 'ProfileLoaderAnimation--loading-message-from-url',
  compare: 'ProfileLoaderAnimation--loading-message-compare',
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
    const loadingMessage = LOADING_MESSAGES_L10N_ID[dataSource];
    const message = loadingMessage
      ? loadingMessage
      : 'ProfileLoaderAnimation--loading-message-view-not-found';
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
      <Localized id={message} attrs={{ message: true }}>
        <ProfileRootMessage
          message={message}
          additionalMessage={additionalMessage}
          showLoader={showLoader}
        />
      </Localized>
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
