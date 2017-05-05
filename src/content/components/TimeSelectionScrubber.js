/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent, PropTypes } from 'react';
import TimeRuler from './TimeRuler';
import SelectionScrubberOverlay from './SelectionScrubberOverlay';
import clamp from 'clamp';
import { getContentRect } from '../css-geometry-tools';
import { withSize } from '../with-size';

class TimeSelectionScrubberImpl extends PureComponent {

  constructor(props) {
    super(props);
    this.state = {
      hoverLocation: null,
    };
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this.handlers = null;
    this._container = null;
    this._containerCreated = c => { this._container = c; };
  }

  _onMouseDown(e) {
    if (!this._container || e.button !== 0) {
      return;
    }

    const r = getContentRect(this._container);
    if (e.pageX < r.left || e.pageX >= r.right ||
        e.pageY < r.top || e.pageY >= r.bottom) {
      return;
    }

    // Don't steal focus. The -moz-user-focus: ignore declaration achieves
    // this more reliably in Gecko, so this preventDefault is mostly for other
    // browsers.
    e.preventDefault();

    const { rangeStart, rangeEnd, minSelectionStartWidth } = this.props;
    const mouseDownTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;

    let isRangeSelecting = false;

    const mouseMoveHandler = e => {
      const mouseMoveTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;
      const selectionStart = clamp(Math.min(mouseDownTime, mouseMoveTime), rangeStart, rangeEnd);
      const selectionEnd = clamp(Math.max(mouseDownTime, mouseMoveTime), rangeStart, rangeEnd);
      if (isRangeSelecting || selectionEnd - selectionStart >= minSelectionStartWidth) {
        isRangeSelecting = true;
        this.props.onSelectionChange({
          hasSelection: true,
          selectionStart, selectionEnd,
          isModifying: true,
        });
      }
    };

    const mouseUpHandler = e => {
      if (isRangeSelecting) {
        const mouseMoveTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;
        const selectionStart = clamp(Math.min(mouseDownTime, mouseMoveTime), rangeStart, rangeEnd);
        const selectionEnd = clamp(Math.max(mouseDownTime, mouseMoveTime), rangeStart, rangeEnd);
        this.props.onSelectionChange({
          hasSelection: true,
          selectionStart, selectionEnd,
          isModifying: false,
        });
        e.stopPropagation();
        this._uninstallMoveAndUpHandlers();
        return;
      }

      const mouseUpTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;
      const { selectionStart, selectionEnd } = this.props;
      if (mouseUpTime < selectionStart ||
          mouseUpTime >= selectionEnd) {
        // Unset selection.
        this.props.onSelectionChange({
          hasSelection: false,
          isModifying: false,
        });
      }

      // Do not stopPropagation(), so that graph gets mouseup event.
      this._uninstallMoveAndUpHandlers();
    };

    this._installMoveAndUpHandlers(mouseMoveHandler, mouseUpHandler);
  }

  _installMoveAndUpHandlers(mouseMoveHandler, mouseUpHandler) {
    this._handlers = { mouseMoveHandler, mouseUpHandler };
    window.addEventListener('mousemove', mouseMoveHandler, true);
    window.addEventListener('mouseup', mouseUpHandler, true);
  }

  _uninstallMoveAndUpHandlers() {
    if (this._handlers) {
      const { mouseMoveHandler, mouseUpHandler } = this._handlers;
      window.removeEventListener('mousemove', mouseMoveHandler, true);
      window.removeEventListener('mouseup', mouseUpHandler, true);
    }
  }

  _onMouseMove(e) {
    if (!this._container) {
      return;
    }

    const r = getContentRect(this._container);
    if (e.pageX < r.left || e.pageX >= r.right ||
        e.pageY < r.top || e.pageY >= r.bottom) {
      this.setState({ hoverLocation: null });
    } else {
      this.setState({ hoverLocation: e.pageX - r.left });
    }
  }

  render() {
    const {
      className, zeroAt, rangeStart, rangeEnd, children,
      hasSelection, isModifying, selectionStart, selectionEnd,
      width, onSelectionChange, onZoomButtonClick,
    } = this.props;

    const {
      hoverLocation,
    } = this.state;

    return (
      <div className={className}
           ref={this._containerCreated}
           onMouseDown={this._onMouseDown}
           onMouseMove={this._onMouseMove}>
        <TimeRuler className={`${className}TimeRuler`}
                  zeroAt={zeroAt}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  width={width}/>
        { children }
        { hasSelection ? <SelectionScrubberOverlay rangeStart={rangeStart}
                                                   rangeEnd={rangeEnd}
                                                   selectionStart={selectionStart}
                                                   selectionEnd={selectionEnd}
                                                   isModifying={isModifying}
                                                   width={width}
                                                   onSelectionChange={onSelectionChange}
                                                   onZoomButtonClick={onZoomButtonClick}/>
                       : null }
        <div className='timeSelectionScrubberHoverIndicator'
             style={{
               visibility: isModifying || (hoverLocation === null) ? 'hidden' : undefined,
               left: (hoverLocation === null) ? '0' : `${hoverLocation}px`,
             }}/>
      </div>
    );
  }
}

TimeSelectionScrubberImpl.propTypes = {
  className: PropTypes.string.isRequired,
  zeroAt: PropTypes.number.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  minSelectionStartWidth: PropTypes.number.isRequired,
  hasSelection: PropTypes.bool.isRequired,
  isModifying: PropTypes.bool.isRequired,
  selectionStart: PropTypes.number,
  selectionEnd: PropTypes.number,
  width: PropTypes.number.isRequired,
  onSelectionChange: PropTypes.func,
  onZoomButtonClick: PropTypes.func,
  children: PropTypes.node,
};

const TimeSelectionScrubber = withSize(TimeSelectionScrubberImpl);

export default TimeSelectionScrubber;
