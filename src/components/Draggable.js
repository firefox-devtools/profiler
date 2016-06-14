import React, { Component, PropTypes } from 'react';

/**
 * A component that reports mouse dragging (left mouse button only) in its
 * onMove handler.
 * While the mouse button is pressed, onMove is called on each mouse move with
 * three arguments: the value of its 'value' field at mousedown time, and the
 * x and y deltas compared to the mouse position at mousedown.
 * During the drag, the additional className 'draggable' is set on the element.
 */
export default class Draggable extends Component {

  constructor(props) {
    super(props);
    this.state = { dragging: false };
    this._onMouseDown = this._onMouseDown.bind(this);
    this._container = null;
    this._containerCreated = c => { this._container = c; };
  }

  _onMouseDown(e) {
    if (!this._container || e.button !== 0) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    this.setState({ dragging: true });

    const mouseDownX = e.pageX;
    const mouseDownY = e.pageY;
    const startValue = this.props.value;

    this._mouseMoveHandler = e => {
      this.props.onMove(startValue, e.pageX - mouseDownX, e.pageY - mouseDownY);
      e.stopPropagation();
      e.preventDefault();
    };

    this._mouseUpHandler = e => {
      this._mouseMoveHandler(e);
      this._uninstallMoveAndUpHandlers();
      this.setState({ dragging: false });
    };

    this._installMoveAndUpHandlers();
  }

  _installMoveAndUpHandlers() {
    window.addEventListener('mousemove', this._mouseMoveHandler, true);
    window.addEventListener('mouseup', this._mouseUpHandler, true);
  }

  _uninstallMoveAndUpHandlers() {
    window.removeEventListener('mousemove', this._mouseMoveHandler, true);
    window.removeEventListener('mouseup', this._mouseUpHandler, true);
  }

  componentWillUnmount() {
    this._uninstallMoveAndUpHandlers();
  }

  render() {
    const props = Object.assign({}, this.props);
    if (this.state.dragging) {
      props.className += ' dragging';
    }
    delete props.onMove;
    delete props.value;
    delete props.children;
    return (
      <div {...props} onMouseDown={this._onMouseDown} ref={this._containerCreated}>
        {this.props.children}
      </div>
    );
  }
}

Draggable.propTypes = {
  value: PropTypes.any,
  onMove: PropTypes.func.isRequired,
  children: PropTypes.children,
};
