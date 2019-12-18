/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import { getProfileName, getDataSource, getProfile } from 'selectors';

import type { Profile, ProfileMeta } from '../../types/profile';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +profile: Profile,
  +profileName: string | null,
  +dataSource: string,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class WindowTitle extends PureComponent<Props> {
  // This component updates window title in the form of:
  // profile name - version - platform - date time - data source - 'Firefox profiler'
  _updateTitle() {
    const { profile, profileName, dataSource } = this.props;
    const { meta } = profile;
    let title = '';

    if (profileName) {
      title = title.concat(profileName, ' - ');
    }
    title = title.concat(_formatVersion(meta), ' - ');
    if (meta.oscpu) {
      title = title.concat(_formatPlatform(meta), ' - ');
    }
    title = title.concat(_formatDateTime(meta.startTime));
    if (dataSource === 'public') {
      title = title.concat(' (', dataSource, ')');
    }
    title = title.concat(' - ', 'Firefox profiler');
    document.title = title;
  }

  componentDidMount() {
    this._updateTitle();
  }

  componentDidUpdate() {
    this._updateTitle();
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
  const dateTimeLabel = new Date(timestamp).toLocaleString(undefined, {
    timeZone: 'UTC',
    timeZoneName: 'short',
  });

  return dateTimeLabel;
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    profileName: getProfileName(state),
    profile: getProfile(state),
    dataSource: getDataSource(state),
  }),
  component: WindowTitle,
});
