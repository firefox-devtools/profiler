/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import {
  getProfileNameFromUrl,
  getDataSource,
  getFileNameInZipFilePath,
  getProfileOrNull,
  getFormattedMetaInfoString,
  getZipFileState,
} from 'firefox-profiler/selectors';

import type { Profile, DataSource } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {
  readonly profile: Profile | null,
  readonly profileNameFromUrl: string | null,
  readonly fileNameInZipFilePath: string | null,
  readonly formattedMetaInfoString: string | null,
  readonly dataSource: DataSource,
  readonly listingZipFile: boolean,
};

type Props = ConnectedProps<{}, StateProps, {}>;

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
      listingZipFile,
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
      case 'from-browser':
      case 'from-post-message':
      case 'from-file':
      case 'from-url':
        if (profileNameFromUrl) {
          document.title = profileNameFromUrl + SEPARATOR + PRODUCT;
        } else if (profile) {
          const { meta } = profile;
          let title = '';
          if (formattedMetaInfoString) {
            title += formattedMetaInfoString;
          }

          // Print the startTime only if it's provided.
          if (meta.startTime > 0) {
            title +=
              SEPARATOR +
              _formatDateTime(meta.startTime + (meta.profilingStartTime || 0));
          }

          if (dataSource === 'public') {
            title += ` (${dataSource})`;
          }

          if (title !== '') {
            // Add the separator only if we added some information before.
            title += SEPARATOR;
          }
          title += PRODUCT;

          // Prepend the name of the file if from a zip file.
          if (fileNameInZipFilePath) {
            title = fileNameInZipFilePath + SEPARATOR + title;
          }

          document.title = title;
        } else if (listingZipFile) {
          /* We're looking at the zip file contents. */
          document.title = 'Archive Contents' + SEPARATOR + PRODUCT;
        } else {
          /* There's no profile yet, but we're not looking at a zip file.
           * Let's use a sensible default, but do not throw because we forgot a
           * case.
           * In the future we may want to check other cases, eg when in loading
           * phase, but it's not worth it at the moment. */
          document.title = PRODUCT;
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

export const WindowTitle = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state) => ({
    profileNameFromUrl: getProfileNameFromUrl(state),
    fileNameInZipFilePath: getFileNameInZipFilePath(state),
    formattedMetaInfoString: getFormattedMetaInfoString(state),
    profile: getProfileOrNull(state),
    dataSource: getDataSource(state),
    listingZipFile: getZipFileState(state).phase === 'LIST_FILES_IN_ZIP_FILE',
  }),
  component: WindowTitleImpl,
});
