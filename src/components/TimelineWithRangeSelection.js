import React, { Component, PropTypes } from 'react';
import TimeLine from './TimeLine';
import RangeSelectionOverlay from './RangeSelectionOverlay';
import { withSize } from '../with-size';

class TimelineWithRangeSelectionImpl extends Component {

  constructor(props) {
    super(props);
    this._onMouseDown = this._onMouseDown.bind(this);
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

    const { rangeStart, rangeEnd } = this.props;
    const mouseDownTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;

    let isRangeSelecting = false;

    this._mouseMoveHandler = e => {
      isRangeSelecting = true;
      const mouseMoveTime = (e.pageX - r.left) / r.width * (rangeEnd - rangeStart) + rangeStart;
      const selectionStart = Math.max(rangeStart, Math.min(mouseDownTime, mouseMoveTime));
      const selectionEnd = Math.min(rangeEnd, Math.max(mouseDownTime, mouseMoveTime));
      this.props.onSelectionChange({
        hasSelection: true,
        selectionStart, selectionEnd,
      });
    };

    this._mouseUpHandler = e => {
      if (isRangeSelecting) {
        this._mouseMoveHandler(e);
        e.stopPropagation();
        this._uninstallMoveAndUpHandlers();
        return;
      }

      if (e.detail >= 2) {
        this.props.onSelectionChange({
          hasSelection: false,
        });
        e.stopPropagation();
        this._uninstallMoveAndUpHandlers();
        return;
      }

      // Do not stopPropagation(), so that graph gets mouseup event.
      this._uninstallMoveAndUpHandlers();
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

  render() {
    const { className, zeroAt, rangeStart, rangeEnd, children, hasSelection, selectionStart, selectionEnd, width, onSelectionChange } = this.props;
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
  selectionStart: PropTypes.number,
  selectionEnd: PropTypes.number,
  width: PropTypes.number.isRequired,
  onSelectionChange: PropTypes.func,
  children: PropTypes.node,
};

const TimelineWithRangeSelection = withSize(TimelineWithRangeSelectionImpl);

export default TimelineWithRangeSelection;
