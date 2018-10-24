/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { findDOMNode } from 'react-dom';
import debounce from 'lodash.debounce';
import type { CssPixels } from '../../types/units';

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
  return class WithSizeWrapper extends React.PureComponent<*, State> {
    _resizeListener: () => void;
    state = { width: 0, height: 0 };

    componentDidMount() {
      const container = findDOMNode(this); // eslint-disable-line react/no-find-dom-node
      if (!container) {
        throw new Error('Unable to find the DOMNode');
      }
      const debouncedUpdateWidth = debounce(() => {
        this._updateWidth(container);
      }, 400);
      this._resizeListener = () => {
        if (document.hidden) {
          debouncedUpdateWidth();
        } else {
          this._updateWidth(container);
        }
      };
      window.addEventListener('resize', this._resizeListener);

      // Wrapping the first update in a requestAnimationFrame to defer the
      // calculation until the full render is done.
      requestAnimationFrame(() => this._updateWidth(container));
    }

    componentWillUnmount() {
      window.removeEventListener('resize', this._resizeListener);
    }

    _updateWidth(container: Element | Text) {
      if (typeof container.getBoundingClientRect !== 'function') {
        throw new Error('Cannot measure a Text node.');
      }
      const { width, height } = container.getBoundingClientRect();
      this.setState({ width, height });
      const style = 'color: green; font-weight: bold;';
      console.log(`[updateWidth]  %c"${width}, ${height}"`, style);
    }

    render() {
      return <Wrapped {...this.props} {...this.state} />;
    }
  };
}
