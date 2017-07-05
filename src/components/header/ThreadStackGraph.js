/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';
import { timeCode } from '../../utils/time-code';

import type {
  Thread,
  IndexIntoStackTable,
  IndexIntoMarkersTable,
} from '../../types/profile';
import type { Milliseconds } from '../../types/units';

type Props = {
  thread: Thread,
  interval: Milliseconds,
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  selectedStack: IndexIntoStackTable | null,
  className: string,
  onClick: (Milliseconds | void) => void,
  onMarkerSelect: IndexIntoMarkersTable => void,
};

class ThreadStackGraph extends PureComponent {
  _resizeListener: () => void;
  _requestedAnimationFrame: boolean;
  _canvas: HTMLCanvasElement | null;
  props: Props;

  constructor(props: Props) {
    super(props);
    this._resizeListener = () => this.forceUpdate();
    this._requestedAnimationFrame = false;
    this._canvas = null;
    (this: any)._onMouseUp = this._onMouseUp.bind(this);
    (this: any)._onMarkerSelected = this._onMarkerSelected.bind(this);
  }

  _scheduleDraw() {
    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        const canvas = this._canvas;
        if (canvas) {
          timeCode('ThreadStackGraph render', () => {
            this.drawCanvas(canvas);
          });
        }
      });
    }
  }

  componentDidMount() {
    window.addEventListener('resize', this._resizeListener);
    this.forceUpdate(); // for initial size
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener);
  }

  drawCanvas(canvas: HTMLCanvasElement) {
    const {
      thread,
      interval,
      rangeStart,
      rangeEnd,
      selectedStack,
    } = this.props;

    const devicePixelRatio = window.devicePixelRatio;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * devicePixelRatio);
    canvas.height = Math.round(r.height * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(
        'Could not get a 2d context for the ThreadStackGraph canvas'
      );
    }
    let maxDepth = 0;
    const { samples, stackTable } = thread;
    const sampleStacks = samples.stack;
    for (let i = 0; i < stackTable.length; i++) {
      if (stackTable.depth[i] > maxDepth) {
        maxDepth = stackTable.depth[i];
      }
    }
    const range = [rangeStart, rangeEnd];
    const rangeLength = range[1] - range[0];
    const xPixelsPerMs = canvas.width / rangeLength;
    const yPixelsPerDepth = canvas.height / maxDepth;
    const trueIntervalPixelWidth = interval * xPixelsPerMs;
    const multiplier = trueIntervalPixelWidth < 2.0 ? 1.2 : 1.0;
    const drawnIntervalWidth = Math.max(
      0.8,
      trueIntervalPixelWidth * multiplier
    );
    let selectedStackDepth = 0;
    if (selectedStack !== null) {
      selectedStackDepth = stackTable.depth[selectedStack];
    }

    function hasSelectedStackPrefix(stackPrefix) {
      let stackIndex = stackPrefix;
      if (stackIndex === null) {
        return false;
      }
      // Find the stackIndex at the selectedStackDepth by starting at the leaf stack and
      // walking toward the root.
      for (
        let depth = stackTable.depth[stackIndex];
        depth > selectedStackDepth;
        depth--
      ) {
        if (stackIndex === null) {
          return false;
        }
        stackIndex = stackTable.prefix[stackIndex];
      }
      // Is the stack at the selectedStackDepth the selectedStack?
      return stackIndex === selectedStack;
    }

    for (let i = 0; i < sampleStacks.length; i++) {
      const sampleTime = thread.samples.time[i];
      if (
        sampleTime + drawnIntervalWidth / xPixelsPerMs < range[0] ||
        sampleTime > range[1]
      ) {
        continue;
      }
      const stackIndex = sampleStacks[i];
      if (stackIndex === null) {
        continue;
      }
      const isHighlighted = hasSelectedStackPrefix(stackIndex);

      const sampleHeight = stackTable.depth[stackIndex] * yPixelsPerDepth;
      const startY = canvas.height - sampleHeight;
      // const responsiveness = thread.samples.responsiveness[i];
      // const jankSeverity = Math.min(1, responsiveness / 100);
      ctx.fillStyle = isHighlighted ? '#38445f' : '#7990c8';
      ctx.fillRect(
        (sampleTime - range[0]) * xPixelsPerMs,
        startY,
        drawnIntervalWidth,
        sampleHeight
      );
    }
  }

  _onMouseUp(e: SyntheticMouseEvent) {
    const canvas = this._canvas;
    const onClick = this.props.onClick;
    if (onClick && canvas) {
      const { rangeStart, rangeEnd } = this.props;
      const r = canvas.getBoundingClientRect();

      const x = e.pageX - r.left;
      const time = rangeStart + x / r.width * (rangeEnd - rangeStart);
      onClick(time);
    }
  }

  _onMarkerSelected(markerIndex: IndexIntoMarkersTable) {
    this.props.onMarkerSelect(markerIndex);
  }

  render() {
    this._scheduleDraw();
    return (
      <div className={this.props.className}>
        <canvas
          className={classNames(
            `${this.props.className}Canvas`,
            'threadStackGraphCanvas'
          )}
          ref={(ref: HTMLCanvasElement) => (this._canvas = ref)}
          onMouseUp={this._onMouseUp}
        />
      </div>
    );
  }
}

ThreadStackGraph.propTypes = {
  thread: PropTypes.shape({
    samples: PropTypes.object.isRequired,
  }).isRequired,
  interval: PropTypes.number.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  selectedStack: PropTypes.number,
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
  onMarkerSelect: PropTypes.func.isRequired,
};

export default ThreadStackGraph;
