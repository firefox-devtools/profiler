import React, { Component } from 'react';
import { findDOMNode } from 'react-dom';

/**
 * Wraps a React component and makes 'width' and 'height' available in the
 * wrapped component's props. These props start out at zero and are updated to
 * the component's DOM node's getBoundingClientRect().width/.height after the
 * component has been mounted. They also get updated when the window is
 * resized.
 * Note that the props are *not* updated if the size of the element changes
 * for reasons other than a window resize.
 * @param  {class} Wrapped The class that gets wrapped.
 * @return {class}         The resulting Component class.
 */
export const withSize = Wrapped => class WithSizeWrapper extends Component {
  constructor(props) {
    super(props);
    this.state = { width: 0, height: 0 };
    this._observeSize = this._observeSize.bind(this);
  }

  _observeSize(wrappedComponent) {
    if (!wrappedComponent) {
      return;
    }
    const container = findDOMNode(wrappedComponent);
    this._resizeListener = () => this._updateWidth(container);
    window.addEventListener('resize', this._resizeListener);
    this._updateWidth(container);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener);
  }

  _updateWidth(container) {
    const { width, height } = container.getBoundingClientRect();
    this.setState({ width, height });
  }

  render() {
    return <Wrapped ref={this._observeSize} {...this.props} {...this.state}/>;
  }
};
