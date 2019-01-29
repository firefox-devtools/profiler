/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import bisection from 'bisection';
import classNames from 'classnames';

import explicitConnect from '../../utils/connect';
import { getProfile } from '../../selectors/profile';

import './index.css';

import type { ThreadIndex, Profile, Thread } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import { getThreadSelectors } from '../../selectors/per-thread';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { Marker, MarkerTimingRows } from '../../types/profile-derived';

const kMinDurationForDisplayMs = 2;

/**
 * Y axis is time
 * X axis is pixels
 * At the flat sections, "time stands still" - things are allowed to take up
 * more space on the screen without advancing time.
 *
 *                                              __/
 *                                      _______/
 *                                     /
 *                          __________/
 *                         /
 *                      __/
 *                     /
 *                    /
 *    _______________/
 *   /
 *  /
 * /
 *
 */
class NonLinearTimeScale {
  _pxPerMs: number = 0;
  _totalDuration: number = 0;
  _flatSectionTimes: number[] = []; // always sorted
  _flatSectionPaddingInPx: number[] = [];

  constructor(pxPerMs: number, totalDuration: number) {
    this._pxPerMs = pxPerMs;
    this._totalDuration = totalDuration;
  }

  getTotalDuration(): number {
    return this._totalDuration;
  }

  addFlatSection(time, paddingInPx) {
    const insertionIndex = bisection(this._flatSectionTimes, time);
    this._flatSectionTimes.splice(insertionIndex, 0, time);
    this._flatSectionPaddingInPx.splice(insertionIndex, 0, paddingInPx);
  }

  mapTimeToPx(time: number): number {
    let flatSectionIndex = 0;
    let previousFlatSectionTime = 0;
    let pixels = 0;
    while (
      flatSectionIndex < this._flatSectionTimes.length &&
      this._flatSectionTimes[flatSectionIndex] < time
    ) {
      const delta =
        this._flatSectionTimes[flatSectionIndex] - previousFlatSectionTime;
      pixels += delta * this._pxPerMs;
      pixels += this._flatSectionPaddingInPx[flatSectionIndex];
      previousFlatSectionTime = this._flatSectionTimes[flatSectionIndex];
      flatSectionIndex++;
    }
    const delta = time - previousFlatSectionTime;
    pixels += delta * this._pxPerMs;
    return pixels;
  }
}

function identifyingStringForMarker(marker: Marker) {
  switch (marker.name) {
    case 'DOMEvent':
      return `${marker.data.eventType} event handler`;
    case 'Script':
    case 'setTimeout callback':
      return marker.data.name;
    case 'Rasterize':
      return 'Paint';
  }
  return '<unknown marker type>';
}

function executionOrderItemTypeForMarker(marker: Marker) {
  switch (marker.name) {
    case 'Script':
      return 'scriptExecution';
    case 'setTimeout callback':
      return 'timeoutCallback';
    case 'DOMEvent':
      return 'eventHandler';
    case 'Rasterize':
      return 'paintRasterization';
  }
  return undefined;
}

