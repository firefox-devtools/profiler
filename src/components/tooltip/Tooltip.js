/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ReactDOM from 'react-dom';
import type { CssPixels } from 'firefox-profiler/types';

import { ensureExists } from 'firefox-profiler/utils/flow';
import './Tooltip.css';

export const MOUSE_OFFSET = 11;
// If changing this value, make sure and adjust the max-width in the .tooltip class.
export const VISUAL_MARGIN: CssPixels = 8;

type Props = {|
  +mouseX: CssPixels,
  +mouseY: CssPixels,
  +children: React.Node,
|};

export class Tooltip extends React.PureComponent<Props> {
  _isMounted: boolean = false;
  _isLayoutScheduled: boolean = false;
  _interiorElementRef: {| current: HTMLDivElement | null |} = React.createRef();

  _overlayElement = ensureExists(
    document.querySelector('#root-overlay'),
    'Expected to find a root overlay element.'
  );

  setPositioningStyle() {
    const { mouseX, mouseY } = this.props;

    // By default, position the tooltip below and at the right of the mouse cursor.
    let top = mouseY + MOUSE_OFFSET;
    let left = mouseX + MOUSE_OFFSET;

    const interiorElement = this._interiorElementRef.current;
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
          top = VISUAL_MARGIN;
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
          left = VISUAL_MARGIN;
        }
      }

      interiorElement.style.left = left + 'px';
      interiorElement.style.top = top + 'px';
    }
  }

  componentDidMount() {
    this.setPositioningStyle();
  }

  componentDidUpdate() {
    this.setPositioningStyle();
  }

  render() {
    return ReactDOM.createPortal(
      <div
        className="tooltip"
        data-testid="tooltip"
        style={{
          /* This is the default max width, but can be redefined in children */
          '--tooltip-detail-max-width': '600px',
        }}
        ref={this._interiorElementRef}
      >
        {this.props.children}
      </div>,
      this._overlayElement
    );
  }
}
