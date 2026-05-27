/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Localized } from '@fluent/react';
import * as React from 'react';

import './ProfileRootMessage.css';

type DownloadProgressInfo = {
  readonly receivedBytes: number;
  readonly totalBytes: number | null;
};

type Props = {
  readonly title?: string;
  readonly additionalMessage: React.ReactNode;
  readonly showLoader: boolean;
  readonly showBackHomeLink: boolean;
  readonly downloadProgress?: DownloadProgressInfo | null;
  readonly children: React.ReactNode;
};

function _formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class ProfileRootMessage extends React.PureComponent<Props> {
  override render() {
    const {
      children,
      additionalMessage,
      showLoader,
      showBackHomeLink,
      downloadProgress,
      title,
    } = this.props;
    return (
      <div className="rootMessageContainer">
        <div className="rootMessage">
          <Localized id="ProfileRootMessage--title">
            <h1 className="rootMessageTitle">Firefox Profiler</h1>
          </Localized>
          {title ? <h2>{title}</h2> : null}
          <div className="rootMessageText">
            <p>{children}</p>
          </div>
          {downloadProgress
            ? this._renderDownloadProgress(downloadProgress)
            : null}
          {additionalMessage ? (
            <div className="rootMessageAdditional">{additionalMessage}</div>
          ) : null}
          {showBackHomeLink ? (
            <div className="rootBackHomeLink">
              <a href="/">
                <Localized id="ProfileRootMessage--additional">
                  Back to home
                </Localized>
              </a>
            </div>
          ) : null}
          {showLoader && !downloadProgress ? (
            <div className="loading">
              <div className="loading-div loading-div-1 loading-row-1" />
              <div className="loading-div loading-div-2 loading-row-2" />
              <div className="loading-div loading-div-3 loading-row-3" />
              <div className="loading-div loading-div-4 loading-row-3" />
              <div className="loading-div loading-div-5 loading-row-4" />
              <div className="loading-div loading-div-6 loading-row-4" />
              <div className="loading-div loading-div-7 loading-row-4" />
              <div className="loading-div loading-div-8 loading-row-4" />
              <div className="loading-div loading-div-9 loading-row-4" />
              <div className="loading-div loading-div-10 loading-row-4" />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  _renderDownloadProgress(
    downloadProgress: DownloadProgressInfo
  ): React.ReactNode {
    const receivedStr = _formatBytes(downloadProgress.receivedBytes);
    const progressText = downloadProgress.totalBytes
      ? `${receivedStr} / ${_formatBytes(downloadProgress.totalBytes)}`
      : `${receivedStr} downloaded`;

    return (
      <div className="downloadProgress">
        <Localized
          id="ProfileRootMessage--download-progress-label"
          attrs={{ 'aria-label': true }}
        >
          <div
            className="downloadProgressBarTrack"
            role="progressbar"
            aria-valuenow={downloadProgress.receivedBytes}
            aria-valuemin={0}
            aria-valuemax={downloadProgress.totalBytes ?? undefined}
            aria-valuetext={progressText}
            aria-label="Download progress"
          >
            {downloadProgress.totalBytes ? (
              <div
                className="downloadProgressBarFill"
                style={{
                  width: `${Math.min(100, (downloadProgress.receivedBytes / downloadProgress.totalBytes) * 100)}%`,
                }}
              />
            ) : (
              <div className="downloadProgressBarFillIndeterminate" />
            )}
          </div>
        </Localized>
        <div className="downloadProgressText">
          {downloadProgress.totalBytes ? (
            <Localized
              id="ProfileRootMessage--download-progress-known"
              vars={{
                receivedSize: receivedStr,
                totalSize: _formatBytes(downloadProgress.totalBytes),
              }}
            >
              {progressText}
            </Localized>
          ) : (
            <Localized
              id="ProfileRootMessage--download-progress-unknown"
              vars={{ receivedSize: receivedStr }}
            >
              {progressText}
            </Localized>
          )}
        </div>
      </div>
    );
  }
}
