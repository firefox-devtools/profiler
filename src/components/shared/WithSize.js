/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { findDOMNode } from 'react-dom';
import type { CssPixels } from 'firefox-profiler/types';
import { getResizeObserverWrapper } from 'firefox-profiler/utils/resize-observer-wrapper';

type State = {|
  width: CssPixels,
  height: CssPixels,
|};

export type SizeProps = $ReadOnly<State>;

/**
 * Wraps a React component and makes 'width' and 'height' available in the
 * wrapped component's props. These props start out at zero and are updated to
 * the component's DOM node's getBoundingClientRect().width/.height after the
 * component has been mounted. They also get updated when the window is
 * resized.
 *
 * Note that the props are *not* updated if the size of the element changes
 * for reasons other than a window resize.
 *
 * Usage: withSize must be used with explicit type arguments.
 *
 * Correct: withSize<Props>(ComponentClass)
 * Incorrect: withSize(ComponentClass)
 */
export function withSize<
  // The SizeProps act as a bounds on the generic props. This ensures that the props
  // that passed in take into account they are being given the width and height.
  Props: $ReadOnly<{ ...SizeProps }>
>(Wrapped: React.ComponentType<Props>): React.ComponentType<
  // The component that is returned does not accept width and height parameters, as
  // they are injected by this higher order component.
  $ReadOnly<$Diff<Props, SizeProps>>
> {
  // An existential type in a generic is a bit tricky to remove. Perhaps this can
  // use a hook instead.
  // See: https://github.com/firefox-devtools/profiler/issues/3062
  // eslint-disable-next-line flowtype/no-existential-type
  return class WithSizeWrapper extends React.PureComponent<*, State> {
    _dirtySize: DOMRectReadOnly | null = null;
    state = { width: 0, height: 0 };
    _container: HTMLElement | null;

    componentDidMount() {
      const container = findDOMNode(this); // eslint-disable-line react/no-find-dom-node
      if (!container) {
        throw new Error('Unable to find the DOMNode');
      }
      this._container = container;
      getResizeObserverWrapper().subscribe(container, this._resizeListener);
      window.addEventListener(
        'visibilitychange',
        this._visibilityChangeListener
      );
    }

    // The size is only updated when the document is visible.
    // In other cases resizing is registered in _dirtySize.
    _resizeListener = (contentRect: DOMRectReadOnly) => {
      const container = this._container;
      if (!container) {
        return;
      }
      if (document.hidden) {
        this._dirtySize = contentRect;
      } else {
        this._updateSize(container, contentRect);
      }
    };

    // If resizing was registered when the document wasn't visible,
    // the size will be updated when the document becomes visible
    _visibilityChangeListener = () => {
      const container = this._container;
      if (!container) {
        return;
      }
      if (!document.hidden && this._dirtySize) {
        this._updateSize(container, this._dirtySize);
        this._dirtySize = null;
      }
    };

    componentWillUnmount() {
      const container = this._container;
      if (container) {
        getResizeObserverWrapper().unsubscribe(container, this._resizeListener);
      }

      window.removeEventListener(
        'visibilitychange',
        this._visibilityChangeListener
      );
      this._container = null;
    }

    _updateSize(container: HTMLElement, contentRect: DOMRectReadOnly) {
      this.setState({
        width: contentRect.width,
        height: contentRect.height,
      });
    }

    render() {
      return <Wrapped {...this.props} {...this.state} />;
    }
  };
}
