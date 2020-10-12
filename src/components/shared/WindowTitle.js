/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';

import {
  getProfileNameFromUrl,
  getDataSource,
  getFileNameInZipFilePath,
  getProfile,
  getFormattedMetaInfoString,
} from 'firefox-profiler/selectors';

import type { Profile } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +profile: Profile,
  +profileNameFromUrl: string | null,
  +fileNameInZipFilePath: string | null,
  +formattedMetaInfoString: string,
  +dataSource: string,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

const SEPARATOR = ' – ';
const PRODUCT = 'Firefox Profiler';

class WindowTitle extends PureComponent<Props> {
  // This component updates window title in the form of:
  // profile name - version - platform - date time - data source - 'Firefox Profiler'
  _updateTitle() {
    const {
      profile,
      profileNameFromUrl,
      formattedMetaInfoString,
      fileNameInZipFilePath,
      dataSource,
    } = this.props;
    const { meta } = profile;

    if (profileNameFromUrl) {
      document.title = profileNameFromUrl + SEPARATOR + PRODUCT;
    } else {
      let title =
        formattedMetaInfoString + SEPARATOR + _formatDateTime(meta.startTime);
      if (dataSource === 'public') {
        title += ` (${dataSource})`;
      }

      title += SEPARATOR + PRODUCT;

      // Prepend the name of the file if from a zip file.
      if (fileNameInZipFilePath) {
        title = fileNameInZipFilePath + SEPARATOR + title;
      }

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
    profileNameFromUrl: getProfileNameFromUrl(state),
    fileNameInZipFilePath: getFileNameInZipFilePath(state),
    formattedMetaInfoString: getFormattedMetaInfoString(state),
    profile: getProfile(state),
    dataSource: getDataSource(state),
  }),
  component: WindowTitle,
});
