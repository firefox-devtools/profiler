/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import classNames from 'classnames';
import memoize from 'memoize-immutable';
import { InView } from 'react-intersection-observer';
import {
  overlayFills,
  getMarkerStyle,
} from 'firefox-profiler/profile-logic/marker-styles';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { TooltipMarker } from 'firefox-profiler/components/tooltip/Marker';
import { timeCode } from 'firefox-profiler/utils/time-code';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getPreviewSelection } from 'firefox-profiler/selectors/profile';
import { getThreadSelectorsFromThreadsKey } from 'firefox-profiler/selectors/per-thread';
import { getSelectedThreadIndexes } from 'firefox-profiler/selectors/url-state';
import { changeRightClickedMarker } from 'firefox-profiler/actions/profile-view';
import { ContextMenuTrigger } from 'firefox-profiler/components/shared/ContextMenuTrigger';
import { hasThreadKeys } from 'firefox-profiler/profile-logic/profile-data';
import './Markers.css';

import type {
  Milliseconds,
  CssPixels,
  Marker,
  MarkerIndex,
  ThreadsKey,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import { getStartEndRangeForMarker } from 'firefox-profiler/utils';

// Exported for tests.
export const MIN_MARKER_WIDTH = 0.3;

type MarkerState = 'PRESSED' | 'HOVERED' | 'NONE';

type MouseEventHandler = (SyntheticMouseEvent<HTMLCanvasElement>) => any;

/**
 * When adding properties to these props, please consider the comment above the component.
 */
type CanvasProps = {
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +width: CssPixels,
  +height: CssPixels,
  +getMarker: (MarkerIndex) => Marker,
  +markerIndexes: MarkerIndex[],
  +hoveredMarker: Marker | null,
  +mouseDownMarker: Marker | null,
  +rightClickedMarker: Marker | null,
  +onMouseDown: MouseEventHandler,
  +onMouseUp: MouseEventHandler,
  +onMouseMove: MouseEventHandler,
  +onMouseOut: MouseEventHandler,
};

function _drawRoundedRect(
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

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class TimelineMarkersCanvas extends React.PureComponent<CanvasProps> {
  _canvas: { current: HTMLCanvasElement | null } = React.createRef();
  _requestedAnimationFrame: boolean = false;
  _canvasState: { renderScheduled: boolean, inView: boolean } = {
    renderScheduled: false,
    inView: false,
  };

  _getMarkerState(marker: Marker): MarkerState {
    const { hoveredMarker, mouseDownMarker, rightClickedMarker } = this.props;

    if (rightClickedMarker === marker) {
      return 'PRESSED';
    }
    if (mouseDownMarker !== null) {
      if (marker === mouseDownMarker && marker === hoveredMarker) {
        return 'PRESSED';
      }
      return 'NONE';
    }
    if (marker === hoveredMarker) {
      return 'HOVERED';
    }
    return 'NONE';
  }

  drawCanvas(c: HTMLCanvasElement) {
    const { rangeStart, rangeEnd, width, height, getMarker, markerIndexes } =
      this.props;

    if (height === 0 || width === 0) {
      // bail out early if the size isn't known yet.
      return;
    }

    const devicePixelRatio = c.ownerDocument
      ? c.ownerDocument.defaultView.devicePixelRatio
      : 1;
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
      const { start, end } = marker;
      const dur = end === null ? 0 : end - start;
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
      const markerStyle = getMarkerStyle(marker);
      ctx.fillStyle = markerStyle.background;
      if (markerStyle.squareCorners) {
        ctx.fillRect(pos, markerStyle.top, itemWidth, markerStyle.height);
      } else {
        _drawRoundedRect(
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
          _drawRoundedRect(
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

  _scheduleDraw() {
    if (!this._canvasState.inView) {
      // Canvas is not in the view. Schedule the render for a later intersection
      // observer callback.
      this._canvasState.renderScheduled = true;
      return;
    }

    // Canvas is in the view. Render the canvas and reset the schedule state.
    this._canvasState.renderScheduled = false;

    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        const c = this._canvas.current;
        if (c) {
          timeCode('TimelineMarkersImplementation render', () => {
            this.drawCanvas(c);
          });
        }
      });
    }
  }

  _observerCallback = (inView: boolean, _entry: IntersectionObserverEntry) => {
    this._canvasState.inView = inView;
    if (!this._canvasState.renderScheduled) {
      // Skip if render is not scheduled.
      return;
    }

    this._scheduleDraw();
  };

  componentDidMount() {
    this._scheduleDraw();
  }

  componentDidUpdate() {
    this._scheduleDraw();
  }

  render() {
    return (
      <InView onChange={this._observerCallback}>
        <canvas
          className="timelineMarkersCanvas"
          ref={this._canvas}
          onMouseDown={this.props.onMouseDown}
          onMouseMove={this.props.onMouseMove}
          onMouseUp={this.props.onMouseUp}
          onMouseOut={this.props.onMouseOut}
        />
      </InView>
    );
  }
}

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

export type OwnProps = {
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +threadsKey: ThreadsKey,
  +onSelect: (Milliseconds, Milliseconds) => mixed,
};

export type StateProps = {
  +additionalClassName?: ?string,
  +getMarker: (MarkerIndex) => Marker,
  +markerIndexes: MarkerIndex[],
  +isSelected: boolean,
  +isModifyingSelection: boolean,
  +testId: string,
  +rightClickedMarker: Marker | null,
};

export type DispatchProps = {
  +changeRightClickedMarker: typeof changeRightClickedMarker,
};

type Props = {
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
  ...SizeProps,
};

type State = {
  hoveredMarkerIndex: MarkerIndex | null,
  mouseDownMarker: Marker | null,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

class TimelineMarkersImplementation extends React.PureComponent<Props, State> {
  state = {
    hoveredMarkerIndex: null,
    mouseDownMarker: null,
    mouseX: 0,
    mouseY: 0,
  };

  _hitTest(e: SyntheticMouseEvent<HTMLCanvasElement>): MarkerIndex | null {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    const { width, rangeStart, rangeEnd, getMarker, markerIndexes } =
      this.props;
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
      const { start, end } = marker;
      const dur = end === null ? 0 : end - start;
      const duration = Math.max(dur, onePixelTime);
      if (time < start || time >= start + duration) {
        continue;
      }

      const markerStyle = getMarkerStyle(marker);

      if (y >= markerStyle.top && y < markerStyle.top + markerStyle.height) {
        return markerIndex;
      }
    }
    return null;
  }

  _onMouseMove = (event: SyntheticMouseEvent<HTMLCanvasElement>) => {
    const hoveredMarkerIndex = this._hitTest(event);

    if (hoveredMarkerIndex !== null) {
      this.setState({
        hoveredMarkerIndex,
        mouseX: event.pageX,
        mouseY: event.pageY,
      });
    } else if (
      this.state.hoveredMarkerIndex !== null &&
      // This persistTooltips property is part of the web console API. It helps
      // in being able to inspect and debug tooltips.
      !window.persistTooltips
    ) {
      this.setState({
        hoveredMarkerIndex: null,
      });
    }
  };

  _onMouseDown = (e) => {
    const markerIndex = this._hitTest(e);
    const { changeRightClickedMarker, threadsKey, getMarker } = this.props;

    if (e.button === 2) {
      // The right button is a contextual action. It is important that we call
      // the right click callback at mousedown so that the state is updated and
      // the context menus are rendered before the mouseup/contextmenu events.
      changeRightClickedMarker(threadsKey, markerIndex);
    } else {
      const mouseDownMarker =
        markerIndex !== null ? getMarker(markerIndex) : null;

      this.setState({ mouseDownMarker });

      if (mouseDownMarker !== null) {
        // Disabling Flow type checking because Flow doesn't know about setCapture.
        const canvas = (e.currentTarget: any);
        if (canvas.setCapture) {
          // This retargets all mouse events to this element. This is useful
          // when for example the user releases the mouse button outside of the
          // browser window.
          canvas.setCapture();
        }
      }
    }
  };

  _onMouseUp = (event: SyntheticMouseEvent<HTMLCanvasElement>) => {
    const { mouseDownMarker } = this.state;
    if (mouseDownMarker !== null) {
      const mouseUpMarkerIndex = this._hitTest(event);
      const mouseUpMarker =
        mouseUpMarkerIndex === null
          ? null
          : this.props.getMarker(mouseUpMarkerIndex);

      if (
        mouseDownMarker === mouseUpMarker &&
        mouseUpMarker !==
          null /* extra null check because flow doesn't realize it's unnecessary */
      ) {
        event.stopPropagation();
        const { onSelect, rangeStart, rangeEnd } = this.props;
        const { start, end } = getStartEndRangeForMarker(
          rangeStart,
          rangeEnd,
          mouseUpMarker
        );
        onSelect(start, end);
      }
      this.setState({
        hoveredMarkerIndex: mouseUpMarkerIndex,
        mouseDownMarker: null,
      });
    }
  };

  _onMouseOut = () => {
    // This persistTooltips property is part of the web console API. It helps
    // in being able to inspect and debug tooltips.
    if (!window.persistTooltips) {
      this.setState({
        hoveredMarkerIndex: null,
      });
    }
  };

  render() {
    const {
      additionalClassName,
      isSelected,
      isModifyingSelection,
      threadsKey,
      testId,
      rightClickedMarker,
      getMarker,
    } = this.props;

    const { mouseDownMarker, hoveredMarkerIndex, mouseX, mouseY } = this.state;
    const shouldShowTooltip =
      !isModifyingSelection && !mouseDownMarker && !rightClickedMarker;
    const hoveredMarker =
      hoveredMarkerIndex === null ? null : getMarker(hoveredMarkerIndex);

    return (
      <div
        data-testid={testId}
        className={classNames(
          'timelineMarkers',
          additionalClassName,
          isSelected ? 'selected' : null
        )}
      >
        <ContextMenuTrigger id="MarkerContextMenu">
          <TimelineMarkersCanvas
            width={this.props.width}
            height={this.props.height}
            rangeStart={this.props.rangeStart}
            rangeEnd={this.props.rangeEnd}
            getMarker={this.props.getMarker}
            markerIndexes={this.props.markerIndexes}
            hoveredMarker={hoveredMarker}
            mouseDownMarker={mouseDownMarker}
            rightClickedMarker={rightClickedMarker}
            onMouseDown={this._onMouseDown}
            onMouseMove={this._onMouseMove}
            onMouseUp={this._onMouseUp}
            onMouseOut={this._onMouseOut}
          />
        </ContextMenuTrigger>
        {shouldShowTooltip && hoveredMarkerIndex !== null && hoveredMarker ? (
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            <TooltipMarker
              markerIndex={hoveredMarkerIndex}
              marker={hoveredMarker}
              threadsKey={threadsKey}
              restrictHeightWidth={true}
            />
          </Tooltip>
        ) : null}
      </div>
    );
  }
}

/**
 * Combine the base implementation of the TimelineMarkers with the
 * WithSize component.
 */
export const TimelineMarkers = withSize<Props>(TimelineMarkersImplementation);

/**
 * Memoize the isSelected result of the markers since this is user multiple times.
 */
const _getTimelineMarkersIsSelected = memoize(
  (selectedThreads, threadsKey) => hasThreadKeys(selectedThreads, threadsKey),
  { limit: 1 }
);

/**
 * Create a special connected component for Jank instances.
 */
export const TimelineMarkersJank = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state, props) => {
    const { threadsKey } = props;
    const selectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const selectedThreads = getSelectedThreadIndexes(state);

    return {
      getMarker: selectors.getMarkerGetter(state),
      // These don't use marker schema as they are derived.
      markerIndexes: selectors.getTimelineJankMarkerIndexes(state),
      isSelected: _getTimelineMarkersIsSelected(selectedThreads, threadsKey),
      isModifyingSelection: getPreviewSelection(state).isModifying,
      testId: 'TimelineMarkersJank',
      rightClickedMarker: selectors.getRightClickedMarker(state),
    };
  },
  mapDispatchToProps: { changeRightClickedMarker },
  component: TimelineMarkers,
});

