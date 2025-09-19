/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent } from 'react';

import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { TooltipMarker } from 'firefox-profiler/components/tooltip/Marker';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import { ContextMenuTrigger } from 'firefox-profiler/components/shared/ContextMenuTrigger';
import { VerticalIndicators } from './VerticalIndicators';

import {
  getCommittedRange,
  getZeroAt,
  getInnerWindowIDToPageMap,
  getPreviewSelectionIsBeingModified,
} from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  changeRightClickedMarker,
  changeSelectedNetworkMarker,
  changeHoveredMarker,
} from 'firefox-profiler/actions/profile-view';

import {
  TRACK_NETWORK_ROW_HEIGHT,
  TRACK_NETWORK_ROW_REPEAT,
  TRACK_NETWORK_HEIGHT,
} from 'firefox-profiler/app-logic/constants';
import explicitConnect from 'firefox-profiler/utils/connect';
import { bisectionRight } from 'firefox-profiler/utils/bisect';

import type {
  CssPixels,
  ThreadIndex,
  Marker,
  MarkerIndex,
  MarkerTiming,
  Milliseconds,
  InnerWindowID,
  Page,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackNetwork.css';

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly hoveredMarkerIndex: MarkerIndex | null;
  readonly rightClickedMarkerIndex: MarkerIndex | null;
  readonly selectedNetworkMarkerIndex: MarkerIndex | null;
  readonly width: CssPixels;
  readonly networkTiming: MarkerTiming[];
  readonly onHoveredMarkerChange: (
    hoveredMarkerIndex: MarkerIndex | null,
    mouseX?: CssPixels,
    mouseY?: CssPixels
  ) => void;
};

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class NetworkCanvas extends PureComponent<CanvasProps> {
  _requestedAnimationFrame: boolean = false;
  _canvas = React.createRef<HTMLCanvasElement>();

  _hitTest(e: React.MouseEvent<HTMLElement>): MarkerIndex | null {
    const { rangeStart, rangeEnd, networkTiming, width } = this.props;
    // React's Synthetic event doesn't have these properties, but the native event does.
    const { offsetX: x, offsetY: y } = e.nativeEvent;

    const row = Math.floor(y / TRACK_NETWORK_ROW_HEIGHT);
    const rangeLength = rangeEnd - rangeStart;
    const time = rangeStart + (x / width) * rangeLength;
    const minimumSize: CssPixels = 5;
    const minimumDuration: Milliseconds = (minimumSize / width) * rangeLength;

    // Row i matches network timing's rows i, i + TRACK_NETWORK_ROW_REPEAT, i +
    // TRACK_NETWORK_ROW_REPEAT * 2, etc
    // In each of these row, there can be either 0 or 1 marker that contains
    // this time. We want to keep the marker that's the closest to the time, and
    // these 2 variables will help us with that.
    let closestMarkerIndex = null;
    let closestMarkerStart = -Infinity;
    for (let i = row; i < networkTiming.length; i += TRACK_NETWORK_ROW_REPEAT) {
      const timingRow = networkTiming[i];

      // Bisection returns the index where we would insert the element.
      // Therefore the previous index is where the closest smaller start is,
      // that's the only one in this row that could contain this time.
      const indexInRow = bisectionRight(timingRow.start, time) - 1;

      if (indexInRow < 0) {
        // All markers on this row are after this time.
        continue;
      }

      const start = timingRow.start[indexInRow];
      let end = timingRow.end[indexInRow];

      // Make it possible to hit the small markers.
      if (end - start < minimumDuration) {
        end = start + minimumDuration;
      }

      if (end < time) {
        // The marker we found ends before this time.
        continue;
      }

      if (start > closestMarkerStart) {
        closestMarkerStart = start;
        closestMarkerIndex = timingRow.index[indexInRow];
      }
    }

    return closestMarkerIndex;
  }

  _onMouseLeave = () => {
    this.props.onHoveredMarkerChange(null);
  };

  _onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const hoveredMarkerIndex = this._hitTest(e);
    this.props.onHoveredMarkerChange(hoveredMarkerIndex, e.pageX, e.pageY);
  };

  _scheduleDraw() {
    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        const canvas = this._canvas.current;
        if (canvas) {
          this.drawCanvas(canvas);
        }
      });
    }
  }

  drawCanvas(canvas: HTMLCanvasElement) {
    const {
      rangeStart,
      rangeEnd,
      networkTiming,
      hoveredMarkerIndex,
      rightClickedMarkerIndex,
      selectedNetworkMarkerIndex,
      width: containerWidth,
    } = this.props;

    const NORMAL_STYLE = 'rgba(0, 127, 255, 0.3)';
    const HOVERED_STYLE = '#0069aa';
    const rangeLength = rangeEnd - rangeStart;

    const devicePixelRatio = window.devicePixelRatio;
    const rowHeight = TRACK_NETWORK_ROW_HEIGHT * devicePixelRatio;
    canvas.width = Math.round(containerWidth * devicePixelRatio);
    canvas.height = Math.round(TRACK_NETWORK_HEIGHT * devicePixelRatio);
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = NORMAL_STYLE;

    ctx.lineCap = 'round';
    ctx.lineWidth = rowHeight * 0.75;

    let hoveredPath = null;
    let rightClickedPath = null;
    let selectedPath = null;
    for (let rowIndex = 0; rowIndex < networkTiming.length; rowIndex++) {
      const timing = networkTiming[rowIndex];
      for (let timingIndex = 0; timingIndex < timing.length; timingIndex++) {
        const start =
          (canvas.width / rangeLength) *
          (timing.start[timingIndex] - rangeStart);
        const end =
          (canvas.width / rangeLength) * (timing.end[timingIndex] - rangeStart);
        const y =
          (rowIndex % TRACK_NETWORK_ROW_REPEAT) * rowHeight + rowHeight * 0.5;
        const path = new Path2D();
        path.moveTo(start, y);
        path.lineTo(end, y);

        // For the general case, we draw the path right away.
        // But in specific cases (hovered, selected, right clicked), we save the
        // path so that we draw it at the end, on top of everything else, with a
        // different color.
        const thisMarkerIndex = timing.index[timingIndex];
        switch (thisMarkerIndex) {
          // This is in descending precedence order.
          case rightClickedMarkerIndex:
            rightClickedPath = path;
            break;
          case hoveredMarkerIndex:
            hoveredPath = path;
            break;
          case selectedNetworkMarkerIndex:
            selectedPath = path;
            break;
          default:
            ctx.stroke(path);
        }
      }
    }

    if (hoveredPath || rightClickedPath || selectedPath) {
      ctx.strokeStyle = HOVERED_STYLE;
      if (hoveredPath) {
        ctx.stroke(hoveredPath);
      }

      if (rightClickedPath) {
        ctx.stroke(rightClickedPath);
      }

      if (selectedPath) {
        ctx.stroke(selectedPath);
      }
    }
  }

  override render() {
    this._scheduleDraw();
    return (
      <canvas
        className="timelineTrackNetworkCanvas"
        ref={this._canvas}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      />
    );
  }
}

