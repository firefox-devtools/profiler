/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import { getProfileName } from '../../selectors/url-state';
import { getProfile } from '../../selectors/profile';

import type { Profile, ProfileMeta } from '../../types/profile';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type StateProps = {|
  +profile: Profile,
  +profileName: string | null,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class WindowTitle extends PureComponent<Props> {
  // This component updates window title in the form of:
  // profile name - version - platform - date time - 'perf.html'
  componentDidUpdate() {
    const { profile, profileName } = this.props;
    const { meta } = profile;
    let title = '';

    if (profileName) {
      title = title.concat(profileName, ' - ');
    }
    if (meta) {
      title = title.concat(_formatVersion(meta), ' - ');
    }
    if (meta && meta.oscpu) {
      title = title.concat(_formatPlatform(meta), ' - ');
    }
    if (meta && meta.startTime) {
      title = title.concat(_formatDateTime(meta.startTime), ' - ');
    }
    title = title.concat('perf.html');
    document.title = title;
  }

  render() {
    return null;
  }
}

function _formatVersionNumber(version?: string): string | null {
  const regex = /[0-9]+.+[0-9]/gi;

  if (version) {
    const match = version.match(regex);
    if (match) {
      return match.toString();
    }
  }
  return null;
}

function _formatVersion(meta: ProfileMeta): string {
  const product = meta.product || '';
  const version = _formatVersionNumber(meta.misc) || '';
  const versionLabel = product + ' ' + version + ' ';

  return versionLabel;
}

function _formatPlatform(meta: ProfileMeta): string {
  let os;
  // To display Android Version instead of Linux for Android developers.
  if (meta.platform !== undefined && meta.platform.match(/android/i)) {
    os = meta.platform;
  } else {
    os = meta.oscpu || '';
  }

  return os;
}

function _formatDateTime(timestamp: number): string {
  const timestampDate = new Date(timestamp);
  let month = timestampDate.getUTCMonth() + 1 + '';
  let date = timestampDate.getUTCDate() + '';
  const year = timestampDate.getUTCFullYear();

  if (month.length === 1) month = '0' + month;
  if (date.length === 1) date = '0' + date;

  const dateLabel = [year, month, date].join('-');
  const time = _formatTime(timestamp);

  return [dateLabel, time].join(' ');
}

function _formatTime(timestamp: number): string {
  const timestampDate = new Date(timestamp);
  let hours = timestampDate.getUTCHours() + '';
  let minutes = timestampDate.getUTCMinutes() + '';

  if (hours.length === 1) hours = '0' + hours;
  if (minutes.length === 1) minutes = '0' + minutes;

  return [hours, minutes].join(':');
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => ({
    profileName: getProfileName(state),
    profile: getProfile(state),
  }),
  component: WindowTitle,
};

export default explicitConnect(options);
