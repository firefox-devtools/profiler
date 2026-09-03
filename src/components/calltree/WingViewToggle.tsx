/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getUpperWingView,
  getLowerWingView,
  getSelfWingView,
} from 'firefox-profiler/selectors/url-state';
import { changeWingView } from 'firefox-profiler/actions/profile-view';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

import type { State, WingViewType } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './WingViewToggle.css';

type OwnProps = {
  readonly wing: 'upper' | 'lower' | 'self';
};

type StateProps = {
  readonly view: WingViewType;
};

type DispatchProps = {
  readonly changeWingView: typeof changeWingView;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class WingViewToggleImpl extends React.PureComponent<Props> {
  _onFlameGraphClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    this.props.changeWingView(this.props.wing, 'flame-graph');
  };
  _onCallTreeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    this.props.changeWingView(this.props.wing, 'call-tree');
  };

  override render() {
    const { view } = this.props;
    return (
      <div className="wingViewToggle" role="group">
        <button
          type="button"
          className={`wingViewToggleButton wingViewToggleButton-flameGraph ${
            view === 'flame-graph' ? 'selected' : ''
          }`}
          onClick={this._onFlameGraphClick}
          aria-pressed={view === 'flame-graph'}
          title="Show flame graph"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="1" y="1" width="10" height="2" />
            <rect x="2" y="4" width="6" height="2" />
            <rect x="3" y="7" width="3" height="2" />
            <rect x="4" y="10" width="2" height="1" />
          </svg>
        </button>
        <button
          type="button"
          className={`wingViewToggleButton wingViewToggleButton-callTree ${
            view === 'call-tree' ? 'selected' : ''
          }`}
          onClick={this._onCallTreeClick}
          aria-pressed={view === 'call-tree'}
          title="Show call tree"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
            focusable="false"
          >
            <rect x="0" y="1" width="3" height="2" />
            <rect x="3" y="5" width="3" height="2" />
            <rect x="6" y="9" width="3" height="2" />
          </svg>
        </button>
      </div>
    );
  }
}

export const WingViewToggle = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state: State, ownProps: OwnProps) => {
    let view;
    switch (ownProps.wing) {
      case 'upper':
        view = getUpperWingView(state);
        break;
      case 'lower':
        view = getLowerWingView(state);
        break;
      case 'self':
        view = getSelfWingView(state);
        break;
      default:
        throw assertExhaustiveCheck(ownProps.wing, 'Unhandled wing.');
    }
    return { view };
  },
  mapDispatchToProps: {
    changeWingView,
  },
  component: WingViewToggleImpl,
});
