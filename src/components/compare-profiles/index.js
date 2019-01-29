/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import bisection from 'bisection';
import classNames from 'classnames';

import './index.css';

import explicitConnect from '../../utils/connect';
import { getProfile } from '../../selectors/profile';
import {
  changeSelectedThread,
  updatePreviewSelection,
} from '../../actions/profile-view';

import type { ThreadIndex, Profile, Thread } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import { getThreadSelectors } from '../../selectors/per-thread';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { Marker, MarkerTimingRows } from '../../types/profile-derived';

const kMinDurationForDisplayMs = 3;

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
    const leftItemMap = new Map();
    for (const item of left.executionItems) {
      const s = item.identifier;
      let itemListForString = leftItemMap.get(s);
      if (itemListForString === undefined) {
        itemListForString = [];
        leftItemMap.set(s, itemListForString);
      }
      itemListForString.push(item);
    }
    const shapes = [];
    for (const item of right.executionItems) {
      const s = item.identifier;
      const itemListForString = leftItemMap.get(s);
      if (itemListForString !== undefined) {
        const correspondingItem = itemListForString.shift();
        if (correspondingItem !== undefined) {
          if (item.shouldDisplay || correspondingItem.shouldDisplay) {
            shapes.push({
              left: {
                startTime: correspondingItem.startTime - left.range.startTime,
                endTime: correspondingItem.endTime - left.range.startTime,
              },
              right: {
                startTime: item.startTime - right.range.startTime,
                endTime: item.endTime - right.range.startTime,
              },
              itemType: item.type,
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
      firstContentfulPaint: 'rgba(0, 0, 0, 0.15)',
      documentLoad: 'rgba(0, 0, 0, 0.15)',
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
  +threadIndex: number,
  +friendlyThreadName: string,
  +documentLoadMarkers: Marker[],
  +chosenDocumentLoad: Marker,
  +range: {| +startTime: Milliseconds, +endTime: Milliseconds |},
  +executionItems: Marker[],
  +timeScale: NonLinearTimeScale,
  +onExecutionItemClick: (threadIndex, Marker) => void,
|};

class SingleThread extends PureComponent<SingleThreadProps> {
  _onExecutionItemClick = e => {
    if (!e.target.hasAttribute('data-executionitemindex')) {
      return;
    }
    const indexAsStringIfPresent = e.target.getAttribute(
      'data-executionitemindex'
    );
    const { onExecutionItemClick, executionItems, threadIndex } = this.props;
    onExecutionItemClick(threadIndex, executionItems[+indexAsStringIfPresent]);
  };

  render() {
    const {
      friendlyThreadName,
      documentLoadMarkers,
      chosenDocumentLoad,
      range,
      executionItems,
      timeScale,
    } = this.props;
    return (
      <React.Fragment>
        <div className='stuffAboveCanvas'>
          <h2>{friendlyThreadName}</h2>
          <select>
            {documentLoadMarkers.map((m, i) => (
              <option key={i}>{m.data.name}</option>
            ))}
          </select>
          <h3>{'Execution order'}</h3>
        </div>
        <ol
          className="executionOrder"
          onClick={this._onExecutionItemClick}
          style={{
            minHeight: `${timeScale.mapTimeToPx(
              timeScale.getTotalDuration()
            )}px`,
          }}
        >
          {executionItems.map(
            (item, i) =>
              item.shouldDisplay ? (
                <li
                  className={classNames('executionOrderItem', item.type)}
                  key={i}
                  data-executionitemindex={i}
                  title={`${(item.endTime - item.startTime).toFixed(2)}ms`}
                  style={{
                    top: `${timeScale.mapTimeToPx(
                      item.startTime - range.startTime
                    )}px`,
                    height: `${timeScale.mapTimeToPx(
                      item.endTime - range.startTime
                    ) -
                      timeScale.mapTimeToPx(
                        item.startTime - range.startTime
                      )}px`,
                  }}
                >
                  {item.displayText}
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

type DispatchProps = {|
  +changeSelectedThread: any,
  +updatePreviewSelection: any,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class CompareProfiles extends PureComponent<Props> {
  _onExecutionItemClick = (threadIndex, executionItem) => {
    const { changeSelectedThread, updatePreviewSelection } = this.props;
    changeSelectedThread(threadIndex);
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: executionItem.startTime,
      selectionEnd: executionItem.endTime,
    });
  };

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
        endTime: chosenDocumentLoad.data.endTime,
      };
      const filteredMarkers = markers.filter(
        m => m.start >= range.startTime && m.start + m.dur <= range.endTime
      );
      const fcpMarker = markers.find(
        m =>
          m.name === 'FirstContentfulPaint' && m.data && m.data.type === 'Text'
      );
      const executionItems = filteredMarkers
        .map(marker => {
          switch (marker.name) {
            case 'DOMEvent':
              return {
                type: 'eventHandler',
                identifier: `${marker.data.eventType} event handler`,
                displayText: `${marker.data.eventType} event handler`,
                startTime: marker.start,
                endTime: marker.start + marker.dur,
                shouldDisplay: marker.dur >= kMinDurationForDisplayMs,
              };
            case 'Script':
              return {
                type: 'scriptExecution',
                identifier: marker.data.name,
                displayText: marker.data.name,
                startTime: marker.start,
                endTime: marker.start + marker.dur,
                shouldDisplay: marker.dur >= kMinDurationForDisplayMs,
              };
            case 'setTimeout callback':
              return {
                type: 'timeoutCallback',
                identifier: marker.data.name,
                displayText: marker.data.name,
                startTime: marker.start,
                endTime: marker.start + marker.dur,
                shouldDisplay: marker.dur >= kMinDurationForDisplayMs,
              };
            case 'Rasterize':
              return {
                type: 'paintRasterization',
                identifier: 'Rasterization',
                displayText: 'Paint',
                startTime: marker.start,
                endTime: marker.start + marker.dur,
                shouldDisplay: marker.dur >= kMinDurationForDisplayMs,
              };
          }
          return null;
        })
        .filter(item => item !== null);
      if (fcpMarker) {
        executionItems.push({
          type: 'firstContentfulPaint',
          identifier: 'First Contentful Paint',
          displayText: fcpMarker.data.name,
          startTime: fcpMarker.data.endTime,
          endTime: fcpMarker.data.endTime + 0.0001,
          shouldDisplay: true,
        });
      }
      executionItems.push({
        type: 'documentLoad',
        identifier: 'DocumentLoad',
        displayText: chosenDocumentLoad.data.name,
        startTime: chosenDocumentLoad.data.endTime,
        endTime: chosenDocumentLoad.data.endTime + 0.0001,
        shouldDisplay: true,
      });

      return {
        friendlyThreadName,
        documentLoadMarkers,
        chosenDocumentLoad,
        range,
        executionItems,
      };
    });

    const timeScale = new NonLinearTimeScale(
      2,
      Math.max(
        ...threadInfos.map(({ range }) => range.endTime - range.startTime)
      )
    );

    for (const threadInfo of threadInfos) {
      const { executionItems, range } = threadInfo;
      for (const executionItem of executionItems) {
        if (executionItem.shouldDisplay) {
          timeScale.addFlatSection(
            executionItem.startTime - range.startTime,
            20
          );
          timeScale.addFlatSection(executionItem.endTime - range.startTime, 5);
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
              threadIndex={0}
              friendlyThreadName={threadInfos[0].friendlyThreadName}
              documentLoadMarkers={threadInfos[0].documentLoadMarkers}
              chosenDocumentLoad={threadInfos[0].chosenDocumentLoad}
              range={threadInfos[0].range}
              timeScale={timeScale}
              executionItems={threadInfos[0].executionItems}
              onExecutionItemClick={this._onExecutionItemClick}
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
              threadIndex={1}
              friendlyThreadName={threadInfos[1].friendlyThreadName}
              documentLoadMarkers={threadInfos[1].documentLoadMarkers}
              chosenDocumentLoad={threadInfos[1].chosenDocumentLoad}
              range={threadInfos[1].range}
              timeScale={timeScale}
              executionItems={threadInfos[1].executionItems}
              onExecutionItemClick={this._onExecutionItemClick}
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
  mapDispatchToProps: { changeSelectedThread, updatePreviewSelection },
  component: CompareProfiles,
};
export default explicitConnect(options);
