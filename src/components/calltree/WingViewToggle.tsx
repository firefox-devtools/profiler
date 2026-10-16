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

import type { State, WingViewName, WingViewType } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './WingViewToggle.css';

type OwnProps = {
  readonly wing: WingViewName;
  // This needs to match the startsAtBottom prop of the wing's flame graph, so
  // that the icon has the same orientation as the flame graph it switches to.
  readonly flameGraphStartsAtBottom: boolean;
};

type StateProps = {
  readonly view: WingViewType;
};

type DispatchProps = {
  readonly changeWingView: typeof changeWingView;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

/**
 * A flame graph with a root box that spans the full width, and children that
 * get narrower with increasing depth. Sibling boxes are separated by a 1px gap.
 * When startsAtBottom is false, the icon is flipped vertically, so that the
 * root is at the top, like an icicle graph.
 */
function FlameGraphIcon({ startsAtBottom }: { startsAtBottom: boolean }) {
  return (
    <svg
      className={startsAtBottom ? undefined : 'wingViewToggleIcon-flipped'}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="10" width="12" height="2" />
      <rect x="0" y="7" width="7" height="2" />
      <rect x="8" y="7" width="4" height="2" />
      <rect x="0" y="4" width="4" height="2" />
      <rect x="5" y="4" width="2" height="2" />
      <rect x="8" y="4" width="3" height="2" />
      <rect x="0" y="1" width="3" height="2" />
    </svg>
  );
}

/**
 * Rows of a tree view, drawn as thin lines so that the icon doesn't look like
 * the boxes of the flame graph icon. The indentation shows the depth of each
 * node, and the twisty triangles show whether a node is expanded.
 */
function CallTreeIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      {/* Twisties: two expanded nodes, a leaf without one, a collapsed node */}
      <path d="M0 0.5h3l-1.5 2z" />
      <path d="M2 3.5h3l-1.5 2z" />
      <path d="M3 9v3l2-1.5z" />
      {/* Row labels */}
      <rect x="4" y="1" width="7" height="1" />
      <rect x="6" y="4" width="6" height="1" />
      <rect x="8" y="7" width="4" height="1" />
      <rect x="6" y="10" width="5" height="1" />
    </svg>
  );
}

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
    const { view, flameGraphStartsAtBottom } = this.props;
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
          <FlameGraphIcon startsAtBottom={flameGraphStartsAtBottom} />
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
          <CallTreeIcon />
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
