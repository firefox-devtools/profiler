/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import clamp from 'clamp';
import { getContentRect } from '../../utils/css-geometry-tools';
import {
  getProfileInterval,
  getProfileViewOptions,
  getDisplayRange,
  getZeroAt,
} from '../../reducers/profile-view';
import {
  updateProfileSelection,
  addRangeFilterAndUnsetSelection,
} from '../../actions/profile-view';
import explicitConnect from '../../utils/connect';
import classNames from 'classnames';
import Draggable from '../shared/Draggable';
import { getFormattedTimeLength } from '../../profile-logic/range-filters';
import './Selection.css';

import type { OnMove } from '../shared/Draggable';
import type { Milliseconds, CssPixels, StartEndRange } from '../../types/units';
import type { ProfileSelection } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type MouseHandler = (event: MouseEvent) => void;

type OwnProps = {|
  +width: number,
  +children: React.Node,
|};

type StateProps = {|
  +selection: ProfileSelection,
  +displayRange: StartEndRange,
  +zeroAt: Milliseconds,
  +minSelectionStartWidth: Milliseconds,
|};

type DispatchProps = {|
  +addRangeFilterAndUnsetSelection: typeof addRangeFilterAndUnsetSelection,
  +updateProfileSelection: typeof updateProfileSelection,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {|
  hoverLocation: null | CssPixels,
|};

class TimelineRulerAndSelection extends React.PureComponent<Props, State> {
  _handlers: ?{
    mouseMoveHandler: MouseHandler,
    mouseUpHandler: MouseHandler,
  };

  _container: ?HTMLElement;
  _rangeStartOnMove: OnMove;
  _moveRangeOnMove: OnMove;
  _rangeEndOnMove: OnMove;

  state = {
    hoverLocation: null,
  };

  _containerCreated = (element: HTMLElement | null) => {
    this._container = element;
  };

  _onMouseDown = (event: SyntheticMouseEvent<>) => {
    if (!this._container || event.button !== 0) {
      return;
    }

    const rect = getContentRect(this._container);
    if (
      event.pageX < rect.left ||
      event.pageX >= rect.right ||
      event.pageY < rect.top ||
      event.pageY >= rect.bottom
    ) {
      return;
    }

    // Don't steal focus. The -moz-user-focus: ignore declaration achieves
    // this more reliably in Gecko, so this preventDefault is mostly for other
    // browsers.
    event.preventDefault();

    const { displayRange, minSelectionStartWidth } = this.props;
    const mouseDownTime =
      (event.pageX - rect.left) /
        rect.width *
        (displayRange.end - displayRange.start) +
      displayRange.start;

    let isRangeSelecting = false;

    const mouseMoveHandler = event => {
      const mouseMoveTime =
        (event.pageX - rect.left) /
          rect.width *
          (displayRange.end - displayRange.start) +
        displayRange.start;
      const selectionStart = clamp(
        Math.min(mouseDownTime, mouseMoveTime),
        displayRange.start,
        displayRange.end
      );
      const selectionEnd = clamp(
        Math.max(mouseDownTime, mouseMoveTime),
        displayRange.start,
        displayRange.end
      );
      if (
        isRangeSelecting ||
        selectionEnd - selectionStart >= minSelectionStartWidth
      ) {
        isRangeSelecting = true;
        this.props.updateProfileSelection({
          hasSelection: true,
          selectionStart,
          selectionEnd,
          isModifying: true,
        });
      }
    };

    const mouseUpHandler = event => {
      if (isRangeSelecting) {
        const mouseMoveTime =
          (event.pageX - rect.left) /
            rect.width *
            (displayRange.end - displayRange.start) +
          displayRange.start;
        const selectionStart = clamp(
          Math.min(mouseDownTime, mouseMoveTime),
          displayRange.start,
          displayRange.end
        );
        const selectionEnd = clamp(
          Math.max(mouseDownTime, mouseMoveTime),
          displayRange.start,
          displayRange.end
        );
        this.props.updateProfileSelection({
          hasSelection: true,
          selectionStart,
          selectionEnd,
          isModifying: false,
        });
        event.stopPropagation();
        this._uninstallMoveAndUpHandlers();
        return;
      }

      const { selection } = this.props;
      if (selection.hasSelection) {
        const mouseUpTime =
          (event.pageX - rect.left) /
            rect.width *
            (displayRange.end - displayRange.start) +
          displayRange.start;
        const { selectionStart, selectionEnd } = selection;
        if (mouseUpTime < selectionStart || mouseUpTime >= selectionEnd) {
          // Unset selection.
          this.props.updateProfileSelection({
            hasSelection: false,
            isModifying: false,
          });
        }
      }

      // Do not stopPropagation(), so that graph gets mouseup event.
      this._uninstallMoveAndUpHandlers();
    };

    this._installMoveAndUpHandlers(mouseMoveHandler, mouseUpHandler);
  };

  _installMoveAndUpHandlers(
    mouseMoveHandler: MouseHandler,
    mouseUpHandler: MouseHandler
  ) {
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

  _onMouseMove = (event: SyntheticMouseEvent<>) => {
    if (!this._container) {
      return;
    }

    const rect = getContentRect(this._container);
    if (
      event.pageX < rect.left ||
      event.pageX >= rect.right ||
      event.pageY < rect.top ||
      event.pageY >= rect.bottom
    ) {
      this.setState({ hoverLocation: null });
    } else {
      this.setState({ hoverLocation: event.pageX - rect.left });
    }
  };

  _makeOnMove = (fun: number => { startDelta: number, endDelta: number }) => (
    originalSelection: { +selectionStart: number, +selectionEnd: number },
    dx: number,
    dy: number,
    isModifying: boolean
  ) => {
    const { displayRange, width, updateProfileSelection } = this.props;
    const delta = dx / width * (displayRange.end - displayRange.start);
    const selectionDeltas = fun(delta);
    const selectionStart = Math.max(
      displayRange.start,
      originalSelection.selectionStart + selectionDeltas.startDelta
    );
    const selectionEnd = clamp(
      originalSelection.selectionEnd + selectionDeltas.endDelta,
      selectionStart,
      displayRange.end
    );
    updateProfileSelection({
      hasSelection: true,
      isModifying,
      selectionStart,
      selectionEnd,
    });
  };

  _rangeStartOnMove = this._makeOnMove(delta => ({
    startDelta: delta,
    endDelta: 0,
  }));

  _moveRangeOnMove = this._makeOnMove(delta => ({
    startDelta: delta,
    endDelta: delta,
  }));

  _rangeEndOnMove = this._makeOnMove(delta => ({
    startDelta: 0,
    endDelta: delta,
  }));

  _zoomButtonOnMouseDown = (e: SyntheticMouseEvent<>) => {
    e.stopPropagation();
  };

  _zoomButtonOnClick = (e: SyntheticMouseEvent<>) => {
    e.stopPropagation();
    const { selection, zeroAt, addRangeFilterAndUnsetSelection } = this.props;
    if (selection.hasSelection) {
      addRangeFilterAndUnsetSelection(
        selection.selectionStart - zeroAt,
        selection.selectionEnd - zeroAt
      );
    }
  };

  renderSelectionOverlay(selection: {
    +selectionStart: number,
    +selectionEnd: number,
    +isModifying: boolean,
  }) {
    const { displayRange, width } = this.props;
    const { selectionStart, selectionEnd } = selection;

    const beforeWidth =
      (selectionStart - displayRange.start) /
      (displayRange.end - displayRange.start) *
      width;
    const selectionWidth =
      (selectionEnd - selectionStart) /
      (displayRange.end - displayRange.start) *
      width;

    return (
      <div className="timelineSelectionOverlay">
        <div
          className="timelineSelectionDimmerBefore"
          style={{ width: `${beforeWidth}px` }}
        />
        <div className="timelineSelectionOverlayWrapper">
          <div
            className="timelineSelectionGrippy"
            style={{ width: `${selectionWidth}px` }}
          >
            <Draggable
              className="timelineSelectionGrippyRangeStart"
              value={selection}
              onMove={this._rangeStartOnMove}
            />
            <Draggable
              className="timelineSelectionGrippyMoveRange"
              value={selection}
              onMove={this._moveRangeOnMove}
            />
            <Draggable
              className="timelineSelectionGrippyRangeEnd"
              value={selection}
              onMove={this._rangeEndOnMove}
            />
          </div>
          <div className="timelineSelectionOverlayInner">
            <span
              className={classNames('timelineSelectionOverlayRange', {
                hidden: !selection.isModifying,
              })}
            >
              {getFormattedTimeLength(selectionEnd - selectionStart)}
            </span>
            <button
              className={classNames('timelineSelectionOverlayZoomButton', {
                hidden: selection.isModifying,
              })}
              type="button"
              onMouseDown={this._zoomButtonOnMouseDown}
              onClick={this._zoomButtonOnClick}
            />
          </div>
        </div>
        <div className="timelineSelectionDimmerAfter" />
      </div>
    );
  }

  render() {
    const { children, selection } = this.props;
    const { hoverLocation } = this.state;

    return (
      <div
        className="timelineSelection"
        ref={this._containerCreated}
        onMouseDown={this._onMouseDown}
        onMouseMove={this._onMouseMove}
      >
        {children}
        {selection.hasSelection ? this.renderSelectionOverlay(selection) : null}
        <div
          className="timelineSelectionHoverLine"
          style={{
            visibility:
              selection.isModifying || hoverLocation === null
                ? 'hidden'
                : undefined,
            left: hoverLocation === null ? '0' : `${hoverLocation}px`,
          }}
        />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    selection: getProfileViewOptions(state).selection,
    displayRange: getDisplayRange(state),
    zeroAt: getZeroAt(state),
    minSelectionStartWidth: getProfileInterval(state),
  }),
  mapDispatchToProps: {
    updateProfileSelection,
    addRangeFilterAndUnsetSelection,
  },
  component: TimelineRulerAndSelection,
};

export default explicitConnect(options);