/**
 * Create a connected component for all markers.
 */
export const TimelineMarkersOverview = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state, props) => {
    const { threadsKey } = props;
    const selectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const selectedThreads = getSelectedThreadIndexes(state);

    return {
      additionalClassName: selectors.getThread(state).isMainThread
        ? 'timelineMarkersGeckoMain'
        : null,
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes: selectors.getTimelineOverviewMarkerIndexes(state),
      isSelected: _getTimelineMarkersIsSelected(selectedThreads, threadsKey),
      isModifyingSelection: getPreviewSelection(state).isModifying,
      testId: 'TimelineMarkersOverview',
      rightClickedMarker: selectors.getRightClickedMarker(state),
    };
  },
  mapDispatchToProps: { changeRightClickedMarker },
  component: TimelineMarkers,
});

/**
 * FileIO is an optional marker type. Only add these markers if they exist.
 */
export const TimelineMarkersFileIo = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state, props) => {
    const { threadsKey } = props;
    const selectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const selectedThreads = getSelectedThreadIndexes(state);

    return {
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes: selectors.getTimelineFileIoMarkerIndexes(state),
      isSelected: _getTimelineMarkersIsSelected(selectedThreads, threadsKey),
      isModifyingSelection: getPreviewSelection(state).isModifying,
      testId: 'TimelineMarkersFileIo',
      rightClickedMarker: selectors.getRightClickedMarker(state),
    };
  },
  mapDispatchToProps: { changeRightClickedMarker },
  component: TimelineMarkers,
});

