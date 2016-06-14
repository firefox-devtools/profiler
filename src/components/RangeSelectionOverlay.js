import React, { Component, PropTypes } from 'react';
import Draggable from './Draggable';

export default class RangeSelectionOverlay extends Component {
  constructor(props) {
    super(props);

    const makeOnMove = fun => (originalValue, dx) => {
      const { rangeStart, rangeEnd, width } = this.props;
      const delta = dx / width * (rangeEnd - rangeStart);
      const selectionDeltas = fun(delta);
      const selectionStart = Math.max(rangeStart, originalValue.selectionStart + selectionDeltas.startDelta);
      const selectionEnd = Math.max(selectionStart, Math.min(rangeEnd, originalValue.selectionEnd + selectionDeltas.endDelta));
      this.props.onSelectionChange({
        hasSelection: true, selectionStart, selectionEnd,
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
  }

  render() {
    const { rangeStart, rangeEnd, selectionStart, selectionEnd, width } = this.props;
    const selection = { selectionStart, selectionEnd };
    const beforeWidth = (selectionStart - rangeStart) / (rangeEnd - rangeStart) * width;
    const selectionWidth = (selectionEnd - selectionStart) / (rangeEnd - rangeStart) * width;
    return (
      <div className='overlay'>
        <div className='dimmerBefore' style={{width: `${beforeWidth}px`}}></div>
        <div className='rangeSelectionGrippy' style={{width: `${selectionWidth}px`}}>
          <Draggable className='grippyRangeStart' value={selection} onMove={this._rangeStartOnMove}/>
          <Draggable className='grippyMoveRange' value={selection} onMove={this._moveRangeOnMove}/>
          <Draggable className='grippyRangeEnd' value={selection} onMove={this._rangeEndOnMove}/>
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
  width: PropTypes.number.isRequired,
  onSelectionChange: PropTypes.func,
};
