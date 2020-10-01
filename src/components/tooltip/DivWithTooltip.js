/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Tooltip } from './Tooltip';
import type { CssPixels } from 'firefox-profiler/types';

type Props = {
  +tooltip: React.Node,
  +children?: React.Node,
};

type State = {|
  isMouseOver: boolean,
  mouseX: CssPixels,
  mouseY: CssPixels,
|};

/**
 * This component provides a way to automatically insert a tooltip when mousing over
 * a div.
 */
export class DivWithTooltip extends React.PureComponent<Props, State> {
  state = {
    isMouseOver: false,
    mouseX: 0,
    mouseY: 0,
  };

  componentWillUnmount() {
    document.removeEventListener('mousemove', this._onMouseMove, false);
  }

  _onMouseEnter = () => {
    this.setState({ isMouseOver: true });
    document.addEventListener('mousemove', this._onMouseMove, false);
  };

  _onMouseLeave = () => {
    // This persistTooltips property is part of the web console API. It helps
    // in being able to inspect and debug tooltips.
    if (!window.persistTooltips) {
      this.setState({ isMouseOver: false });
    }
    document.removeEventListener('mousemove', this._onMouseMove, false);
  };

  _onMouseMove = (event: MouseEvent) => {
    this.setState({
      mouseX: event.pageX,
      mouseY: event.pageY,
    });
  };

  render() {
    const { mouseX, mouseY, isMouseOver } = this.state;
    const { children, tooltip } = this.props;
    const shouldShowTooltip = isMouseOver;

    // Pass through the props without the tooltip property.
    const containerProps = Object.assign({}, this.props);
    delete containerProps.tooltip;

    return (
      <div
        onMouseEnter={this._onMouseEnter}
        onMouseLeave={this._onMouseLeave}
        {...containerProps}
      >
        {children}
        {shouldShowTooltip && tooltip ? (
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            {tooltip}
          </Tooltip>
        ) : null}
      </div>
    );
  }
}
