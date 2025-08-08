/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { explicitConnectWithForwardRef } from 'firefox-profiler/utils/connect';
import { getInvertCallstack } from '../../selectors/url-state';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { changeInvertCallstack } from '../../actions/profile-view';
import { FlameGraphEmptyReasons } from './FlameGraphEmptyReasons';
import { FlameGraph, type FlameGraphHandle } from './FlameGraph';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './MaybeFlameGraph.css';

// TODO: This component isn't needed any more. Whenever the selected tab
// is "flame-graph", `invertCallstack` will be `false`. <MaybeFlameGraph /> is
// only used in the "flame-graph" tab.

type StateProps = {
  readonly isPreviewSelectionEmpty: boolean;
  readonly invertCallstack: boolean;
};
type DispatchProps = {
  readonly changeInvertCallstack: typeof changeInvertCallstack;
};
type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class MaybeFlameGraphImpl extends React.PureComponent<Props> {
  _flameGraph: React.RefObject<FlameGraphHandle> = React.createRef();

  _onSwitchToNormalCallstackClick = () => {
    this.props.changeInvertCallstack(false);
  };

  override componentDidMount() {
    const flameGraph = this._flameGraph.current;
    if (flameGraph) {
      console.log('flamegraph ref', flameGraph);
      flameGraph.focus();
    }
  }

  override render() {
    const { isPreviewSelectionEmpty, invertCallstack } = this.props;

    if (isPreviewSelectionEmpty) {
      return <FlameGraphEmptyReasons />;
    }

    if (invertCallstack) {
      return (
        <div className="flameGraphDisabledMessage">
          <h3>The Flame Graph is not available for inverted call stacks</h3>
          <p>
            <button
              type="button"
              onClick={this._onSwitchToNormalCallstackClick}
            >
              Switch to the normal call stack
            </button>{' '}
            to show the Flame Graph.
          </p>
        </div>
      );
    }
    return <FlameGraph ref={this._flameGraph} />;
  }
}

export const MaybeFlameGraph = explicitConnectWithForwardRef<
  {},
  StateProps,
  DispatchProps,
  MaybeFlameGraphImpl
>({
  mapStateToProps: (state) => {
    return {
      invertCallstack: getInvertCallstack(state),
      isPreviewSelectionEmpty:
        !selectedThreadSelectors.getHasPreviewFilteredCtssSamples(state),
    };
  },
  mapDispatchToProps: {
    changeInvertCallstack,
  },
  component: MaybeFlameGraphImpl,
});
