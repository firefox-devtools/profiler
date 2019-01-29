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

  getTotalPxLength(): number {
    return this.mapTimeToPx(this.getTotalDuration());
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

function lerp(a, b, t) {
  return (1 - t) * a + t * b;
}

function wavy(t) {
  return (Math.sin((t * 2 - 1) * Math.PI / 2) + 1) / 2;
}

const kWeightSpan = 100;
const kWavyWeights = new Float32Array(kWeightSpan + 1);
for (let i = 0; i <= kWeightSpan; i++) {
  kWavyWeights[i] = wavy(i / kWeightSpan);
}

class PairComparator extends PureComponent<any> {
  render() {
    const { itemConnections, timeScale, width } = this.props;

    return (
      <svg
        className="pairComparatorCanvas"
        style={{
          width: `${width}px`,
          height: `${timeScale.getTotalPxLength()}px`,
        }}
      >
        {itemConnections.map(connection => {
          const { left, right, itemType } = connection;
          let pathString = `M0 ${timeScale.mapTimeToPx(left.startTime)}`;
          for (let i = 0; i <= kWeightSpan; i++) {
            pathString += `L${width * i / kWeightSpan} ${lerp(
              timeScale.mapTimeToPx(left.startTime),
              timeScale.mapTimeToPx(right.startTime),
              kWavyWeights[i]
            )}`;
          }
          for (let i = kWeightSpan; i >= 0; i--) {
            pathString += `L${width * i / kWeightSpan} ${lerp(
              timeScale.mapTimeToPx(left.endTime),
              timeScale.mapTimeToPx(right.endTime),
              kWavyWeights[i]
            )}`;
          }
          pathString += 'Z';
          return (
            <path
              d={pathString}
              className={classNames('executionItemConnection', itemType)}
            />
          );
        })}
      </svg>
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
        <div className="stuffAboveCanvas">
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
            minHeight: `${timeScale.getTotalPxLength()}px`,
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
      const documentLoadMarkers = markers.filter(
        m => m.name === 'DocumentLoad' && m.data && m.data.type === 'Text'
      );
      const chosenDocumentLoadIndex = 0;
      const chosenDocumentLoad = documentLoadMarkers[chosenDocumentLoadIndex];
      return {
        friendlyThreadName,
        documentLoadMarkers,
        chosenDocumentLoad,
      };
    });

    const timeScale = new NonLinearTimeScale(
      2,
      Math.max(
        ...threadInfos.map(
          ({ chosenDocumentLoad }) =>
            chosenDocumentLoad.data.endTime - chosenDocumentLoad.data.startTime + 0.001
        )
      )
    );

    const threadDatas = threadInfos.map((threadInfo, threadIndex) => {
      const {
        friendlyThreadName,
        documentLoadMarkers,
        chosenDocumentLoad,
      } = threadInfo;
      const markers = threadMarkers[threadIndex];
      const range = {
        startTime: chosenDocumentLoad.data.startTime,
        endTime:
          chosenDocumentLoad.data.startTime + timeScale.getTotalDuration(),
      };
      const filteredMarkers = markers.filter(
        m => m.start >= range.startTime && m.start + m.dur <= range.endTime + 5000
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
                identifier: `${marker.data.eventType} event handler on ${marker.data.eventTargetDescription || 'unknown target'}`,
                displayText: `${marker.data.eventType} event handler on ${marker.data.eventTargetDescription || 'unknown target'}`,
                startTime: marker.start,
                endTime: marker.start + marker.dur,
                shouldDisplay: marker.dur >= kMinDurationForDisplayMs,
                shouldAttemptToConnect: true,
              };
            case 'Script':
              return {
                type: 'scriptExecution',
                identifier: marker.data.name,
                displayText: marker.data.name,
                startTime: marker.start,
                endTime: marker.start + marker.dur,
                shouldDisplay: marker.dur >= kMinDurationForDisplayMs,
                shouldAttemptToConnect: true,
              };
            case 'setTimeout callback':
              return {
                type: 'timeoutCallback',
                identifier: marker.data.name,
                displayText: marker.data.name,
                startTime: marker.start,
                endTime: marker.start + marker.dur,
                shouldDisplay: marker.dur >= kMinDurationForDisplayMs,
                shouldAttemptToConnect: true,
              };
            case 'Rasterize':
              return {
                type: 'paintRasterization',
                identifier: 'Rasterization',
                displayText: 'Paint',
                startTime: marker.start,
                endTime: marker.start + marker.dur,
                shouldDisplay: marker.dur >= kMinDurationForDisplayMs,
                shouldAttemptToConnect: false,
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
          shouldAttemptToConnect: true,
        });
      }
      executionItems.push({
        type: 'documentLoad',
        identifier: 'DocumentLoad',
        displayText: chosenDocumentLoad.data.name,
        startTime: chosenDocumentLoad.data.endTime,
        endTime: chosenDocumentLoad.data.endTime + 0.0001,
        shouldDisplay: true,
        shouldAttemptToConnect: true,
      });

      return {
        friendlyThreadName,
        documentLoadMarkers,
        chosenDocumentLoad,
        range,
        executionItems,
      };
    });

    const leftExecutionItems = threadDatas[0].executionItems;
    const leftRangeStartTime = threadDatas[0].range.startTime;
    const rightExecutionItems = threadDatas[1].executionItems;
    const rightRangeStartTime = threadDatas[1].range.startTime;
    const leftItemMap = new Map();
    for (const leftItem of leftExecutionItems) {
      if (!leftItem.shouldAttemptToConnect) {
        continue;
      }
      const ident = leftItem.identifier;
      let itemListForString = leftItemMap.get(ident);
      if (itemListForString === undefined) {
        itemListForString = [];
        leftItemMap.set(ident, itemListForString);
      }
      itemListForString.push(leftItem);
    }
    const itemConnections = [];
    for (const rightItem of rightExecutionItems) {
      if (!rightItem.shouldAttemptToConnect) {
        continue;
      }
      const ident = rightItem.identifier;
      const itemListForString = leftItemMap.get(ident);
      if (itemListForString !== undefined) {
        const leftItem = itemListForString.shift();
        if (leftItem !== undefined) {
          if (leftItem.shouldDisplay || rightItem.shouldDisplay) {
            leftItem.shouldDisplay = true;
            rightItem.shouldDisplay = true;
            itemConnections.push({
              left: {
                startTime: leftItem.startTime - leftRangeStartTime,
                endTime: leftItem.endTime - leftRangeStartTime,
              },
              right: {
                startTime: rightItem.startTime - rightRangeStartTime,
                endTime: rightItem.endTime - rightRangeStartTime,
              },
              itemType: rightItem.type,
            });
          }
        }
      }
    }

    for (const threadData of threadDatas) {
      const { executionItems, range } = threadData;
      for (const executionItem of executionItems) {
        if (executionItem.startTime >= range.endTime) {
          executionItem.shouldDisplay = false;
        }
        if (executionItem.shouldDisplay) {
          timeScale.addFlatSection(
            executionItem.startTime - range.startTime,
            24
          );
          timeScale.addFlatSection(executionItem.endTime - range.startTime, 2);
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
              friendlyThreadName={threadDatas[0].friendlyThreadName}
              documentLoadMarkers={threadDatas[0].documentLoadMarkers}
              chosenDocumentLoad={threadDatas[0].chosenDocumentLoad}
              range={threadDatas[0].range}
              timeScale={timeScale}
              executionItems={threadDatas[0].executionItems}
              onExecutionItemClick={this._onExecutionItemClick}
            />
          </li>
          <li className="compare-profiles-thread-gap" key="gap 0/1">
            <PairComparator
              width={200}
              itemConnections={itemConnections}
              timeScale={timeScale}
            />
          </li>
          <li className="compare-profiles-thread" key={1}>
            <SingleThread
              threadIndex={1}
              friendlyThreadName={threadDatas[1].friendlyThreadName}
              documentLoadMarkers={threadDatas[1].documentLoadMarkers}
              chosenDocumentLoad={threadDatas[1].chosenDocumentLoad}
              range={threadDatas[1].range}
              timeScale={timeScale}
              executionItems={threadDatas[1].executionItems}
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
