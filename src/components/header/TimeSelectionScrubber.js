/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import PropTypes from 'prop-types';
import TimeRuler from './TimeRuler';
import SelectionScrubberOverlay from './SelectionScrubberOverlay';
import clamp from 'clamp';
import { getContentRect } from '../../utils/css-geometry-tools';
import { withSize } from '../shared/WithSize';

import type { Milliseconds, CssPixels } from '../../types/units';
import type { ProfileSelection } from '../../types/actions';

type MouseHandler = (event: MouseEvent) => void;

type Props = {|
  +className: string,
  +zeroAt: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +minSelectionStartWidth: Milliseconds,
  +selection: ProfileSelection,
  +width: CssPixels,
  +height: CssPixels,
  +onSelectionChange: ProfileSelection => *,
  +onZoomButtonClick: (
    selectionStart: Milliseconds,
    selectionEnd: Milliseconds
  ) => *,
  +children: React.Node,
|};

type State = {|
  hoverLocation: null | CssPixels,
|};

class TimeSelectionScrubberImpl extends React.PureComponent<Props, State> {
  _handlers: ?{
    mouseMoveHandler: MouseHandler,
    mouseUpHandler: MouseHandler,
  };
  _container: ?HTMLElement;

  constructor(props: Props) {
    super(props);
    this.state = {
      hoverLocation: null,
    };
  }

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

    const { rangeStart, rangeEnd, minSelectionStartWidth } = this.props;
    const mouseDownTime =
      (event.pageX - rect.left) / rect.width * (rangeEnd - rangeStart) +
      rangeStart;

    let isRangeSelecting = false;

    const mouseMoveHandler = event => {
      const mouseMoveTime =
        (event.pageX - rect.left) / rect.width * (rangeEnd - rangeStart) +
        rangeStart;
      const selectionStart = clamp(
        Math.min(mouseDownTime, mouseMoveTime),
        rangeStart,
        rangeEnd
      );
      const selectionEnd = clamp(
        Math.max(mouseDownTime, mouseMoveTime),
        rangeStart,
        rangeEnd
      );
      if (
        isRangeSelecting ||
        selectionEnd - selectionStart >= minSelectionStartWidth
      ) {
        isRangeSelecting = true;
        this.props.onSelectionChange({
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
          (event.pageX - rect.left) / rect.width * (rangeEnd - rangeStart) +
          rangeStart;
        const selectionStart = clamp(
          Math.min(mouseDownTime, mouseMoveTime),
          rangeStart,
          rangeEnd
        );
        const selectionEnd = clamp(
          Math.max(mouseDownTime, mouseMoveTime),
          rangeStart,
          rangeEnd
        );
        this.props.onSelectionChange({
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
          (event.pageX - rect.left) / rect.width * (rangeEnd - rangeStart) +
          rangeStart;
        const { selectionStart, selectionEnd } = selection;
        if (mouseUpTime < selectionStart || mouseUpTime >= selectionEnd) {
          // Unset selection.
          this.props.onSelectionChange({
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

  render() {
    const {
      className,
      zeroAt,
      rangeStart,
      rangeEnd,
      children,
      selection,
      width,
      onSelectionChange,
      onZoomButtonClick,
    } = this.props;

    const { hoverLocation } = this.state;

    return (
      <div
        className={className}
        ref={this._containerCreated}
        onMouseDown={this._onMouseDown}
        onMouseMove={this._onMouseMove}
      >
        <TimeRuler
          className={`${className}TimeRuler`}
          zeroAt={zeroAt}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          width={width}
        />
        {children}
        {selection.hasSelection
          ? <SelectionScrubberOverlay
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              selectionStart={selection.selectionStart}
              selectionEnd={selection.selectionEnd}
              isModifying={selection.isModifying}
              width={width}
              onSelectionChange={onSelectionChange}
              onZoomButtonClick={onZoomButtonClick}
            />
          : null}
        <div
          className="timeSelectionScrubberHoverIndicator"
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

TimeSelectionScrubberImpl.propTypes = {
  className: PropTypes.string.isRequired,
  zeroAt: PropTypes.number.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  minSelectionStartWidth: PropTypes.number.isRequired,
  selection: PropTypes.object.isRequired,
  width: PropTypes.number.isRequired,
  onSelectionChange: PropTypes.func,
  onZoomButtonClick: PropTypes.func,
  children: PropTypes.node,
};

const TimeSelectionScrubber = withSize(TimeSelectionScrubberImpl);

export default TimeSelectionScrubber;
