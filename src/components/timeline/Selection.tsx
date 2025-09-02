/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import clamp from 'clamp';
import { getContentRect } from 'firefox-profiler/utils/css-geometry-tools';
import {
  getPreviewSelection,
  getCommittedRange,
  getZeroAt,
  getMouseTimePosition,
  getProfileTimelineUnit,
} from 'firefox-profiler/selectors/profile';
import {
  updatePreviewSelection,
  commitRange,
  changeMouseTimePosition,
} from 'firefox-profiler/actions/profile-view';
import explicitConnect from 'firefox-profiler/utils/connect';
import classNames from 'classnames';
import { Draggable } from 'firefox-profiler/components/shared/Draggable';
import { getFormattedTimelineValue } from 'firefox-profiler/profile-logic/committed-ranges';
import './Selection.css';

import type {
  Milliseconds,
  CssPixels,
  StartEndRange,
  PreviewSelection,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type MouseHandler = (event: MouseEvent) => void;

type OwnProps = {
  readonly width: number;
  readonly children: React.ReactNode;
  readonly className?: string;
};

type StateProps = {
  readonly previewSelection: PreviewSelection | null;
  readonly committedRange: StartEndRange;
  readonly zeroAt: Milliseconds;
  readonly profileTimelineUnit: string;
  readonly mouseTimePosition: Milliseconds | null;
};

type DispatchProps = {
  readonly commitRange: typeof commitRange;
  readonly updatePreviewSelection: typeof updatePreviewSelection;
  readonly changeMouseTimePosition: typeof changeMouseTimePosition;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class TimelineRulerAndSelection extends React.PureComponent<Props> {
  _handlers: {
    mouseMoveHandler: MouseHandler;
    mouseClickHandler: MouseHandler;
  } | null = null;

  _container: HTMLElement | null = null;

  _containerCreated = (element: HTMLElement | null) => {
    this._container = element;
  };

  _onMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    if (
      !this._container ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      // Do not start a selection if the user doesn't press with the left button
      // or if they uses a keyboard modifier. Especially on MacOS ctrl+click can
      // be used to display the context menu.
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

    const { committedRange } = this.props;
    const minSelectionStartWidth: CssPixels = 3;
    const mouseDownX = event.pageX;
    const mouseDownTime =
      ((mouseDownX - rect.left) / rect.width) *
        (committedRange.end - committedRange.start) +
      committedRange.start;

    let isRangeSelecting = false;

    const getSelectionFromEvent = (event: MouseEvent) => {
      const mouseMoveX = event.pageX;
      const mouseMoveTime =
        ((mouseMoveX - rect.left) / rect.width) *
          (committedRange.end - committedRange.start) +
        committedRange.start;
      const selectionStart = clamp(
        Math.min(mouseDownTime, mouseMoveTime),
        committedRange.start,
        committedRange.end
      );
      const selectionEnd = clamp(
        Math.max(mouseDownTime, mouseMoveTime),
        committedRange.start,
        committedRange.end
      );
      return { selectionStart, selectionEnd };
    };

    const mouseMoveHandler = (event: MouseEvent) => {
      const isLeftButtonUsed = (event.buttons & 1) > 0;
      if (!isLeftButtonUsed) {
        // Oops, the mouseMove handler is still registered but the left button
        // isn't pressed, this means we missed the "click" event for some reason.
        // Maybe the user moved the cursor in some place where we didn't get the
        // click event because of Firefox issues such as bug 1755746 and bug 1755498.
        // Let's uninstall the event handlers and stop the selection.
        const { previewSelection } = this.props;
        isRangeSelecting = false;
        this._uninstallMoveAndClickHandlers();

        if (previewSelection) {
          const { selectionStart, selectionEnd } = previewSelection;
          this.props.updatePreviewSelection({
            selectionStart,
            selectionEnd,
            isModifying: false,
          });
        }
        return;
      }

      if (
        isRangeSelecting ||
        Math.abs(event.pageX - mouseDownX) >= minSelectionStartWidth
      ) {
        isRangeSelecting = true;
        const { selectionStart, selectionEnd } = getSelectionFromEvent(event);
        this.props.updatePreviewSelection({
          selectionStart,
          selectionEnd,
          isModifying: true,
        });
      }
    };

    const clickHandler = (event: MouseEvent) => {
      if (isRangeSelecting) {
        // This click ends the current selection gesture.
        const { selectionStart, selectionEnd } = getSelectionFromEvent(event);
        this.props.updatePreviewSelection({
          selectionStart,
          selectionEnd,
          isModifying: false,
        });
        // Stop propagation so that no thread and no call node is selected when
        // creating a preview selection.
        event.stopPropagation();
        this._uninstallMoveAndClickHandlers();
        return;
      }

      // This is a normal click where no selection is currently occurring (but
      // there may be one from a previous selection operation).

      const { previewSelection } = this.props;
      if (previewSelection) {
        // There's a selection.
        // Dismiss it but only if the click is outside the current selection.
        const clickTime =
          ((event.pageX - rect.left) / rect.width) *
            (committedRange.end - committedRange.start) +
          committedRange.start;
        const { selectionStart, selectionEnd } = previewSelection;
        if (clickTime < selectionStart || clickTime >= selectionEnd) {
          // Stop propagation so that no thread and no call node is selected
          // when removing the preview selections.
          event.stopPropagation();

          // Unset preview selection.
          this.props.updatePreviewSelection(null);
        }
      }

      // Do not stopPropagation(), so that underlying graphs get the click event.
      // In all cases, remove the event handlers.
      this._uninstallMoveAndClickHandlers();
    };

    this._installMoveAndClickHandlers(mouseMoveHandler, clickHandler);
  };

  _installMoveAndClickHandlers(
    mouseMoveHandler: MouseHandler,
    mouseClickHandler: MouseHandler
  ) {
    // Unregister any leftover old handlers, in case we didn't get a click for the previous
    // drag (e.g. when tab switching during a drag, or when ctrl+clicking on macOS).
    this._uninstallMoveAndClickHandlers();

    this._handlers = { mouseMoveHandler, mouseClickHandler };
    window.addEventListener('mousemove', mouseMoveHandler, true);
    window.addEventListener('click', mouseClickHandler, true);
  }

  _uninstallMoveAndClickHandlers() {
    if (this._handlers) {
      const { mouseMoveHandler, mouseClickHandler } = this._handlers;
      window.removeEventListener('mousemove', mouseMoveHandler, true);
      window.removeEventListener('click', mouseClickHandler, true);
      this._handlers = null;
    }
  }

  _onMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    if (!this._container) {
      return;
    }
    const { width, committedRange, changeMouseTimePosition } = this.props;
    if (width === 0) {
      // This can happen when hovering before the profile is fully loaded.
      return;
    }

    const rect = getContentRect(this._container);
    if (
      event.pageX < rect.left ||
      event.pageX >= rect.right ||
      event.pageY < rect.top ||
      event.pageY >= rect.bottom
    ) {
      changeMouseTimePosition(null);
    } else {
      const hoverPositionInPixels = event.pageX - rect.left;
      const pixelsToMouseTimePosition =
        ((committedRange.end - committedRange.start) * hoverPositionInPixels) /
          width +
        committedRange.start;
      changeMouseTimePosition(pixelsToMouseTimePosition);
    }
  };

  _onMouseLeave = () => {
    this.props.changeMouseTimePosition(null);
  };

  _makeOnMove = (
    fun: (dx: number) => { startDelta: number; endDelta: number }
  ) => {
    return (
      originalSelection: PreviewSelection,
      dx: number,
      _dy: number,
      isModifying: boolean
    ) => {
      this._onMove(originalSelection, fun, dx, isModifying);
    };
  };

  _onMove(
    originalSelection: PreviewSelection,
    selectionDeltasForDx: (dx: number) => {
      startDelta: number;
      endDelta: number;
    },
    dx: number,
    isModifying: boolean
  ) {
    const { committedRange, width, updatePreviewSelection } = this.props;
    const delta = (dx / width) * (committedRange.end - committedRange.start);
    const selectionDeltas = selectionDeltasForDx(delta);
    let selectionStart = clamp(
      originalSelection.selectionStart + selectionDeltas.startDelta,
      committedRange.start,
      committedRange.end
    );
    let selectionEnd = clamp(
      originalSelection.selectionEnd + selectionDeltas.endDelta,
      committedRange.start,
      committedRange.end
    );
    let draggingStart = isModifying && !!selectionDeltas.startDelta;
    let draggingEnd = isModifying && !!selectionDeltas.endDelta;
    if (selectionStart > selectionEnd) {
      [selectionStart, selectionEnd] = [selectionEnd, selectionStart];
      [draggingStart, draggingEnd] = [draggingEnd, draggingStart];
    }
    updatePreviewSelection({
      isModifying,
      selectionStart,
      selectionEnd,
      draggingStart,
      draggingEnd,
    });
  }

  _rangeStartOnMove = this._makeOnMove((delta) => ({
    startDelta: delta,
    endDelta: 0,
  }));

  _moveRangeOnMove = this._makeOnMove((delta) => ({
    startDelta: delta,
    endDelta: delta,
  }));

  _rangeEndOnMove = this._makeOnMove((delta) => ({
    startDelta: 0,
    endDelta: delta,
  }));

  _zoomButtonOnMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
  };

  _zoomButtonOnClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const { previewSelection, zeroAt, commitRange } = this.props;
    if (previewSelection) {
      commitRange(
        previewSelection.selectionStart - zeroAt,
        previewSelection.selectionEnd - zeroAt
      );
    }
  };

  renderSelectionOverlay(previewSelection: PreviewSelection) {
    const { committedRange, width, profileTimelineUnit } = this.props;
    const { selectionStart, selectionEnd } = previewSelection;

    if (!Number.isFinite(selectionStart) || !Number.isFinite(selectionEnd)) {
      // Do not render the selection overlay if there is no data to display in
      // the timeline. This prevents a crash on range selection if the profile
      // is completely empty.
      return null;
    }

    const beforeWidth =
      ((selectionStart - committedRange.start) /
        (committedRange.end - committedRange.start)) *
      width;
    const selectionWidth =
      ((selectionEnd - selectionStart) /
        (committedRange.end - committedRange.start)) *
      width;

    return (
      <div className="timelineSelectionOverlay">
        <div
          className="timelineSelectionDimmerBefore"
          style={{ width: `${beforeWidth}px` }}
        />
        <div className="timelineSelectionOverlayWrapper">
          <div
            className={classNames('timelineSelectionGrippy', {
              draggingStart: previewSelection.draggingStart,
              draggingEnd: previewSelection.draggingEnd,
            })}
            style={{ width: `${selectionWidth}px` }}
          >
            <Draggable
              className="timelineSelectionGrippyRangeStart"
              value={previewSelection}
              onMove={this._rangeStartOnMove}
            />
            <Draggable
              className="timelineSelectionGrippyMoveRange"
              value={previewSelection}
              onMove={this._moveRangeOnMove}
            />
            <Draggable
              className="timelineSelectionGrippyRangeEnd"
              value={previewSelection}
              onMove={this._rangeEndOnMove}
            />
          </div>
          <div className="timelineSelectionOverlayInner">
            <span
              className={classNames('timelineSelectionOverlayRange', {
                hidden: !previewSelection.isModifying,
              })}
            >
              {getFormattedTimelineValue(
                selectionEnd - selectionStart,
                profileTimelineUnit
              )}
            </span>
            <button
              className={classNames('timelineSelectionOverlayZoomButton', {
                hidden: previewSelection.isModifying,
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

  override render() {
    const {
      children,
      previewSelection,
      className,
      mouseTimePosition,
      width,
      committedRange,
      zeroAt,
      profileTimelineUnit,
    } = this.props;

    let hoverLocation = null;

    if (mouseTimePosition !== null) {
      // If the mouseTimePosition exists, convert it to CssPixels.
      hoverLocation =
        (width * (mouseTimePosition - committedRange.start)) /
        (committedRange.end - committedRange.start);
    }

    let mousePosTimestamp = null;
    if (mouseTimePosition !== null && Number.isFinite(mouseTimePosition)) {
      // Only compute and display the timestamp when there is a mouse position
      // and the position is not NaN or Infinity which is the case when there
      // is no data in the timeline.
      mousePosTimestamp = getFormattedTimelineValue(
        mouseTimePosition - zeroAt,
        profileTimelineUnit,
        (committedRange.end - committedRange.start) / width
      );
    }

    return (
      <div
        className={classNames('timelineSelection', className)}
        ref={this._containerCreated}
        onMouseDown={this._onMouseDown}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        {children}
        {previewSelection
          ? this.renderSelectionOverlay(previewSelection)
          : null}
        <div
          className="timelineSelectionHoverLine"
          style={{
            visibility:
              previewSelection?.isModifying ||
              hoverLocation === null ||
              isNaN(hoverLocation)
                ? 'hidden'
                : undefined,
            left: hoverLocation === null ? '0' : `${hoverLocation}px`,
          }}
        >
          <span className="timelineSelectionOverlayTime">
            {mousePosTimestamp}
          </span>
        </div>
      </div>
    );
  }
}

export const TimelineSelection = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    previewSelection: getPreviewSelection(state),
    committedRange: getCommittedRange(state),
    zeroAt: getZeroAt(state),
    profileTimelineUnit: getProfileTimelineUnit(state),
    mouseTimePosition: getMouseTimePosition(state),
  }),
  mapDispatchToProps: {
    updatePreviewSelection,
    commitRange,
    changeMouseTimePosition,
  },
  component: TimelineRulerAndSelection,
});
