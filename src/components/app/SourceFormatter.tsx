/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React from 'react';

import { getSourceViewFormattingRequest } from 'firefox-profiler/selectors/code';
import type { SourceFormattingRequest } from 'firefox-profiler/selectors/code';
import { startFormattingSource } from 'firefox-profiler/actions/code';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {
  readonly formattingRequest: SourceFormattingRequest | null;
};

type DispatchProps = {
  readonly startFormattingSource: typeof startFormattingSource;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

/**
 * Starts pretty-printing the source in the source view once the code is
 * available, if the source view is pretty-printed.
 */
class SourceFormatterImpl extends React.PureComponent<Props> {
  override componentDidMount() {
    this._startFormattingIfNeeded();
  }

  override componentDidUpdate() {
    this._startFormattingIfNeeded();
  }

  _startFormattingIfNeeded() {
    const { formattingRequest, startFormattingSource } = this.props;
    if (formattingRequest !== null) {
      startFormattingSource(formattingRequest);
    }
  }

  override render() {
    return null;
  }
}

export const SourceFormatter = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    formattingRequest: getSourceViewFormattingRequest(state),
  }),
  mapDispatchToProps: { startFormattingSource },
  component: SourceFormatterImpl,
});
