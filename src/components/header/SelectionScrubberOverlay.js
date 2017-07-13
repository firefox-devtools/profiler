/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';
import clamp from 'clamp';
import Draggable from '../shared/Draggable';
import { getFormattedTimeLength } from '../../profile-logic/range-filters';
import { updateProfileSelection } from '../../actions/profile-view';
import type { Milliseconds } from '../../types/units';

type Props = {
  rangeStart: number,
  rangeEnd: number,
  selectionStart: number,
  selectionEnd: number,
  isModifying: boolean,
  width: number,
  onSelectionChange: typeof updateProfileSelection,
  onZoomButtonClick: (start: Milliseconds, end: Milliseconds) => void,
};

type OnMove = (
  originalValue: { selectionEnd: number, selectionStart: number },
  dx: number,
  dy: number,
  isModifying: boolean
) => void;

export default class SelectionScrubberOverlay extends PureComponent {
  props: Props;
  _rangeStartOnMove: OnMove;
  _moveRangeOnMove: OnMove;
  _rangeEndOnMove: OnMove;

  constructor(props: Props) {
    super(props);

    const makeOnMove = fun => (originalValue, dx, dy, isModifying) => {
      const { rangeStart, rangeEnd, width } = this.props;
      const delta = dx / width * (rangeEnd - rangeStart);
      const selectionDeltas = fun(delta);
      const selectionStart = Math.max(
        rangeStart,
        originalValue.selectionStart + selectionDeltas.startDelta
      );
      const selectionEnd = clamp(
        originalValue.selectionEnd + selectionDeltas.endDelta,
        selectionStart,
        rangeEnd
      );
      this.props.onSelectionChange({
        hasSelection: true,
        isModifying,
        selectionStart,
        selectionEnd,
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

    (this: any)._zoomButtonOnMouseDown = this._zoomButtonOnMouseDown.bind(this);
    (this: any)._zoomButtonOnClick = this._zoomButtonOnClick.bind(this);
  }

  _zoomButtonOnMouseDown(e: MouseEvent) {
    e.stopPropagation();
  }

  _zoomButtonOnClick(e: MouseEvent) {
    e.stopPropagation();
    const { selectionStart, selectionEnd } = this.props;
    this.props.onZoomButtonClick(selectionStart, selectionEnd);
  }

  render() {
    const {
      rangeStart,
      rangeEnd,
      selectionStart,
      selectionEnd,
      isModifying,
      width,
    } = this.props;
    const selection = { selectionStart, selectionEnd };
    const beforeWidth =
      (selectionStart - rangeStart) / (rangeEnd - rangeStart) * width;
    const selectionWidth =
      (selectionEnd - selectionStart) / (rangeEnd - rangeStart) * width;
    return (
      <div className="overlay">
        <div className="dimmerBefore" style={{ width: `${beforeWidth}px` }} />
        <div className="selectionScrubberWrapper">
          <div
            className="selectionScrubberGrippy"
            style={{ width: `${selectionWidth}px` }}
          >
            <Draggable
              className="grippyRangeStart"
              value={selection}
              onMove={this._rangeStartOnMove}
            />
            <Draggable
              className="grippyMoveRange"
              value={selection}
              onMove={this._moveRangeOnMove}
            />
            <Draggable
              className="grippyRangeEnd"
              value={selection}
              onMove={this._rangeEndOnMove}
            />
          </div>
          <div className="selectionScrubberInner">
            <span
              className={classNames('selectionScrubberRange', {
                hidden: !isModifying,
              })}
            >
              {getFormattedTimeLength(selectionEnd - selectionStart)}
            </span>
            <button
              className={classNames('selectionScrubberZoomButton', {
                hidden: isModifying,
              })}
              onMouseDown={this._zoomButtonOnMouseDown}
              onClick={this._zoomButtonOnClick}
            />
          </div>
        </div>
        <div className="dimmerAfter" />
      </div>
    );
  }
}

SelectionScrubberOverlay.propTypes = {
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  selectionStart: PropTypes.number,
  selectionEnd: PropTypes.number,
  isModifying: PropTypes.bool.isRequired,
  width: PropTypes.number.isRequired,
  onSelectionChange: PropTypes.func,
  onZoomButtonClick: PropTypes.func,
};
