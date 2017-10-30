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
  _isMounted: boolean;
  _mountElement: ?HTMLElement;

  constructor(props: Props) {
    super(props);
    (this: any)._setMountElement = this._setMountElement.bind(this);
    this.state = {
      interiorElement: null,
      isNewContentLaidOut: false,
    };
  }

  _setMountElement(el: HTMLElement | null) {
    this.setState({ interiorElement: el });
  }

  componentDidMount() {
    this._isMounted = true;
    // Create a DOM node outside of the normal heirarchy.
    const el = document.createElement('div');
    el.className = 'tooltipMount';

    // Satisfy flow null checks.
    if (!document.body) {
      throw new Error('No document body was found to append to.');
    }
    document.body.appendChild(el);
    this._mountElement = el;
    this._renderTooltipContents();
  }

  componentWillUnmount() {
    ReactDOM.unmountComponentAtNode(this._mountElement);
    // Satisfy flow null checks.
    if (this._mountElement) {
      this._mountElement.remove();
    }
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

    this._renderTooltipContents();
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

  /**
   * This is really ugly, but the tooltip needs to be outside of the normal
   * DOM heirarchy so it isn't clipped by some arbitrary stacking context.
   */
  _renderTooltipContents() {
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

    ReactDOM.render(
      <div className="tooltip" style={style} ref={this._setMountElement}>
        {children}
      </div>,
      this._mountElement
    );
  }

  render() {
    return null;
  }
}
