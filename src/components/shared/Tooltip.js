/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ReactDOM from 'react-dom';
import type { CssPixels } from '../../types/units';

import { ensureExists } from '../../utils/flow';
require('./Tooltip.css');

export const MOUSE_OFFSET = 11;

type Props = {
  mouseX: CssPixels,
  mouseY: CssPixels,
  children?: React.Node,
};

type State = {
  interiorElement: HTMLElement | null,
  isNewContentLaidOut: boolean,
};

export default class Tooltip extends React.PureComponent<Props, State> {
  _isMounted: boolean = false;

  state = {
    interiorElement: null,
    isNewContentLaidOut: false,
  };

  _overlayElement = ensureExists(
    document.querySelector('#root-overlay'),
    'Expected to find a root overlay element.'
  );

  _takeInteriorElementRef = (el: HTMLElement | null) => {
    this.setState({ interiorElement: el });
  };

  componentDidMount() {
    this._isMounted = true;
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  componentWillReceiveProps(nextProps: Props) {
    if (nextProps.children !== this.props.children) {
      // If the children are different, allow them to do an initial lay out on the DOM.
      this.setState({ isNewContentLaidOut: false });
      this._forceUpdateAfterRAF();
    }
  }

  componentDidUpdate() {
    // Force an additional update to this component if the children content is
    // different as it needs to fully lay out one time on the DOM to proper calculate
    // sizing and positioning.
    const { interiorElement, isNewContentLaidOut } = this.state;
    if (interiorElement && !isNewContentLaidOut) {
      this._forceUpdateAfterRAF();
    }
  }

  /**
   * Children content needs to be on the DOM (not just virtual DOM) in order to correctly
   * calculate the sizing and positioning of the tooltip.
   */
  _forceUpdateAfterRAF() {
    requestAnimationFrame(() => {
      if (this._isMounted) {
        this.setState({ isNewContentLaidOut: true });
      }
    });
  }

  render() {
    const { children, mouseX, mouseY } = this.props;
    const { interiorElement } = this.state;

    // By default, position the tooltip below and at the right of the mouse cursor.
    let top = mouseY + MOUSE_OFFSET;
    let left = mouseX + MOUSE_OFFSET;

    if (interiorElement) {
      // Let's check the vertical position.
      if (
        mouseY + MOUSE_OFFSET + interiorElement.offsetHeight >=
        window.innerHeight
      ) {
        // The tooltip doesn't fit below the mouse cursor (which is our
        // default strategy). Therefore we try to position it either above the
        // mouse cursor or finally aligned with the window's top edge.
        if (mouseY - MOUSE_OFFSET - interiorElement.offsetHeight > 0) {
          // We position the tooltip above the mouse cursor if it fits there.
          top = mouseY - interiorElement.offsetHeight - MOUSE_OFFSET;
        } else {
          // Otherwise we align the tooltip with the window's top edge.
          top = 0;
        }
      }

      // Now let's check the horizontal position.
      if (
        mouseX + MOUSE_OFFSET + interiorElement.offsetWidth >=
        window.innerWidth
      ) {
        // The tooltip doesn't fit at the right of the mouse cursor (which is
        // our default strategy). Therefore we try to position it either at the
        // left of the mouse cursor or finally aligned with the window's left
        // edge.
        if (mouseX - MOUSE_OFFSET - interiorElement.offsetWidth > 0) {
          // We position the tooltip at the left of the mouse cursor if it fits
          // there.
          left = mouseX - interiorElement.offsetWidth - MOUSE_OFFSET;
        } else {
          // Otherwise, align the tooltip with the window's left edge.
          left = 0;
        }
      }
    }

    const style = {
      left,
      top,
    };

    return ReactDOM.createPortal(
      <div className="tooltip" style={style} ref={this._takeInteriorElementRef}>
        {children}
      </div>,
      this._overlayElement
    );
  }
}
