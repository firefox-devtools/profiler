/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import { getProfileName, getDataSource } from '../../selectors/url-state';
import { getProfile } from '../../selectors/profile';
import {
  formatProductAndVersion,
  formatPlatform,
} from '../../profile-logic/profile-metainfo';

import type { Profile } from 'firefox-profiler/types';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +profile: Profile,
  +profileName: string | null,
  +dataSource: string,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

const SEPARATOR = ' – ';

class WindowTitle extends PureComponent<Props> {
  // This component updates window title in the form of:
  // profile name - version - platform - date time - data source - 'Firefox profiler'
  _updateTitle() {
    const { profile, profileName, dataSource } = this.props;
    const { meta } = profile;
    let title = '';

    if (profileName) {
      title += profileName + SEPARATOR;
    }
    title += formatProductAndVersion(meta) + SEPARATOR;
    const os = formatPlatform(meta);
    if (os) {
      title += os + SEPARATOR;
    }
    title += _formatDateTime(meta.startTime);
    if (dataSource === 'public') {
      title += ` (${dataSource})`;
    }
    title += SEPARATOR + 'Firefox profiler';
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
