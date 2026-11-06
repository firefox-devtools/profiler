/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';

import {
  getSourceViewCode,
  getSourceViewFile,
  getSourceViewSourceIndex,
} from 'firefox-profiler/selectors';
import { fetchSourceCode } from 'firefox-profiler/actions/code';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  SourceCodeStatus,
  IndexIntoSourceTable,
} from 'firefox-profiler/types';

type StateProps = {
  readonly sourceViewFile: string | null;
  readonly sourceViewSourceIndex: IndexIntoSourceTable | null;
  readonly sourceViewCode: SourceCodeStatus | void;
};

type DispatchProps = {
  readonly fetchSourceCode: typeof fetchSourceCode;
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
    const {
      sourceViewSourceIndex,
      sourceViewCode,
      sourceViewFile,
      fetchSourceCode,
    } = this.props;

    if (sourceViewSourceIndex === null || sourceViewCode || !sourceViewFile) {
      return;
    }

    fetchSourceCode(sourceViewSourceIndex, this._archiveCache);
  }

  override render() {
    return null;
  }
}

export const SourceCodeFetcher = explicitConnect<{}, StateProps, DispatchProps>(
  {
    mapStateToProps: (state) => ({
      sourceViewSourceIndex: getSourceViewSourceIndex(state),
      sourceViewFile: getSourceViewFile(state),
      sourceViewCode: getSourceViewCode(state),
    }),
    mapDispatchToProps: { fetchSourceCode },
    component: SourceCodeFetcherImpl,
  }
);
