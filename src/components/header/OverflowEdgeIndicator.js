/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';

import './OverflowEdgeIndicator.css';

type Props = {
  className: string,
  children: number,
};

class OverflowEdgeIndicator extends PureComponent {
  props: Props;
  state: {
    overflowsOnTop: boolean,
    overflowsOnRight: boolean,
    overflowsOnBottom: boolean,
    overflowsOnLeft: boolean,
  };
  _containerCreated: (elem: HTMLDivElement) => void;
  _container: HTMLDivElement;
  _contentsWrapperCreated: (elem: HTMLDivElement) => void;
  _contentsWrapper: HTMLDivElement;

  constructor(props: Props) {
    super(props);
    this.state = {
      overflowsOnTop: false,
      overflowsOnRight: false,
      overflowsOnBottom: false,
      overflowsOnLeft: false,
    };
    (this: any)._onScroll = this._onScroll.bind(this);
    this._containerCreated = elem => {
      this._container = elem;
    };
    this._contentsWrapperCreated = elem => {
      this._contentsWrapper = elem;
    };
  }

  _onScroll() {
    this._updateIndicatorStatus();
  }

  componentDidMount() {
    this._updateIndicatorStatus();
  }

  _updateIndicatorStatus() {
    if (this._container && this._contentsWrapper) {
      const containerRect = this._container.getBoundingClientRect();
      const contentsRect = this._contentsWrapper.getBoundingClientRect();
      const oneDevicePixel = 1 / window.devicePixelRatio;
      this.setState({
        overflowsOnTop: contentsRect.top <= containerRect.top - oneDevicePixel,
        overflowsOnRight:
          contentsRect.right >= containerRect.right + oneDevicePixel,
        overflowsOnBottom:
          contentsRect.bottom >= containerRect.bottom + oneDevicePixel,
        overflowsOnLeft:
          contentsRect.left <= containerRect.left - oneDevicePixel,
      });
    }
  }

  render() {
    const { className, children } = this.props;
    return (
      <div
        className={classNames('overflowEdgeIndicator', className, this.state)}
      >
        <div className="overflowEdgeIndicatorEdge topEdge" />
        <div className="overflowEdgeIndicatorEdge rightEdge" />
        <div className="overflowEdgeIndicatorEdge bottomEdge" />
        <div className="overflowEdgeIndicatorEdge leftEdge" />
        <div
          className={classNames(
            'overflowEdgeIndicatorScrollbox',
            `${className}Scrollbox`
          )}
          onScroll={this._onScroll}
          ref={this._containerCreated}
        >
          <div
            className="overflowEdgeIndicatorContentsWrapper"
            ref={this._contentsWrapperCreated}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
}

OverflowEdgeIndicator.propTypes = {
  className: PropTypes.string,
  children: PropTypes.any,
};

export default OverflowEdgeIndicator;
