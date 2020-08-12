/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';

import { getProfileNameOrNull, getDataSource } from '../../selectors/url-state';
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
const PRODUCT = 'Firefox Profiler';

class WindowTitle extends PureComponent<Props> {
  // This component updates window title in the form of:
  // profile name - version - platform - date time - data source - 'Firefox Profiler'
  _updateTitle() {
    const { profile, profileName, dataSource } = this.props;
    const { meta } = profile;

    if (profileName) {
      document.title = profileName + SEPARATOR + PRODUCT;
    } else {
      let title = formatProductAndVersion(meta) + SEPARATOR;
      const os = formatPlatform(meta);
      if (os) {
        title += os + SEPARATOR;
      }
      title += _formatDateTime(meta.startTime);
      if (dataSource === 'public') {
        title += ` (${dataSource})`;
      }
      title += SEPARATOR + PRODUCT;
      document.title = title;
    }
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
    profileName: getProfileNameOrNull(state),
    profile: getProfile(state),
    dataSource: getDataSource(state),
  }),
  component: WindowTitle,
});
