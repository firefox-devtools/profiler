/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import { Tooltip } from './Tooltip';
import { CssPixels } from 'firefox-profiler/types';

// This isn't an exact object on purpose, because we'll pass all other props to
// the underlying <div>.
type Props = React.HTMLAttributes<HTMLDivElement> & {
  readonly tooltip: React.ReactNode;
};

type State = {
  isMouseOver: boolean;
  mouseX: CssPixels;
  mouseY: CssPixels;
};

/**
 * This component provides a way to automatically insert a tooltip when mousing over
 * a div.
 */
export class DivWithTooltip extends React.PureComponent<Props, State> {
  override state = {
    isMouseOver: false,
    mouseX: 0,
    mouseY: 0,
  };

  override componentWillUnmount() {
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

  override render() {
    const { children, tooltip, ...containerProps } = this.props;
    const { mouseX, mouseY, isMouseOver } = this.state;
    const shouldShowTooltip = isMouseOver;

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
