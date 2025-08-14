/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import type { InitialSelectedTrackReference } from 'firefox-profiler/types';

import './OverflowEdgeIndicator.css';

type Props = {
  className: string;
  children: React.ReactNode;
  panelLayoutGeneration: number;
  initialSelected: InitialSelectedTrackReference | null;
  forceLayoutGeneration?: number;
};

type State = {
  overflowsOnTop: boolean;
  overflowsOnRight: boolean;
  overflowsOnBottom: boolean;
  overflowsOnLeft: boolean;
};

class OverflowEdgeIndicator extends React.PureComponent<Props, State> {
  _container: HTMLDivElement | null = null;
  _contentsWrapper: HTMLDivElement | null = null;
  _scrolledToInitialSelected: boolean = false;

  override state = {
    overflowsOnTop: false,
    overflowsOnRight: false,
    overflowsOnBottom: false,
    overflowsOnLeft: false,
  };

  _takeContainerRef = (element: HTMLDivElement | null) => {
    this._container = element;
  };

  _takeContainerWrapperRef = (element: HTMLDivElement | null) => {
    this._contentsWrapper = element;
  };

  _onScroll = () => {
    this._updateIndicatorStatus();
  };

  override componentDidMount() {
    this._updateIndicatorStatus();
  }

  override componentDidUpdate(prevProps: Props) {
    this._updateIndicatorStatus();
    const { initialSelected, forceLayoutGeneration } = this.props;
    const container = this._container;

    if (
      forceLayoutGeneration !== undefined &&
      forceLayoutGeneration !== prevProps.forceLayoutGeneration &&
      initialSelected &&
      container !== null
    ) {
      // If forceLayoutGeneration exists and incremented, scroll to the selected
      // element even though it's already scrolled before.
      const childPosition =
        initialSelected.offsetTop + initialSelected.offsetHeight;
      const parentPosition = container.offsetTop + container.offsetHeight;

      if (childPosition > parentPosition) {
        container.scrollTop = initialSelected.offsetTop;
      }
    }

    if (
      !this._scrolledToInitialSelected &&
      initialSelected &&
      this._container
    ) {
      this._container.scrollTop = initialSelected.offsetTop;
      this._scrolledToInitialSelected = true;
    }
  }

  _updateIndicatorStatus() {
    const container = this._container;
    const contentsWrapper = this._contentsWrapper;
    if (container && contentsWrapper) {
      const containerRect = container.getBoundingClientRect();
      const contentsRect = contentsWrapper.getBoundingClientRect();
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

  override render() {
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
          ref={this._takeContainerRef}
        >
          <div
            className="overflowEdgeIndicatorContentsWrapper"
            ref={this._takeContainerWrapperRef}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
}

export { OverflowEdgeIndicator };