class PairComparator extends PureComponent<any> {
  _canvas: null | HTMLCanvasElement = null;
  _resizeListener: () => void;
  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    if (canvas !== this._canvas) {
      this._canvas = canvas;
      this._renderCanvas();
    }
  };

  _renderCanvas() {
    const canvas = this._canvas;
    if (canvas !== null) {
      this.drawCanvas(canvas);
    }
  }

  drawCanvas(c: HTMLCanvasElement) {
    const { left, right, timeScale } = this.props;
    const leftMarkerMap = new Map();
    for (const m of left.interestingMarkers) {
      const s = identifyingStringForMarker(m);
      let markerListForString = leftMarkerMap.get(s);
      if (markerListForString === undefined) {
        markerListForString = [];
        leftMarkerMap.set(s, markerListForString);
      }
      markerListForString.push(m);
    }
    const shapes = [];
    for (const m of right.interestingMarkers) {
      const s = identifyingStringForMarker(m);
      const markerListForString = leftMarkerMap.get(s);
      if (markerListForString !== undefined) {
        const correspondingMarker = markerListForString.shift();
        if (correspondingMarker !== undefined) {
          if (
            m.dur >= kMinDurationForDisplayMs ||
            correspondingMarker.dur >= kMinDurationForDisplayMs
          ) {
            shapes.push({
              left: {
                startTime: correspondingMarker.start - left.range.startTime,
                endTime:
                  correspondingMarker.start -
                  left.range.startTime +
                  correspondingMarker.dur,
              },
              right: {
                startTime: m.start - right.range.startTime,
                endTime: m.start - right.range.startTime + m.dur,
              },
              itemType: executionOrderItemTypeForMarker(m),
            });
          }
        }
      }
    }
    console.log(shapes);

    const devicePixelRatio = c.ownerDocument
      ? c.ownerDocument.defaultView.devicePixelRatio
      : 1;
    const width = c.getBoundingClientRect().width;
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

    const fillStyles = {
      scriptExecution: 'rgba(255, 238, 163, 0.4)',
      timeoutCallback: 'rgba(255, 163, 206, 0.4)',
      eventHandler: 'rgba(163, 203, 255, 0.4)',
      paintRasterization: 'rgba(163, 255, 163, 0.4)',
    };

    ctx.globalCompositeOperation = 'multiply';

    function lerp(t, start, end) {
      return (1 - t) * start + t * end;
    }

    function wavy(t) {
      return (Math.sin((t * 2 - 1) * Math.PI / 2) + 1) / 2;
    }

    const weights = [];
    for (let x = 0; x <= 100; x++) {
      let t = x / 100;
      t = wavy(t);
      let t2 = 0; //wavy(t * 2) * 0.2;
      weights.push({
        l0: (1 - t2) * (1 - t),
        r0: (1 - t2) * t,
        l1: t2 * (1 - t),
        r1: t2 * t,
      });
    }

    for (const shape of shapes) {
      const { left, right, itemType } = shape;
      ctx.fillStyle = fillStyles[itemType];
      ctx.beginPath();
      ctx.moveTo(0, timeScale.mapTimeToPx(left.startTime));
      for (let i = 0; i < weights.length; i++) {
        const x = width * i / (weights.length - 1);
        const w = weights[i];
        ctx.lineTo(
          x,
          w.l0 * timeScale.mapTimeToPx(left.startTime) +
            w.r0 * timeScale.mapTimeToPx(right.startTime) +
            w.l1 * timeScale.mapTimeToPx(left.endTime) +
            w.r1 * timeScale.mapTimeToPx(right.endTime)
        );
      }
      for (let i = weights.length - 1; i >= 0; i--) {
        const x = width * i / (weights.length - 1);
        const w = weights[i];
        ctx.lineTo(
          x,
          w.l1 * timeScale.mapTimeToPx(left.startTime) +
            w.r1 * timeScale.mapTimeToPx(right.startTime) +
            w.l0 * timeScale.mapTimeToPx(left.endTime) +
            w.r0 * timeScale.mapTimeToPx(right.endTime)
        );
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
  }

  render() {
    this._renderCanvas();
    return (
      <canvas
        className="pairComparatorCanvas"
        width="200"
        height="1000"
        style={{ width: '200px', height: '10000px' }}
        ref={this._takeCanvasRef}
      />
    );
  }
}

type SingleThreadProps = {|
  +friendlyThreadName: string,
  +documentLoadMarkers: Marker[],
  +chosenDocumentLoad: Marker,
  +range: {| +startTime: Milliseconds, +endTime: Milliseconds |},
  +interestingMarkers: Marker[],
  +timeScale: NonLinearTimeScale,
|};

class SingleThread extends PureComponent<SingleThreadProps> {
  render() {
    const {
      friendlyThreadName,
      documentLoadMarkers,
      chosenDocumentLoad,
      range,
      interestingMarkers,
      timeScale,
    } = this.props;
    return (
      <React.Fragment>
        <h2>{friendlyThreadName}</h2>
        <select>
          {documentLoadMarkers.map((m, i) => (
            <option key={i}>{m.data.name}</option>
          ))}
        </select>
        <h3>{'Execution order'}</h3>
        <ol
          className="executionOrder"
          style={{
            minHeight: `${timeScale.mapTimeToPx(
              timeScale.getTotalDuration()
            )}px`,
          }}
        >
          {interestingMarkers.map(
            (m, i) =>
              m.dur >= kMinDurationForDisplayMs ? (
                <li
                  className={classNames(
                    'executionOrderItem',
                    executionOrderItemTypeForMarker(m)
                  )}
                  key={i}
                  title={`${Math.round(m.dur)}ms`}
                  style={{
                    top: `${timeScale.mapTimeToPx(
                      m.start - range.startTime
                    )}px`,
                    height: `${timeScale.mapTimeToPx(
                      m.start - range.startTime + m.dur
                    ) - timeScale.mapTimeToPx(m.start - range.startTime)}px`,
                  }}
                >
                  {identifyingStringForMarker(m)}
                </li>
              ) : null
          )}
        </ol>
      </React.Fragment>
    );
  }
}

type StateProps = {|
  +profile: Profile,
  +threadMarkers: Marker[][],
  +friendlyThreadNames: string[],
|};

type DispatchProps = {||};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class CompareProfiles extends PureComponent<Props> {
  render() {
    window.NonLinearTimeScale = NonLinearTimeScale;
    const threads = this.props.profile.threads;
    const threadMarkers = this.props.threadMarkers;
    const friendlyThreadNames = this.props.friendlyThreadNames;

    const threadInfos = threads.map((thread, threadIndex) => {
      const markers = threadMarkers[threadIndex];
      const friendlyThreadName = friendlyThreadNames[threadIndex];
      const stringTable = thread.stringTable;
      const documentLoadMarkers = markers.filter(
        m => m.name === 'DocumentLoad' && m.data && m.data.type === 'Text'
      );
      const chosenDocumentLoadIndex = 0;
      const chosenDocumentLoad = documentLoadMarkers[chosenDocumentLoadIndex];
      const range = {
        startTime: chosenDocumentLoad.data.startTime,
        endTime: chosenDocumentLoad.data.endTime + 10000,
      };
      const filteredMarkers = markers.filter(
        m => m.start >= range.startTime && m.start + m.dur <= range.endTime
      );
      const interestingMarkers = filteredMarkers.filter(m => {
        if (m.name === 'Script') {
          return true;
        }
        if (m.name === 'setTimeout callback') {
          return true;
        }
        if (m.name === 'DOMEvent') {
          return true;
        }
        if (m.name === 'Rasterize') {
          return true;
        }
        return false;
      });

      return {
        friendlyThreadName,
        documentLoadMarkers,
        chosenDocumentLoad,
        range,
        interestingMarkers,
      };
    });

    const timeScale = new NonLinearTimeScale(
      2,
      Math.max(
        ...threadInfos.map(({ range }) => range.endTime - range.startTime)
      )
    );

    for (const threadInfo of threadInfos) {
      const { interestingMarkers, range } = threadInfo;
      for (const marker of interestingMarkers) {
        if (marker.dur >= kMinDurationForDisplayMs) {
          timeScale.addFlatSection(marker.start - range.startTime, 20);
          timeScale.addFlatSection(
            marker.start - range.startTime + marker.dur,
            5
          );
        }
      }
    }

    return (
      <div
        className="compareProfiles"
        id="compare-profiles-tab"
        role="tabpanel"
        aria-labelledby="compare-profiles-tab-button"
      >
        <ol className="compare-profiles-threads-list">
          <li className="compare-profiles-thread" key={0}>
            <SingleThread
              friendlyThreadName={threadInfos[0].friendlyThreadName}
              documentLoadMarkers={threadInfos[0].documentLoadMarkers}
              chosenDocumentLoad={threadInfos[0].chosenDocumentLoad}
              range={threadInfos[0].range}
              timeScale={timeScale}
              interestingMarkers={threadInfos[0].interestingMarkers}
            />
          </li>
          <li className="compare-profiles-thread-gap" key="gap 0/1">
            <PairComparator
              left={threadInfos[0]}
              right={threadInfos[1]}
              timeScale={timeScale}
            />
          </li>
          <li className="compare-profiles-thread" key={1}>
            <SingleThread
              friendlyThreadName={threadInfos[1].friendlyThreadName}
              documentLoadMarkers={threadInfos[1].documentLoadMarkers}
              chosenDocumentLoad={threadInfos[1].chosenDocumentLoad}
              range={threadInfos[1].range}
              timeScale={timeScale}
              interestingMarkers={threadInfos[1].interestingMarkers}
            />
          </li>
        </ol>
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const profile = getProfile(state);
    const threadSelectors = profile.threads.map((t, threadIndex) =>
      getThreadSelectors(threadIndex)
    );
    return {
      profile,
      threadMarkers: threadSelectors.map(selectors =>
        selectors.getMarkers(state)
      ),
      friendlyThreadNames: threadSelectors.map(selectors =>
        selectors.getFriendlyThreadName(state)
      ),
    };
  },
  component: CompareProfiles,
};
export default explicitConnect(options);
