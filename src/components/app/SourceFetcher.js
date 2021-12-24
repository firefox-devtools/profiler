/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';

import { getSourceViewFile } from 'firefox-profiler/selectors/url-state';
import { getSourceViewSource } from 'firefox-profiler/selectors/sources';
import {
  beginLoadingSourceFromUrl,
  finishLoadingSource,
  failLoadingSource,
} from 'firefox-profiler/actions/sources';
import {
  getDownloadRecipeForSourceFile,
  parseFileNameFromSymbolication,
} from 'firefox-profiler/utils/special-paths';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  FileSourceStatus,
  SourceLoadingError,
} from 'firefox-profiler/types';

type StateProps = {|
  +sourceViewFile: string | null,
  +sourceViewSource: FileSourceStatus | void,
|};

type DispatchProps = {|
  +beginLoadingSourceFromUrl: typeof beginLoadingSourceFromUrl,
  +finishLoadingSource: typeof finishLoadingSource,
  +failLoadingSource: typeof failLoadingSource,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class SourceFetcherImpl extends React.PureComponent<Props> {
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
    } = this.props;

    const errors: SourceLoadingError[] = [];
    const parsedName = parseFileNameFromSymbolication(file);
    const downloadRecipe = getDownloadRecipeForSourceFile(parsedName);

    // First, try to fetch just the single file from the web.
    switch (downloadRecipe.type) {
      case 'CORS_ENABLED_SINGLE_FILE': {
        const { url } = downloadRecipe;
        beginLoadingSourceFromUrl(file, url);

        try {
          const response = await fetch(url, { credentials: 'omit' });

          if (response.status !== 200) {
            throw new Error(
              `The request to ${url} returned HTTP status ${response.status}`
            );
          }

          const source = await response.text();
          finishLoadingSource(file, source);
          return;
        } catch (e) {
          errors.push({
            type: 'NETWORK_ERROR',
            url,
            networkErrorMessage: e.toString(),
          });
        }
        break;
      }
      case 'CORS_ENABLED_ARCHIVE': {
        // Not handled yet.
        errors.push({ type: 'NO_KNOWN_CORS_URL' });
        break;
      }
      case 'NO_KNOWN_CORS_URL': {
        errors.push({ type: 'NO_KNOWN_CORS_URL' });
        break;
      }
      default:
        throw assertExhaustiveCheck(downloadRecipe.type);
    }
    failLoadingSource(file, errors);
  }

  render() {
    return null;
  }
}

export const SourceFetcher = explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    sourceViewFile: getSourceViewFile(state),
    sourceViewSource: getSourceViewSource(state),
  }),
  mapDispatchToProps: {
    beginLoadingSourceFromUrl,
    finishLoadingSource,
    failLoadingSource,
  },
  component: SourceFetcherImpl,
});
