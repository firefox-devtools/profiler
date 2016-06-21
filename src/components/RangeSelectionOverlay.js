import React, { Component, PropTypes } from 'react';
import classNames from 'classnames';
import Draggable from './Draggable';

export default class RangeSelectionOverlay extends Component {
  constructor(props) {
    super(props);

    const makeOnMove = fun => (originalValue, dx, dy, isModifying) => {
      const { rangeStart, rangeEnd, width } = this.props;
      const delta = dx / width * (rangeEnd - rangeStart);
      const selectionDeltas = fun(delta);
      const selectionStart = Math.max(rangeStart, originalValue.selectionStart + selectionDeltas.startDelta);
      const selectionEnd = Math.max(selectionStart, Math.min(rangeEnd, originalValue.selectionEnd + selectionDeltas.endDelta));
      this.props.onSelectionChange({
        hasSelection: true, isModifying, selectionStart, selectionEnd,
      });
    };

    this._rangeStartOnMove = makeOnMove(delta => ({
      startDelta: delta,
      endDelta: 0,
    }));
    this._moveRangeOnMove = makeOnMove(delta => ({
      startDelta: delta,
      endDelta: delta,
    }));
    this._rangeEndOnMove = makeOnMove(delta => ({
      startDelta: 0,
      endDelta: delta,
    }));

    this._zoomButtonOnMouseDown = this._zoomButtonOnMouseDown.bind(this);
    this._zoomButtonOnClick = this._zoomButtonOnClick.bind(this);
  }

  _zoomButtonOnMouseDown(e) {
    e.stopPropagation();
  }

  _zoomButtonOnClick(e) {
    e.stopPropagation();
    const { selectionStart, selectionEnd } = this.props;
    this.props.onZoomButtonClick(selectionStart, selectionEnd);
  }

  render() {
    const { rangeStart, rangeEnd, selectionStart, selectionEnd, isModifying, width } = this.props;
    const selection = { selectionStart, selectionEnd };
    const beforeWidth = (selectionStart - rangeStart) / (rangeEnd - rangeStart) * width;
    const selectionWidth = (selectionEnd - selectionStart) / (rangeEnd - rangeStart) * width;
    return (
      <div className='overlay'>
        <div className='dimmerBefore' style={{width: `${beforeWidth}px`}}></div>
        <div className='rangeSelectionWrapper'>
          <div className='rangeSelectionGrippy' style={{width: `${selectionWidth}px`}}>
            <Draggable className='grippyRangeStart' value={selection} onMove={this._rangeStartOnMove}/>
            <Draggable className='grippyMoveRange' value={selection} onMove={this._moveRangeOnMove}/>
            <Draggable className='grippyRangeEnd' value={selection} onMove={this._rangeEndOnMove}/>
          </div>
          <div className='rangeSelectionInner'>
            <button className={classNames('rangeSelectionZoomButton', { hidden: isModifying })}
                    onMouseDown={this._zoomButtonOnMouseDown}
                    onClick={this._zoomButtonOnClick}/>
          </div>
        </div>
        <div className='dimmerAfter'></div>
      </div>
    );
  }
}

RangeSelectionOverlay.propTypes = {
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  selectionStart: PropTypes.number,
  selectionEnd: PropTypes.number,
  isModifying: PropTypes.bool.isRequired,
  width: PropTypes.number.isRequired,
  onSelectionChange: PropTypes.func,
  onZoomButtonClick: PropTypes.func,
};
