/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';

import {
  getSourceViewFile,
  getSymbolServerUrl,
} from 'firefox-profiler/selectors/url-state';
import { getSourceViewSource } from 'firefox-profiler/selectors/sources';
import { getProfileOrNull } from 'firefox-profiler/selectors';
import {
  beginLoadingSourceFromUrl,
  finishLoadingSource,
  failLoadingSource,
} from 'firefox-profiler/actions/sources';
import { fetchSource } from 'firefox-profiler/utils/fetch-source';
import { findAddressProofForFile } from 'firefox-profiler/profile-logic/profile-data';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { FileSourceStatus, Profile } from 'firefox-profiler/types';

type StateProps = {|
  +sourceViewFile: string | null,
  +sourceViewSource: FileSourceStatus | void,
  +symbolServerUrl: string,
  +profile: Profile | null,
|};

type DispatchProps = {|
  +beginLoadingSourceFromUrl: typeof beginLoadingSourceFromUrl,
  +finishLoadingSource: typeof finishLoadingSource,
  +failLoadingSource: typeof failLoadingSource,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class SourceFetcherImpl extends React.PureComponent<Props> {
  _archiveCache: Map<string, Promise<Uint8Array>> = new Map();

  componentDidMount() {
    this._triggerSourceLoadingIfNeeded();
  }

  componentDidUpdate() {
    this._triggerSourceLoadingIfNeeded();
  }

  _triggerSourceLoadingIfNeeded() {
    const { sourceViewFile, sourceViewSource } = this.props;
    if (sourceViewFile && !sourceViewSource) {
      this._fetchSourceForFile(sourceViewFile);
    }
  }

  async _fetchSourceForFile(file: string) {
    const {
      beginLoadingSourceFromUrl,
      finishLoadingSource,
      failLoadingSource,
      symbolServerUrl,
      profile,
    } = this.props;

    const addressProof =
      profile !== null ? findAddressProofForFile(profile, file) : null;

    const fetchSourceResult = await fetchSource(
      file,
      symbolServerUrl,
      addressProof,
      this._archiveCache,
      {
        fetchUrlResponse: async (url: string, postData?: MixedObject) => {
          beginLoadingSourceFromUrl(file, url);

          const requestInit =
            postData !== undefined
              ? {
                  body: postData,
                  method: 'POST',
                  mode: 'cors',
                  credentials: 'omit',
                }
              : { credentials: 'omit' };
          const response = await fetch(url, requestInit);
          if (response.status !== 200) {
            throw new Error(
              `The request to ${url} returned HTTP status ${response.status}`
            );
          }
          return response;
        },
      }
    );

    switch (fetchSourceResult.type) {
      case 'SUCCESS':
        finishLoadingSource(file, fetchSourceResult.source);
        break;
      case 'ERROR':
        failLoadingSource(file, fetchSourceResult.errors);
        break;
      default:
        throw assertExhaustiveCheck(fetchSourceResult.type);
    }
  }

  render() {
    return null;
  }
}

export const SourceFetcher = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    sourceViewFile: getSourceViewFile(state),
    sourceViewSource: getSourceViewSource(state),
    symbolServerUrl: getSymbolServerUrl(state),
    profile: getProfileOrNull(state),
  }),
  mapDispatchToProps: {
    beginLoadingSourceFromUrl,
    finishLoadingSource,
    failLoadingSource,
  },
  component: SourceFetcherImpl,
});