type OwnProps = {
  readonly threadIndex: ThreadIndex;
};

type StateProps = {
  readonly innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly isModifyingSelection: boolean;
  readonly zeroAt: Milliseconds;
  readonly getMarker: (param: MarkerIndex) => Marker;
  readonly networkTiming: MarkerTiming[];
  readonly verticalMarkerIndexes: MarkerIndex[];
  readonly rightClickedMarkerIndex: MarkerIndex | null;
  readonly selectedNetworkMarkerIndex: MarkerIndex | null;
  readonly hoveredMarkerIndexFromState: MarkerIndex | null;
};

type DispatchProps = {
  changeRightClickedMarker: typeof changeRightClickedMarker;
  changeSelectedNetworkMarker: typeof changeSelectedNetworkMarker;
  changeHoveredMarker: typeof changeHoveredMarker;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps> & SizeProps;

type State = {
  readonly hoveredMarkerIndex: MarkerIndex | null;
  readonly mouseX: CssPixels;
  readonly mouseY: CssPixels;
};

class Network extends PureComponent<Props, State> {
  override state: State = { hoveredMarkerIndex: null, mouseX: 0, mouseY: 0 };

  _onHoveredMarkerChange = (
    hoveredMarkerIndex: MarkerIndex | null,
    mouseX?: CssPixels,
    mouseY?: CssPixels
  ) => {
    const { threadIndex, changeHoveredMarker } = this.props;
    changeHoveredMarker(threadIndex, hoveredMarkerIndex);
    if (hoveredMarkerIndex === null) {
      if (!window.persistTooltips) {
        // This persistTooltips property is part of the web console API. It helps
        // in being able to inspect and debug tooltips.
        this.setState({
          hoveredMarkerIndex: null,
        });
      }
    } else {
      this.setState({
        hoveredMarkerIndex,
        mouseX: mouseX ?? 0,
        mouseY: mouseY ?? 0,
      });
    }
  };

  _onMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    if (e.button === 2) {
      // The right button is a contextual action. It is important that we call
      // the right click callback at mousedown so that the state is updated and
      // the context menus are rendered before the mouseup/contextmenu events.
      this._onRightClick();
    } else {
      this._onLeftClick();
    }
  };

  _onRightClick = () => {
    const { threadIndex, changeRightClickedMarker } = this.props;
    const { hoveredMarkerIndex } = this.state;
    changeRightClickedMarker(threadIndex, hoveredMarkerIndex);
  };

  _onLeftClick = () => {
    const { threadIndex, changeSelectedNetworkMarker } = this.props;
    const { hoveredMarkerIndex } = this.state;
    if (hoveredMarkerIndex !== null) {
      changeSelectedNetworkMarker(threadIndex, hoveredMarkerIndex);
    }
  };

  _onVerticalIndicatorRightClick = (markerIndex: MarkerIndex) => {
    const { threadIndex, changeRightClickedMarker } = this.props;
    changeRightClickedMarker(threadIndex, markerIndex);
  };

  override render() {
    const {
      innerWindowIDToPageMap,
      rangeStart,
      rangeEnd,
      getMarker,
      verticalMarkerIndexes,
      zeroAt,
      networkTiming,
      isModifyingSelection,
      threadIndex,
      width: containerWidth,
      rightClickedMarkerIndex,
      selectedNetworkMarkerIndex,
      hoveredMarkerIndexFromState,
    } = this.props;
    const { hoveredMarkerIndex, mouseX, mouseY } = this.state;
    const hoveredMarker =
      hoveredMarkerIndex === null ? null : getMarker(hoveredMarkerIndex);

    // This is used for the tooltips of the network markers, but not for the
    // vertical indicators. Indeed the vertical indicators tooltips are useful
    // when the user changes the selection.
    const shouldShowTooltip =
      !isModifyingSelection && rightClickedMarkerIndex === null;

    return (
      <div
        className="timelineTrackNetwork"
        style={{
          height: TRACK_NETWORK_HEIGHT,
        }}
        onMouseDown={this._onMouseDown}
      >
        <ContextMenuTrigger
          id="MarkerContextMenu"
          disable={
            hoveredMarkerIndex === null && rightClickedMarkerIndex === null
          }
          attributes={{
            className: 'treeViewContextMenu',
          }}
        >
          <NetworkCanvas
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            networkTiming={networkTiming}
            hoveredMarkerIndex={
              hoveredMarkerIndex === null
                ? hoveredMarkerIndexFromState
                : hoveredMarkerIndex
            }
            rightClickedMarkerIndex={rightClickedMarkerIndex}
            selectedNetworkMarkerIndex={selectedNetworkMarkerIndex}
            width={containerWidth}
            onHoveredMarkerChange={this._onHoveredMarkerChange}
          />
          <VerticalIndicators
            verticalMarkerIndexes={verticalMarkerIndexes}
            getMarker={getMarker}
            innerWindowIDToPageMap={innerWindowIDToPageMap}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            zeroAt={zeroAt}
            width={containerWidth}
            onRightClick={this._onVerticalIndicatorRightClick}
            shouldShowTooltip={rightClickedMarkerIndex === null}
          />
          {shouldShowTooltip && hoveredMarkerIndex !== null && hoveredMarker ? (
            <Tooltip mouseX={mouseX} mouseY={mouseY}>
              <TooltipMarker
                className="tooltipNetwork"
                markerIndex={hoveredMarkerIndex}
                marker={hoveredMarker}
                threadsKey={threadIndex}
                restrictHeightWidth={true}
              />
            </Tooltip>
          ) : null}
        </ContextMenuTrigger>
      </div>
    );
  }
}

export const TrackNetwork = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => {
    const { threadIndex } = ownProps;
    const selectors = getThreadSelectors(threadIndex);
    const { start, end } = getCommittedRange(state);
    const networkTiming = selectors.getNetworkTrackTiming(state);
    return {
      getMarker: selectors.getMarkerGetter(state),
      innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
      networkTiming: networkTiming,
      rangeStart: start,
      rangeEnd: end,
      zeroAt: getZeroAt(state),
      isModifyingSelection: getPreviewSelectionIsBeingModified(state),
      verticalMarkerIndexes: selectors.getTimelineVerticalMarkerIndexes(state),
      rightClickedMarkerIndex: selectors.getRightClickedMarkerIndex(state),
      selectedNetworkMarkerIndex:
        selectors.getSelectedNetworkMarkerIndex(state),
      hoveredMarkerIndexFromState: selectors.getHoveredMarkerIndex(state),
    };
  },
  mapDispatchToProps: {
    changeRightClickedMarker,
    changeSelectedNetworkMarker,
    changeHoveredMarker,
  },
  component: withSize(Network),
});
