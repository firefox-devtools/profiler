/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
import Tooltip from '../shared/Tooltip';

import type { CssPixels } from '../../types/units';
import type { ThreadIndex } from '../../types/profile';
import type { TracingMarker } from '../../types/profile-derived';
import type { NetworkPayload } from '../../types/markers';

export type NetworkChartRowProps = {
  +index: number,
  +marker: TracingMarker,
  // Pass the payload in as well, since our types can't express a TracingMarker with
  // a specific payload.
  +networkPayload: NetworkPayload | null,
  +markerStyle: {
    [key: string]: string | number,
  },
  +threadIndex: ThreadIndex,
};

type State = {
  pageX: CssPixels,
  pageY: CssPixels,
  hovered: ?boolean,
};

export type NetworkChartRowBarProps = {
  +marker: TracingMarker,
  // Pass the payload in as well, since our types can't express a TracingMarker with
  // a specific payload.
  markerMeta: {
      requestQueue: number,
      request: number,
      response: number,
      type: string
    },
};

// This component splits a network marker duration in 4 different phases,
// and renders each phase as a differently colored bar.
// 1. request queue
// 2. request
// 3. response
// 4. response queue (This is not calculated. We assume it is the rest of the duration.)
const NetworkChartRowBar = (props: NetworkChartRowBarProps) => {
  const { markerMeta } = props;
  const { dur } = props.marker;

  const _numberToPercent = (num: number): number => {
    return num / dur * 100;
  }

  let responseWidth = 0;
  const partialDuration = markerMeta.requestQueue + markerMeta.request + markerMeta.response;

  // Adding either the default value (=zero) as width or
  // the new, calculated value that can be added.
  const requestQueueWidth = _numberToPercent(markerMeta.requestQueue);
  const requestWidth = _numberToPercent(markerMeta.request);
  responseWidth = _numberToPercent(markerMeta.response);

  if (partialDuration === 0) {
    responseWidth = 100;
  }

  if (partialDuration > 0 && markerMeta.response !== 0) {
    responseWidth = _numberToPercent(markerMeta.response)
  }

  return (
    <React.Fragment>
      <span
        className="networkChartRowItemBarInner networkChartRowItemBarRequestQueue"
        style={{ width: `${requestQueueWidth}%` }}
      >
        &nbsp;
      </span>
      <span
        className="networkChartRowItemBarInner networkChartRowItemBarRequest"
        style={{ width: `${requestWidth}%` }}
      >
        &nbsp;
      </span>
      <span
        className="networkChartRowItemBarInner networkChartRowItemBarResponse"
        style={{ width: `${responseWidth}%` }}
      >
        &nbsp;
      </span>
    </React.Fragment>
  );
};

class NetworkChartRow extends React.PureComponent<NetworkChartRowProps, State> {
  state = {
    pageX: 0,
    pageY: 0,
    hovered: false,
  };

  _hoverIn = (event: SyntheticMouseEvent<>) => {
    const pageX = event.pageX;
    const pageY = event.pageY;

    this.setState({
      pageX,
      pageY,
      hovered: true,
    });
  };

  _hoverOut = () => {
    this.setState({
      hovered: false,
    });
  };

  _findIndexOfLoadid(name: string): number | null {
    const regex = /[:]/g;
    const number = name.search(regex);
    if (number === -1) {
      return null;
    }
    return number;
  }

  // Remove `Load 123: ` from markers.name
  _cropNameToUrl(name: string): string {
    const url = name.slice(this._findIndexOfLoadid(name) + 2);
    return url;
  }

  _extractURI(url: string): URL | null {
    try {
      const uri = new URL(this._cropNameToUrl(url));
      return uri;
    } catch (e) {
      return null;
    }
  }

  // Split markers.name in loadID and parts of URL to highlight domain
  // and filename, shorten the rest if needed.
  _splitsURI(name: string): React.Node {
    // Extract URI from markers.name
    const uri = this._extractURI(name);
    if (uri !== null) {
      // Extract filename from pathname
      const uriFilename = uri.pathname.slice(uri.pathname.lastIndexOf('/')); // filename.xy
      // Remove filename from pathname
      const uriPath = uri.pathname.replace(uriFilename, '');

      return (
        <span>
          <span className="networkChartRowItemUriOptional">
            {uri.protocol + '//'}
          </span>
          <span className="networkChartRowItemUriRequired">{uri.hostname}</span>
          {uriPath !== uriFilename && uriPath.length > 0 ? (
            <span className="networkChartRowItemUriOptional">{uriPath}</span>
          ) : null}
          <span className="networkChartRowItemUriRequired">{uriFilename}</span>
          {uri.search ? (
            <span className="networkChartRowItemUriOptional">{uri.search}</span>
          ) : null}
          {uri.hash ? (
            <span className="networkChartRowItemUriOptional">{uri.hash}</span>
          ) : null}
        </span>
      );
    }
    return name;
  }

