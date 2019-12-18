/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';

import EmptyReasons from '../shared/EmptyReasons';
import { selectedThread } from 'firefox-profiler/selectors';

import explicitConnect, { type ConnectedProps } from '../../utils/connect';

import type { State } from '../../types/store';

type StateProps = {|
  +threadName: string,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;
class MarkerChartEmptyReasons extends PureComponent<Props> {
  render() {
    const { threadName } = this.props;

    return (
      <EmptyReasons
        threadName={threadName}
        reason="This thread contains no JS tracer information."
        viewName="js-tracer"
      />
    );
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: (state: State) => ({
    threadName: selectedThread.getFriendlyThreadName(state),
  }),
  component: MarkerChartEmptyReasons,
});
