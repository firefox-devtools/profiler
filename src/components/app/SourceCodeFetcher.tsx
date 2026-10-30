/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';

import {
  getProfileOrNull,
  getSourceViewCode,
  getBrowserConnection,
  getSymbolServerUrl,
  getSourceViewFile,
  getSourceViewSourceIndex,
  getSourceViewSourceId,
  getGeneratedSourceViewCode,
  getGeneratedSourceViewFile,
  getGeneratedSourceViewSourceIndex,
  getGeneratedSourceViewSourceId,
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
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  SourceCodeStatus,
  Profile,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';

// The same component fetches the code for the source view and for the
// generated source view. The StateProps describe the source of the respective
// view.
type StateProps = {
  readonly sourceViewFile: string | null;
  readonly sourceViewSourceIndex: IndexIntoSourceTable | null;
  readonly sourceViewSourceId: string | null;
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

  async _triggerSourceLoadingIfNeeded() {
    const {
      sourceViewSourceIndex,
      sourceViewCode,
      sourceViewFile,
      sourceViewSourceId,
      beginLoadingSourceCodeFromUrl,
      beginLoadingSourceCodeFromBrowserConnection,
      finishLoadingSourceCode,
      failLoadingSourceCode,
      symbolServerUrl,
      profile,
      browserConnection,
    } = this.props;

    if (sourceViewSourceIndex === null || sourceViewCode || !sourceViewFile) {
      return;
    }

    if (!profile) {
      return;
    }

    const addressProof = findAddressProofForFile(
      profile,
      sourceViewSourceIndex
    );

    const delegate = new RegularExternalCommunicationDelegate(
      browserConnection,
      {
        onBeginUrlRequest: (url: string) => {
          beginLoadingSourceCodeFromUrl(sourceViewSourceIndex, url);
        },
        onBeginBrowserConnectionQuery: () => {
          beginLoadingSourceCodeFromBrowserConnection(sourceViewSourceIndex);
        },
      }
    );

    const fetchSourceResult = await fetchSource(
      sourceViewFile,
      sourceViewSourceId,
      symbolServerUrl,
      addressProof,
      this._archiveCache,
      delegate
    );

    switch (fetchSourceResult.type) {
      case 'SUCCESS':
        finishLoadingSourceCode(
          sourceViewSourceIndex,
          fetchSourceResult.source
        );
        break;
      case 'ERROR':
        failLoadingSourceCode(sourceViewSourceIndex, fetchSourceResult.errors);
        break;
      default:
        throw assertExhaustiveCheck(fetchSourceResult);
    }
  }

  override render() {
    return null;
  }
}

const mapDispatchToProps = {
  beginLoadingSourceCodeFromUrl,
  beginLoadingSourceCodeFromBrowserConnection,
  finishLoadingSourceCode,
  failLoadingSourceCode,
};

export const SourceCodeFetcher = explicitConnect<{}, StateProps, DispatchProps>(
  {
    mapStateToProps: (state) => ({
      sourceViewSourceIndex: getSourceViewSourceIndex(state),
      sourceViewFile: getSourceViewFile(state),
      sourceViewSourceId: getSourceViewSourceId(state),
      sourceViewCode: getSourceViewCode(state),
      symbolServerUrl: getSymbolServerUrl(state),
      profile: getProfileOrNull(state),
      browserConnection: getBrowserConnection(state),
    }),
    mapDispatchToProps,
    component: SourceCodeFetcherImpl,
  }
);

export const GeneratedSourceCodeFetcher = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    sourceViewSourceIndex: getGeneratedSourceViewSourceIndex(state),
    sourceViewFile: getGeneratedSourceViewFile(state),
    sourceViewSourceId: getGeneratedSourceViewSourceId(state),
    sourceViewCode: getGeneratedSourceViewCode(state),
    symbolServerUrl: getSymbolServerUrl(state),
    profile: getProfileOrNull(state),
    browserConnection: getBrowserConnection(state),
  }),
  mapDispatchToProps,
  component: SourceCodeFetcherImpl,
});
