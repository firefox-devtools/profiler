/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { compress } from '../../../utils/gz';
import ArrowPanel from '../../shared/ArrowPanel';
import ButtonWithPanel from '../../shared/ButtonWithPanel';
import { serializeProfile } from '../../../profile-logic/process-profile';
import prettyBytes from '../../../utils/pretty-bytes';
import { sendAnalytics } from '../../../utils/analytics';

import type { StartEndRange } from '../../../types/units';
import type { Profile } from '../../../types/profile';

require('./Download.css');

type Props = {
  profile: Profile,
  rootRange: StartEndRange,
};

type State = {|
  uncompressedBlobUrl: string,
  compressedBlobUrl: string,
  uncompressedSize: number,
  compressedSize: number,
  filename: string,
|};

export class ProfileDownloadButton extends React.PureComponent<Props, State> {
  state = {
    uncompressedBlobUrl: '',
    compressedBlobUrl: '',
    uncompressedSize: 0,
    compressedSize: 0,
    filename: '',
  };

  _onPanelOpen = () => {
    const { profile, rootRange } = this.props;
    const profileDate = new Date(profile.meta.startTime + rootRange.start);
    const serializedProfile = serializeProfile(profile);
    const blob = new Blob([serializedProfile], {
      type: 'application/octet-binary',
    });
    const blobUrl = URL.createObjectURL(blob);
    this.setState({
      filename: `${profile.meta.product} ${_filenameDateString(
        profileDate
      )} profile.sps.json`,
      uncompressedBlobUrl: blobUrl,
      uncompressedSize: blob.size,
    });
    compress(serializedProfile).then(data => {
      const blob = new Blob([data], { type: 'application/octet-binary' });
      const blobUrl = URL.createObjectURL(blob);
      this.setState({
        compressedBlobUrl: blobUrl,
        compressedSize: blob.size,
      });
    });
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile save locally',
      eventAction: 'save',
    });
  };

  render() {
    const {
      filename,
      uncompressedBlobUrl,
      compressedBlobUrl,
      uncompressedSize,
      compressedSize,
    } = this.state;
    return (
      <ButtonWithPanel
        className="menuButtonsProfileDownloadButton"
        label="Save as file…"
        panel={
          <ArrowPanel
            className="menuButtonsProfileDownloadPanel"
            title="Save Profile to a Local File"
            onOpen={this._onPanelOpen}
          >
            <section>
              {uncompressedBlobUrl ? (
                <p>
                  <a
                    className="menuButtonsDownloadLink"
                    href={uncompressedBlobUrl}
                    download={filename}
                  >
                    {`${filename} (${prettyBytes(uncompressedSize)})`}
                  </a>
                </p>
              ) : null}
              {compressedBlobUrl ? (
                <p>
                  <a
                    className="menuButtonsDownloadLink"
                    href={compressedBlobUrl}
                    download={`${filename}.gz`}
                  >
                    {`${filename}.gz (${prettyBytes(compressedSize)})`}
                  </a>
                </p>
              ) : null}
            </section>
          </ArrowPanel>
        }
      />
    );
  }
}

function _filenameDateString(d: Date): string {
  const pad = x => (x < 10 ? `0${x}` : `${x}`);
  return `${pad(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}
