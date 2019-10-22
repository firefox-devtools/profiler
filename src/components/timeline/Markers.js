/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import classNames from 'classnames';
import { timeCode } from '../../utils/time-code';
import { withSize } from '../shared/WithSize';
import Tooltip from '../tooltip/Tooltip';
import { TooltipMarker } from '../tooltip/Marker';
import { markerStyles, overlayFills } from '../../profile-logic/marker-styles';
import explicitConnect from '../../utils/connect';
import { getPreviewSelection } from '../../selectors/profile';
import { getThreadSelectors } from '../../selectors/per-thread';
import { getSelectedThreadIndex } from '../../selectors/url-state';
import './Markers.css';

import type { Milliseconds, CssPixels } from '../../types/units';
import type { Marker, MarkerIndex } from '../../types/profile-derived';
import type { SizeProps } from '../shared/WithSize';
import type { ConnectedProps } from '../../utils/connect';
import type { ThreadIndex } from '../../types/profile';

// Exported for tests.
export const MIN_MARKER_WIDTH = 0.3;

type MarkerState = 'PRESSED' | 'HOVERED' | 'NONE';

/**
 * The TimelineMarkers component is built up of several nested components,
 * and they are all collected in this file. In pseudo-code, they take
 * the following forms:
 *
 * export const TimelineMarkersJank = (
 *  <Connect markers={JankMarkers}>
 *    <WithSize>
 *      <TimelineMarkers />
 *    </WithSize>
 *  </Connect>
 * );
 *
 * export const TimelineMarkersOverview = (
 *   <Connect markers={AllMarkers}>
 *     <WithSize>
 *       <TimelineMarkers />
 *     </WithSize>
 *   </Connect>
 * );
 */

export type OwnProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +threadIndex: ThreadIndex,
  +onSelect: any,
|};

export type StateProps = {|
  +additionalClassName?: ?string,
  +getMarker: MarkerIndex => Marker,
  +markerIndexes: MarkerIndex[],
  +isSelected: boolean,
  +isModifyingSelection: boolean,
  +testId: string,
|};

type Props = {|
  ...ConnectedProps<OwnProps, StateProps, {||}>,
  ...SizeProps,
|};