  // Identifies mime type of request. This is a workaround until we have
  // mime types passed from gecko to network marker requests.
  _identifyType(name: string): string {
    const uri = this._extractURI(name);
    if (uri === null) {
      return '';
    }
    // Extracting the fileName from the path.
    const fileName = uri.pathname;
    const fileExt = fileName.slice(fileName.lastIndexOf('.'));

    switch (fileExt) {
      case '.js':
        return 'Js';
      case '.css':
        return 'Css';
      case '.gif':
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.svg':
        return 'Img';
      case '.html':
        return 'Html';
      default:
        return 'Other';
    }
  }

  _createMarkerMetaData(marker: TracingMarker): {
      requestQueue: number,
      request: number,
      response: number,
      type: string
    } { //change object to actuall definition
      const { networkPayload } = this.props;
      const { start, dur } = marker;

      if (!networkPayload) {
        return {
          requestQueue: 0,
          request: 0,
          response: 0,
          type: ''
        };
      }
  // A marker does not always contain the same set of networkPayload on the start of
  // the connection.
  const queueStart =
    networkPayload.secureConnectionStart ||
    networkPayload.tcpConnectEnd ||
    networkPayload.connectStart ||
    networkPayload.domainLookupStart ||
    0;

  // The default for width of the phases is always zero.
  let requestQueue: number = 0;
  let request: number = 0;
  let response: number = 0;

  // Timestamps from network markers aren't adjusted when processing
  // the gecko profile format. This is the reason why the start timestamp of a
  // marker can be after the start timestamp of the request.
  // To prevent false networkPayload visualization, we need this workaround.
  // See https://github.com/devtools-html/perf.html/issues/1493 for more detail.
  if (
    networkPayload.requestStart &&
    start < networkPayload.requestStart &&
    networkPayload.responseStart &&
    start < networkPayload.responseStart
  ) {
    request =
      networkPayload.responseStart - networkPayload.requestStart; // create object to throw into tooltip
  }

  if (
    networkPayload.responseEnd &&
    start < networkPayload.responseEnd &&
    networkPayload.responseStart &&
    start < networkPayload.responseStart
  ) {
    response =
      networkPayload.responseEnd - networkPayload.responseStart;
  }

  if (queueStart && start < queueStart && queueStart > 0) {
    requestQueue = queueStart - start;
  }

  const markerMeta = {
    requestQueue: requestQueue,
    request: request,
    response: response,
    type: this._identifyType(marker.name)
  }

  return markerMeta;
  }

  render() {
    const { index, marker, markerStyle, networkPayload } = this.props;
    const evenOddClassName = index % 2 === 0 ? 'even' : 'odd';
    const markerMetaData = this._createMarkerMetaData(marker);

    if (networkPayload === null) {
      return null;
    }
    const itemClassName =
      evenOddClassName +
      ' networkChartRowItem ' +
      'networkChartRowItem' + this._identifyType(marker.name);
    return (
      <section className={itemClassName}>
        <div className="networkChartRowItemLabel">
          {this._splitsURI(marker.name)}
        </div>
        <div
          className="networkChartRowItemBar"
          style={markerStyle}
          onMouseEnter={this._hoverIn}
          onMouseLeave={this._hoverOut}
        >
          <NetworkChartRowBar marker={marker} networkPayload={networkPayload} markerMeta={markerMetaData} />
        </div>
        {this.state.hovered ? (
          <Tooltip mouseX={this.state.pageX} mouseY={this.state.pageY}>
            <MarkerTooltipContents
              marker={marker}
              markerMeta={markerMetaData}
              threadIndex={this.props.threadIndex}
            />
          </Tooltip>
        ) : null}
      </section>
    );
  }
}

export default NetworkChartRow;
