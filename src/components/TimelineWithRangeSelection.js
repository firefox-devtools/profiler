import React, { Component, PropTypes } from 'react';
import TimeLine from './TimeLine';
import RangeSelectionOverlay from './RangeSelectionOverlay';
import { withSize } from '../with-size';

class TimelineWithRangeSelectionImpl extends Component {

  constructor(props) {
    super(props);
    this._onMouseDown = this._onMouseDown.bind(this);
    this.handlers = null;
    this._container = null;
    this._containerCreated = c => { this._container = c; };
  }

  _onMouseDown(e) {
    if (!this._container || e.button !== 0) {
      return;
    }

    const r = this._container.getBoundingClientRect();
    if (e.pageX < r.left || e.pageX >= r.right ||
        e.pageY < r.top || e.pageY >= r.bottom) {
      return;
    }

    // Don't steal focus. The -moz-user-focus: ignore declaration achieves
    // this more reliably in Gecko, so this preventDefault is mostly for other
    // browsers.
    e.preventDefault();

    const { rangeStart, rangeEnd } = this.props;
    const mouseDownTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;

    let isRangeSelecting = false;

    const mouseMoveHandler = e => {
      isRangeSelecting = true;
      const mouseMoveTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;
      const selectionStart = Math.max(rangeStart, Math.min(mouseDownTime, mouseMoveTime));
      const selectionEnd = Math.min(rangeEnd, Math.max(mouseDownTime, mouseMoveTime));
      this.props.onSelectionChange({
        hasSelection: true,
        selectionStart, selectionEnd,
        isModifying: true,
      });
    };

    const mouseUpHandler = e => {
      if (isRangeSelecting) {
        const mouseMoveTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;
        const selectionStart = Math.max(rangeStart, Math.min(mouseDownTime, mouseMoveTime));
        const selectionEnd = Math.min(rangeEnd, Math.max(mouseDownTime, mouseMoveTime));
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

  render() {
    const { className, zeroAt, rangeStart, rangeEnd, children, hasSelection, isModifying, selectionStart, selectionEnd, width, onSelectionChange } = this.props;
    return (
      <div className={className} ref={this._containerCreated} onMouseDown={this._onMouseDown}>
        <TimeLine className={`${className}TimeLine`}
                  zeroAt={zeroAt}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  width={width} />
        { children }
        { hasSelection ? <RangeSelectionOverlay rangeStart={rangeStart}
                                                rangeEnd={rangeEnd}
                                                selectionStart={selectionStart}
                                                selectionEnd={selectionEnd}
                                                isModifying={isModifying}
                                                width={width}
                                                onSelectionChange={onSelectionChange}/>
                       : null }
      </div>
    );
  }

}

TimelineWithRangeSelectionImpl.propTypes = {
  className: PropTypes.string.isRequired,
  zeroAt: PropTypes.number.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  hasSelection: PropTypes.bool.isRequired,
  isModifying: PropTypes.bool.isRequired,
  selectionStart: PropTypes.number,
  selectionEnd: PropTypes.number,
  width: PropTypes.number.isRequired,
  onSelectionChange: PropTypes.func,
  children: PropTypes.node,
};

const TimelineWithRangeSelection = withSize(TimelineWithRangeSelectionImpl);

export default TimelineWithRangeSelection;
