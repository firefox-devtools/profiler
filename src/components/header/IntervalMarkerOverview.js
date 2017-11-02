/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { timeCode } from '../../utils/time-code';
import { withSize } from '../shared/WithSize';
import Tooltip from '../shared/Tooltip';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';

import type { Milliseconds, CssPixels } from '../../types/units';
import type { TracingMarker } from '../../types/profile-derived';

type MarkerState = 'PRESSED' | 'HOVERED' | 'NONE';

type Props = {
  className: string,
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  intervalMarkers: TracingMarker[],
  width: number,
  threadIndex: number,
  threadName: string,
  onSelect: any,
  styles: any,
  isSelected: boolean,
  isModifyingSelection: boolean,
  overlayFills: {
    HOVERED: string,
    PRESSED: string,
  },
};

type State = {
  hoveredItem: TracingMarker | null,
  mouseDownItem: TracingMarker | null,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

class IntervalMarkerOverview extends PureComponent<Props, State> {
  _canvas: HTMLCanvasElement | null;
  _requestedAnimationFrame: boolean | null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hoveredItem: null,
      mouseDownItem: null,
      mouseX: 0,
      mouseY: 0,
    };
    (this: any)._onMouseDown = this._onMouseDown.bind(this);
    (this: any)._onMouseMove = this._onMouseMove.bind(this);
    (this: any)._onMouseUp = this._onMouseUp.bind(this);
    (this: any)._onMouseOut = this._onMouseOut.bind(this);
    (this: any)._takeCanvasRef = this._takeCanvasRef.bind(this);
    this._canvas = null;
  }

  _takeCanvasRef(c: HTMLCanvasElement | null) {
    this._canvas = c;
  }

  _scheduleDraw() {
    window.requestAnimationFrame(() => {
      const c = this._canvas;
      if (c) {
        timeCode('IntervalMarkerTimeline render', () => {
          this.drawCanvas(c);
        });
      }
    });
  }

  _hitTest(e): TracingMarker | null {
    const c = this._canvas;
    if (c === null) {
      return null;
    }

    const r = c.getBoundingClientRect();
    const { width, rangeStart, rangeEnd, intervalMarkers, styles } = this.props;
    const x = e.pageX - r.left;
    const y = e.pageY - r.top;
    const time = rangeStart + x / width * (rangeEnd - rangeStart);

    // Markers are drawn in array order; the one drawn last is on top. So if
    // there are multiple markers under the mouse, we want to find the one
    // with the highest array index. So we walk the list of intervalMarkers
    // from high index to low index, which is front to back in z-order.
    for (let i = intervalMarkers.length - 1; i >= 0; i--) {
      const { start, dur, name } = intervalMarkers[i];
      if (time < start || time >= start + dur) {
        continue;
      }
      const style = name in styles ? styles[name] : styles.default;
      if (y >= style.top && y < style.top + style.height) {
        return intervalMarkers[i];
      }
    }
    return null;
  }

  _onMouseMove(event: SyntheticMouseEvent<>) {
    const hoveredItem = this._hitTest(event);
    if (hoveredItem !== null) {
      this.setState({
        hoveredItem,
        mouseX: event.pageX,
        mouseY: event.pageY,
      });
    } else if (this.state.hoveredItem !== null) {
      this.setState({
        hoveredItem: null,
      });
    }
  }

  _onMouseDown(e) {
    const mouseDownItem = this._hitTest(e);
    this.setState({ mouseDownItem });
    if (mouseDownItem !== null) {
      if (e.target.setCapture) {
        e.target.setCapture();
      }
      e.stopPropagation();
    }
  }

  _onMouseUp(e) {
    const { mouseDownItem } = this.state;
    if (mouseDownItem !== null) {
      const mouseUpItem = this._hitTest(e);
      if (
        mouseDownItem === mouseUpItem &&
        mouseUpItem !==
          null /* extra null check because flow doesn't realize it's unnecessary */
      ) {
        const { onSelect, threadIndex } = this.props;
        onSelect(
          threadIndex,
          mouseUpItem.start,
          mouseUpItem.start + mouseUpItem.dur
        );
      }
      this.setState({
        hoveredItem: mouseUpItem,
        mouseDownItem: null,
      });
    }
  }

  _onMouseOut() {
    this.setState({
      hoveredItem: null,
    });
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (
      prevProps !== this.props ||
      prevState.hoveredItem !== this.state.hoveredItem
    ) {
      this._scheduleDraw();
    }
  }

  render() {
    const {
      className,
      isSelected,
      isModifyingSelection,
      threadName,
    } = this.props;

    const { mouseDownItem, hoveredItem, mouseX, mouseY } = this.state;
    const shouldShowTooltip = !isModifyingSelection && !mouseDownItem;
    const canvasClassName = className
      .split(' ')
      .map(name => `${name}Canvas`)
      .join(' ');

    return (
      <div className={classNames(className, isSelected ? 'selected' : null)}>
        <canvas
          className={classNames(
            canvasClassName,
            'intervalMarkerTimelineCanvas'
          )}
          ref={this._takeCanvasRef}
          onMouseDown={this._onMouseDown}
          onMouseMove={this._onMouseMove}
          onMouseUp={this._onMouseUp}
          onMouseOut={this._onMouseOut}
        />
        {shouldShowTooltip && hoveredItem
          ? <Tooltip mouseX={mouseX} mouseY={mouseY}>
              <MarkerTooltipContents
                marker={hoveredItem}
                threadName={threadName}
              />
            </Tooltip>
          : null}
      </div>
    );
  }

  _drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: CssPixels,
    y: CssPixels,
    width: CssPixels,
    height: CssPixels,
    cornerSize: CssPixels
  ) {
    // Cut out c x c -sized squares in the corners.
    const c = Math.min(width / 2, Math.min(height / 2, cornerSize));
    const bottom = y + height;
    ctx.fillRect(x + c, y, width - 2 * c, c);
    ctx.fillRect(x, y + c, width, height - 2 * c);
    ctx.fillRect(x + c, bottom - c, width - 2 * c, c);
  }

  drawCanvas(c: HTMLCanvasElement) {
    const {
      rangeStart,
      rangeEnd,
      width,
      intervalMarkers,
      styles,
      overlayFills,
    } = this.props;

    const devicePixelRatio = c.ownerDocument
      ? c.ownerDocument.defaultView.devicePixelRatio
      : 1;
    const height = c.getBoundingClientRect().height;
    const pixelWidth = Math.round(width * devicePixelRatio);
    const pixelHeight = Math.round(height * devicePixelRatio);

    if (c.width !== pixelWidth || c.height !== pixelHeight) {
      c.width = pixelWidth;
      c.height = pixelHeight;
    }
    const ctx = c.getContext('2d');
    if (ctx === null || ctx === undefined) {
      return;
    }

    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.scale(devicePixelRatio, devicePixelRatio);

    intervalMarkers.forEach(marker => {
      const { start, dur, name } = marker;
      const pos = (start - rangeStart) / (rangeEnd - rangeStart) * width;
      const itemWidth = dur / (rangeEnd - rangeStart) * width;
      const style = name in styles ? styles[name] : styles.default;
      ctx.fillStyle = style.background;
      if (style.squareCorners) {
        ctx.fillRect(pos, style.top, itemWidth, style.height);
      } else {
        this._drawRoundedRect(
          ctx,
          pos,
          style.top,
          itemWidth,
          style.height,
          1 / devicePixelRatio
        );
      }
      if (style.borderLeft !== null) {
        ctx.fillStyle = style.borderLeft;
        ctx.fillRect(pos, style.top, 1, style.height);
      }
      if (style.borderRight !== null) {
        ctx.fillStyle = style.borderRight;
        ctx.fillRect(pos + itemWidth - 1, style.top, 1, style.height);
      }
      const markerState = this._getMarkerState(marker);
      if (markerState === 'HOVERED' || markerState === 'PRESSED') {
        ctx.fillStyle = overlayFills[markerState];
        if (style.squareCorners) {
          ctx.fillRect(pos, style.top, itemWidth, style.height);
        } else {
          this._drawRoundedRect(
            ctx,
            pos,
            style.top,
            itemWidth,
            style.height,
            1 / devicePixelRatio
          );
        }
      }
    });
    ctx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
  }

  _getMarkerState(marker): MarkerState {
    const { hoveredItem, mouseDownItem } = this.state;
    if (mouseDownItem !== null) {
      if (marker === mouseDownItem && marker === hoveredItem) {
        return 'PRESSED';
      }
      return 'NONE';
    }
    if (marker === hoveredItem) {
      return 'HOVERED';
    }
    return 'NONE';
  }
}

export default withSize(IntervalMarkerOverview);
