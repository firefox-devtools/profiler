/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

import { StackSettings } from '../shared/StackSettings';
import { TransformNavigator } from '../shared/TransformNavigator';
import {
  ConnectedFlameGraph,
  type ConnectedFlameGraphHandle,
} from './ConnectedFlameGraph';
import { FlameGraphEmptyReasons } from './FlameGraphEmptyReasons';
import explicitConnect from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from '../../selectors/per-thread';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {
  readonly isPreviewSelectionEmpty: boolean;
};

type Props = ConnectedProps<{}, StateProps, {}>;

class FlameGraphViewImpl extends React.PureComponent<Props> {
  _connectedFlameGraph: React.RefObject<ConnectedFlameGraphHandle | null> =
    React.createRef();

  override componentDidMount() {
    this._connectedFlameGraph.current?.focus();
  }

  override render() {
    const { isPreviewSelectionEmpty } = this.props;

    return (
      <div
        className="flameGraph"
        id="flame-graph-tab"
        role="tabpanel"
        aria-labelledby="flame-graph-tab-button"
      >
        <StackSettings hideInvertCallstack={true} />
        <TransformNavigator />
        {isPreviewSelectionEmpty ? (
          <FlameGraphEmptyReasons />
        ) : (
          <ConnectedFlameGraph ref={this._connectedFlameGraph} />
        )}
      </div>
    );
  }
}

const FlameGraphViewConnected = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state) => ({
    isPreviewSelectionEmpty:
      !selectedThreadSelectors.getHasPreviewFilteredCtssSamples(state),
  }),
  mapDispatchToProps: {},
  component: FlameGraphViewImpl,
});

export const FlameGraph = FlameGraphViewConnected;
