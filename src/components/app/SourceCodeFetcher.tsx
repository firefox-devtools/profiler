/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';

import {
  getProfileOrNull,
  getSourceViewCode,
  getBrowserConnection,
  getSourceViewFile,
  getSymbolServerUrl,
} from 'firefox-profiler/selectors';
import {
  beginLoadingSourceCodeFromUrl,
  beginLoadingSourceCodeFromBrowserConnection,
  finishLoadingSourceCode,
  failLoadingSourceCode,
} from 'firefox-profiler/actions/code';
import { fetchSource } from 'firefox-profiler/utils/fetch-source';
import { RegularExternalCommunicationDelegate } from 'firefox-profiler/utils/query-api';
import { findAddressProofForFile } from 'firefox-profiler/profile-logic/profile-data';
import type { BrowserConnection } from 'firefox-profiler/app-logic/browser-connection';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { SourceCodeStatus, Profile } from 'firefox-profiler/types';

type StateProps = {
  readonly sourceViewFile: string | null;
  readonly sourceViewCode: SourceCodeStatus | void;
  readonly symbolServerUrl: string;
  readonly profile: Profile | null;
  readonly browserConnection: BrowserConnection | null;
};

type DispatchProps = {
  readonly beginLoadingSourceCodeFromUrl: typeof beginLoadingSourceCodeFromUrl;
  readonly beginLoadingSourceCodeFromBrowserConnection: typeof beginLoadingSourceCodeFromBrowserConnection;
  readonly finishLoadingSourceCode: typeof finishLoadingSourceCode;
  readonly failLoadingSourceCode: typeof failLoadingSourceCode;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class SourceCodeFetcherImpl extends React.PureComponent<Props> {
  _archiveCache: Map<string, Promise<Uint8Array>> = new Map();

  override componentDidMount() {
    this._triggerSourceLoadingIfNeeded();
  }

  override componentDidUpdate() {
    this._triggerSourceLoadingIfNeeded();
  }

  _triggerSourceLoadingIfNeeded() {
    const { sourceViewFile, sourceViewCode } = this.props;
    if (sourceViewFile && !sourceViewCode) {
      this._fetchSourceForFile(sourceViewFile);
    }
  }

  async _fetchSourceForFile(file: string) {
    const {
      beginLoadingSourceCodeFromUrl,
      beginLoadingSourceCodeFromBrowserConnection,
      finishLoadingSourceCode,
      failLoadingSourceCode,
      symbolServerUrl,
      profile,
      browserConnection,
    } = this.props;

    const addressProof =
      profile !== null ? findAddressProofForFile(profile, file) : null;

    const delegate = new RegularExternalCommunicationDelegate(
      browserConnection,
      {
        onBeginUrlRequest: (url: string) => {
          beginLoadingSourceCodeFromUrl(file, url);
        },
        onBeginBrowserConnectionQuery: () => {
          beginLoadingSourceCodeFromBrowserConnection(file);
        },
      }
    );

    const fetchSourceResult = await fetchSource(
      file,
      symbolServerUrl,
      addressProof,
      this._archiveCache,
      delegate
    );

    switch (fetchSourceResult.type) {
      case 'SUCCESS':
        finishLoadingSourceCode(file, fetchSourceResult.source);
        break;
      case 'ERROR':
        failLoadingSourceCode(file, fetchSourceResult.errors);
        break;
      default:
        throw assertExhaustiveCheck(fetchSourceResult);
    }
  }

  override render() {
    return null;
  }
}

export const SourceCodeFetcher = explicitConnect<{}, StateProps, DispatchProps>(
  {
    mapStateToProps: (state) => ({
      sourceViewFile: getSourceViewFile(state),
      sourceViewCode: getSourceViewCode(state),
      symbolServerUrl: getSymbolServerUrl(state),
      profile: getProfileOrNull(state),
      browserConnection: getBrowserConnection(state),
    }),
    mapDispatchToProps: {
      beginLoadingSourceCodeFromUrl,
      beginLoadingSourceCodeFromBrowserConnection,
      finishLoadingSourceCode,
      failLoadingSourceCode,
    },
    component: SourceCodeFetcherImpl,
  }
);
