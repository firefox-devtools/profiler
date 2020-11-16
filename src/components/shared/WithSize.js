/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { findDOMNode } from 'react-dom';
import type { CssPixels } from 'firefox-profiler/types';

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
>(
  Wrapped: React.ComponentType<Props>
): React.ComponentType<
  // The component that is returned does not accept width and height parameters, as
  // they are injected by this higher order component.
  $ReadOnly<$Diff<Props, SizeProps>>
> {
  // An existential type in a generic is a bit tricky to remove. Perhaps this can
  // use a hook instead.
  // See: https://github.com/firefox-devtools/profiler/issues/3062
  // eslint-disable-next-line flowtype/no-existential-type
  return class WithSizeWrapper extends React.PureComponent<*, State> {
    _isSizeInfoDirty: boolean = false;
    state = { width: 0, height: 0 };
    _container: ?(Element | Text);

    componentDidMount() {
      const container = findDOMNode(this); // eslint-disable-line react/no-find-dom-node
      if (!container) {
        throw new Error('Unable to find the DOMNode');
      }
      this._container = container;
      window.addEventListener('resize', this._resizeListener);
      window.addEventListener(
        'visibilitychange',
        this._visibilityChangeListener
      );

      // Wrapping the first update in a requestAnimationFrame to defer the
      // calculation until the full render is done.
      requestAnimationFrame(() => {
        // This component could have already been unmounted, check for the existence
        // of the container.
        if (this._container) {
          this._updateWidth(this._container);
        }
      });
    }
    // The size is only updated when the document is visible.
    // In other cases resizing is registered in _isSizeInfoDirty.
    _resizeListener = () => {
      const container = this._container;
      if (!container) {
        return;
      }
      if (document.hidden) {
        this._isSizeInfoDirty = true;
      } else {
        this._updateWidth(container);
      }
    };

    // If resizing was registered when the document wasn't visible,
    // the size will be updated when the document becomes visible
    _visibilityChangeListener = () => {
      const container = this._container;
      if (!container) {
        return;
      }
      if (!document.hidden && this._isSizeInfoDirty) {
        this._updateWidth(container);
        this._isSizeInfoDirty = false;
      }
    };

    componentWillUnmount() {
      this._container = null;
      window.removeEventListener('resize', this._resizeListener);
      window.removeEventListener(
        'visibilitychange',
        this._visibilityChangeListener
      );
    }

    _updateWidth(container: { +getBoundingClientRect?: () => ClientRect }) {
      if (typeof container.getBoundingClientRect !== 'function') {
        throw new Error('Cannot measure a Text node.');
      }
      const { width, height } = container.getBoundingClientRect();
      this.setState({ width, height });
    }

    render() {
      return <Wrapped {...this.props} {...this.state} />;
    }
  };
}
