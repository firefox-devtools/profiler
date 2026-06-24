/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { explicitConnectWithForwardRef } from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { FlameGraphEmptyReasons } from './FlameGraphEmptyReasons';
import { FlameGraph, type FlameGraphHandle } from './FlameGraph';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './MaybeFlameGraph.css';

type StateProps = {
  readonly isPreviewSelectionEmpty: boolean;
};
type DispatchProps = {};
type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class MaybeFlameGraphImpl extends React.PureComponent<Props> {
  _flameGraph: React.RefObject<FlameGraphHandle | null> = React.createRef();

  override componentDidMount() {
    const flameGraph = this._flameGraph.current;
    if (flameGraph) {
      flameGraph.focus();
    }
  }

  override render() {
    const { isPreviewSelectionEmpty } = this.props;

    if (isPreviewSelectionEmpty) {
      return <FlameGraphEmptyReasons />;
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
      isPreviewSelectionEmpty:
        !selectedThreadSelectors.getHasPreviewFilteredCtssSamples(state),
    };
  },
  mapDispatchToProps: {},
  component: MaybeFlameGraphImpl,
});
