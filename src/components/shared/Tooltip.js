/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import ReactDOM from 'react-dom';
import type { CssPixels } from '../../types/units';

require('./Tooltip.css');

const MOUSE_OFFSET = 21;

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
  _mountElement: HTMLElement;
  _tooltipRoot: ?HTMLElement;

  state = {
    interiorElement: null,
    isNewContentLaidOut: false,
  };

  _takeInteriorElementRef = (el: HTMLElement | null) => {
    this.setState({ interiorElement: el });
  };

  constructor(props: Props) {
    super(props);
    const el = document.createElement('div');
    el.className = 'tooltipMount';
    this._mountElement = el;
    this._tooltipRoot = document.getElementById('root-tooltip');
  }

  componentDidMount() {
    this._isMounted = true;
    if (this._tooltipRoot) {
      this._tooltipRoot.appendChild(this._mountElement);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
    if (this._tooltipRoot) {
      this._tooltipRoot.removeChild(this._mountElement);
    }
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

    const offsetX = interiorElement
      ? Math.max(0, mouseX + interiorElement.offsetWidth - window.innerWidth)
      : 0;

    let offsetY = 0;
    if (interiorElement) {
      if (
        mouseY + interiorElement.offsetHeight + MOUSE_OFFSET >
        window.innerHeight
      ) {
        offsetY = interiorElement.offsetHeight + MOUSE_OFFSET;
      } else {
        offsetY = -MOUSE_OFFSET;
      }
    }

    const style = {
      left: mouseX - offsetX,
      top: mouseY - offsetY,
    };

    return ReactDOM.createPortal(
      <div className="tooltip" style={style} ref={this._takeInteriorElementRef}>
        {children}
      </div>,
      this._mountElement
    );
  }
}