/**
 * Create a component for memory-related markers.
 */
export const TimelineMarkersMemory = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state, props) => {
    const { threadsKey } = props;
    const selectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const selectedThreads = getSelectedThreadIndexes(state);

    return {
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes: selectors.getTimelineMemoryMarkerIndexes(state),
      isSelected: _getTimelineMarkersIsSelected(selectedThreads, threadsKey),
      isModifyingSelection: getPreviewSelection(state).isModifying,
      additionalClassName: 'timelineMarkersMemory',
      testId: 'TimelineMarkersMemory',
      rightClickedMarker: selectors.getRightClickedMarker(state),
    };
  },
  mapDispatchToProps: { changeRightClickedMarker },
  component: TimelineMarkers,
});

/**
 * Create a component for IPC-related markers.
 */
export const TimelineMarkersIPC = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state, props) => {
    const { threadsKey } = props;
    const selectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const selectedThreads = getSelectedThreadIndexes(state);

    return {
      getMarker: selectors.getMarkerGetter(state),
      markerIndexes: selectors.getTimelineIPCMarkerIndexes(state),
      isSelected: _getTimelineMarkersIsSelected(selectedThreads, threadsKey),
      isModifyingSelection: getPreviewSelection(state).isModifying,
      additionalClassName: 'timelineMarkersIPC',
      testId: 'TimelineMarkersIPC',
      rightClickedMarker: selectors.getRightClickedMarker(state),
    };
  },
  mapDispatchToProps: { changeRightClickedMarker },
  component: TimelineMarkers,
});
