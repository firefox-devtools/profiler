/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
// @ts-check

import { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  assertExhaustiveCheck,
  ensureExists,
} from 'firefox-profiler/utils/flow';

import {
  getProfileNameFromUrl,
  getDataSource,
  getFileNameInZipFilePath,
  getProfileOrNull,
  getFormattedMetaInfoString,
} from 'firefox-profiler/selectors';

import type { Profile, DataSource } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +profile: Profile | null,
  +profileNameFromUrl: string | null,
  +fileNameInZipFilePath: string | null,
  +formattedMetaInfoString: string | null,
  +dataSource: DataSource,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

const SEPARATOR = ' – ';
const PRODUCT = 'Firefox Profiler';

class WindowTitleImpl extends PureComponent<Props> {
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

    switch (dataSource) {
      case 'none':
        document.title = PRODUCT;
        break;
      case 'uploaded-recordings':
        document.title = 'Uploaded Recordings' + SEPARATOR + PRODUCT;
        break;
      case 'compare':
        document.title = 'Compare Profiles' + SEPARATOR + PRODUCT;
        break;
      case 'public':
      case 'local':
      case 'unpublished':
      case 'from-addon':
      case 'from-file':
      case 'from-url':
        if (profileNameFromUrl) {
          document.title = profileNameFromUrl + SEPARATOR + PRODUCT;
        } else {
          const { meta } = ensureExists(
            profile,
            'Expected the profile to exist.'
          );
          let title = '';
          if (formattedMetaInfoString) {
            title += formattedMetaInfoString + SEPARATOR;
          }
          title += _formatDateTime(meta.startTime);
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
        break;
      default:
        throw assertExhaustiveCheck(dataSource);
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

export const WindowTitle = explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    profileNameFromUrl: getProfileNameFromUrl(state),
    fileNameInZipFilePath: getFileNameInZipFilePath(state),
    formattedMetaInfoString: getFormattedMetaInfoString(state),
    profile: getProfileOrNull(state),
    dataSource: getDataSource(state),
  }),
  component: WindowTitleImpl,
});
