/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import { findDOMNode } from 'react-dom';
import type { CssPixels } from 'firefox-profiler/types';
import { getResizeObserverWrapper } from 'firefox-profiler/utils/resize-observer-wrapper';

type State = {
  width: CssPixels;
  height: CssPixels;
};

export type SizeProps = Readonly<State>;

/**
 * Wraps a React component and makes 'width' and 'height' available in the
 * wrapped component's props. These props start out at zero and are updated to
 * the component's DOM node's getBoundingClientRect().width/.height after the
 * component has been mounted. They also get updated when the window is
 * resized.
 *
 * Note that the props are *not* updated if the size of the element changes
 * for reasons other than a window resize.
 */
export function withSize<Props>(
  Wrapped: React.ComponentType<Props & SizeProps>
): React.ComponentType<Props> {
  return class WithSizeWrapper extends React.PureComponent<Props, State> {
    override state = { width: 0, height: 0 };
    _container: HTMLElement | null = null;

    override componentDidMount() {
      const container = findDOMNode(this) as HTMLElement; // eslint-disable-line react/no-find-dom-node
      if (!container) {
        throw new Error('Unable to find the DOMNode');
      }
      this._container = container;
      getResizeObserverWrapper().subscribe(container, this._resizeListener);
    }

    // The listener is only called when the document is visible.
    _resizeListener = (contentRect: DOMRectReadOnly) => {
      const container = this._container;
      if (!container) {
        return;
      }
      this._updateSize(container, contentRect);
    };

    override componentWillUnmount() {
      const container = this._container;
      if (container) {
        getResizeObserverWrapper().unsubscribe(container, this._resizeListener);
      }

      this._container = null;
    }

    _updateSize(_container: HTMLElement, contentRect: DOMRectReadOnly) {
      this.setState({
        width: contentRect.width,
        height: contentRect.height,
      });
    }

    override render() {
      const combinedProps: Props & SizeProps = {
        ...this.props,
        ...this.state,
      };
      return <Wrapped {...combinedProps} />;
    }
  };
}