type State = {
  hoveredItem: Marker | null,
  mouseDownItem: Marker | null,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

class TimelineMarkersImplementation extends React.PureComponent<Props, State> {
  _canvas: HTMLCanvasElement | null = null;
  _requestedAnimationFrame: boolean = false;
  state = {
    hoveredItem: null,
    mouseDownItem: null,
    mouseX: 0,
    mouseY: 0,
  };

  _takeCanvasRef = (c: HTMLCanvasElement | null) => {
    this._canvas = c;
  };

  _scheduleDraw() {
    window.requestAnimationFrame(() => {
      const c = this._canvas;
      if (c) {
        timeCode('TimelineMarkersImplementation render', () => {
          this.drawCanvas(c);
        });
      }
    });
  }

  _hitTest(e): Marker | null {
    const c = this._canvas;
    if (c === null) {
      return null;
    }

    const r = c.getBoundingClientRect();
    const {
      width,
      rangeStart,
      rangeEnd,
      getMarker,
      markerIndexes,
    } = this.props;
    const x = e.pageX - r.left;
    const y = e.pageY - r.top;
    const rangeLength = rangeEnd - rangeStart;
    const time = rangeStart + (x / width) * rangeLength;
    const onePixelTime = (rangeLength / width) * window.devicePixelRatio;

    // Markers are drawn in array order; the one drawn last is on top. So if
    // there are multiple markers under the mouse, we want to find the one
    // with the highest array index. So we walk the list of markers
    // from high index to low index, which is front to back in z-order.
    for (let i = markerIndexes.length - 1; i >= 0; i--) {
      const markerIndex = markerIndexes[i];
      const marker = getMarker(markerIndex);
      const { start, dur, name } = marker;
      const duration = Math.max(dur, onePixelTime);
      if (time < start || time >= start + duration) {
        continue;
      }
      const markerStyle =
        name in markerStyles ? markerStyles[name] : markerStyles.default;
      if (y >= markerStyle.top && y < markerStyle.top + markerStyle.height) {
        return marker;
      }
    }
    return null;
  }

  _onMouseMove = (event: SyntheticMouseEvent<>) => {
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
  };

  _onMouseDown = e => {
    const mouseDownItem = this._hitTest(e);
    this.setState({ mouseDownItem });
    if (mouseDownItem !== null) {
      if (e.target.setCapture) {
        e.target.setCapture();
      }
      e.stopPropagation();
    }
  };

  _onMouseUp = e => {
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
  };

  _onMouseOut = () => {
    this.setState({
      hoveredItem: null,
    });
  };

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (
      prevProps !== this.props ||
      prevState.hoveredItem !== this.state.hoveredItem ||
      prevState.mouseDownItem !== this.state.mouseDownItem
    ) {
      this._scheduleDraw();
    }
  }

  render() {
    const {
      additionalClassName,
      isSelected,
      isModifyingSelection,
      threadIndex,
      testId,
    } = this.props;

    const { mouseDownItem, hoveredItem, mouseX, mouseY } = this.state;
    const shouldShowTooltip = !isModifyingSelection && !mouseDownItem;

    return (
      <div
        data-testid={testId}
        className={classNames(
          'timelineMarkers',
          additionalClassName,
          isSelected ? 'selected' : null
        )}
      >
        <canvas
          className="timelineMarkersCanvas"
          ref={this._takeCanvasRef}
          onMouseDown={this._onMouseDown}
          onMouseMove={this._onMouseMove}
          onMouseUp={this._onMouseUp}
          onMouseOut={this._onMouseOut}
        />
        {shouldShowTooltip && hoveredItem ? (
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            <TooltipMarker marker={hoveredItem} threadIndex={threadIndex} />
          </Tooltip>
        ) : null}
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
      getMarker,
      markerIndexes,
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

    let previousPos = null;
    for (const markerIndex of markerIndexes) {
      const marker = getMarker(markerIndex);
      const { start, dur, name } = marker;
      let pos = ((start - rangeStart) / (rangeEnd - rangeStart)) * width;
      pos = Math.round(pos * devicePixelRatio) / devicePixelRatio;

      if (previousPos === pos && dur === 0) {
        // This position has already been drawn, let's move to the next marker!
        continue;
      }
      previousPos = pos;
      const itemWidth = Number.isFinite(dur)
        ? Math.max(
            (dur / (rangeEnd - rangeStart)) * width,
            MIN_MARKER_WIDTH / devicePixelRatio
          )
        : Number.MAX_SAFE_INTEGER;
      const markerStyle =
        name in markerStyles ? markerStyles[name] : markerStyles.default;
      ctx.fillStyle = markerStyle.background;
      if (markerStyle.squareCorners) {
        ctx.fillRect(pos, markerStyle.top, itemWidth, markerStyle.height);
      } else {
        this._drawRoundedRect(
          ctx,
          pos,
          markerStyle.top,
          itemWidth,
          markerStyle.height,
          1 / devicePixelRatio
        );
      }
      if (markerStyle.borderLeft !== null) {
        ctx.fillStyle = markerStyle.borderLeft;
        ctx.fillRect(pos, markerStyle.top, 1, markerStyle.height);
      }
      if (markerStyle.borderRight !== null) {
        ctx.fillStyle = markerStyle.borderRight;
        ctx.fillRect(
          pos + itemWidth - 1,
          markerStyle.top,
          1,
          markerStyle.height
        );
      }
      const markerState = this._getMarkerState(marker);
      if (markerState === 'HOVERED' || markerState === 'PRESSED') {
        ctx.fillStyle = overlayFills[markerState];
        if (markerStyle.squareCorners) {
          ctx.fillRect(pos, markerStyle.top, itemWidth, markerStyle.height);
        } else {
          this._drawRoundedRect(
            ctx,
            pos,
            markerStyle.top,
            itemWidth,
            markerStyle.height,
            1 / devicePixelRatio
          );
        }
      }
    }
    ctx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
  }

  _getMarkerState(marker: Marker): MarkerState {
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

/**
 * Combine the base implementation of the TimelineMarkers with the
 * WithSize component.
 */
export const TimelineMarkers = withSize<Props>(TimelineMarkersImplementation);

/**
 * Create a special connected component for Jank instances.
 */
export const TimelineMarkersJank = explicitConnect<OwnProps, StateProps, {||}>({
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = getThreadSelectors(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);

    return {
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes: selectors.getJankMarkerIndexesForHeader(state),
      isSelected: threadIndex === selectedThread,
      isModifyingSelection: getPreviewSelection(state).isModifying,
      testId: 'TimelineMarkersJank',
    };
  },
  component: TimelineMarkers,
});

/**
 * Create a connected component for all markers.
 */
export const TimelineMarkersOverview = explicitConnect<
  OwnProps,
  StateProps,
  {||}
>({
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = getThreadSelectors(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);
    const markerIndexes = selectors.getCommittedRangeFilteredMarkerIndexesForHeader(
      state
    );
    return {
      additionalClassName:
        selectors.getThread(state).name === 'GeckoMain'
          ? 'timelineMarkersGeckoMain'
          : null,
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes,
      isSelected: threadIndex === selectedThread,
      isModifyingSelection: getPreviewSelection(state).isModifying,
      testId: 'TimelineMarkersOverview',
    };
  },
  component: TimelineMarkers,
});

/**
 * FileIO is an optional marker type. Only add these markers if they exist.
 */
export const TimelineMarkersFileIo = explicitConnect<
  OwnProps,
  StateProps,
  {||}
>({
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = getThreadSelectors(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);

    return {
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes: selectors.getFileIoMarkerIndexes(state),
      isSelected: threadIndex === selectedThread,
      isModifyingSelection: getPreviewSelection(state).isModifying,
      testId: 'TimelineMarkersFileIo',
    };
  },
  component: TimelineMarkers,
});

/**
 * Create a component for memory-related markers.
 */
export const TimelineMarkersMemory = explicitConnect<
  OwnProps,
  StateProps,
  {||}
>({
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = getThreadSelectors(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);

    return {
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes: selectors.getMemoryMarkerIndexes(state),
      isSelected: threadIndex === selectedThread,
      isModifyingSelection: getPreviewSelection(state).isModifying,
      additionalClassName: 'timelineMarkersMemory',
      testId: 'TimelineMarkersMemory',
    };
  },
  component: TimelineMarkers,
});

/**
 * Create a component for IPC-related markers.
 */
export const TimelineMarkersIPC = explicitConnect<OwnProps, StateProps, {||}>({
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = getThreadSelectors(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);

    return {
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes: selectors.getIPCMarkerIndexes(state),
      isSelected: threadIndex === selectedThread,
      isModifyingSelection: getPreviewSelection(state).isModifying,
      additionalClassName: 'timelineMarkersIPC',
      testId: 'TimelineMarkersIPC',
    };
  },
  component: TimelineMarkers,
});
