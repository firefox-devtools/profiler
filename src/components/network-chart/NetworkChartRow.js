/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
import Tooltip from '../shared/Tooltip';
import copy from 'copy-to-clipboard';

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

export type NetworkChartRowPropsBar = {
  +marker: TracingMarker,
  // Pass the payload in as well, since our types can't express a TracingMarker with
  // a specific payload.
  +data: NetworkPayload | null,
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
  +networkPayload: NetworkPayload | null,
};

// Splitting up the network marker duration in 4 different phases
// 1. request queue
// 2. request
// 3. response
// 4. response queue
const NetworkChartRowBar = (props: NetworkChartRowBarProps) => {
  if (
    props &&
    props.marker &&
    props.marker.data &&
    (props || props.marker || props.marker.data) !== null
  ) {
    const marker = props.marker;
    const data = marker.data;
    const start = marker.start;
    const dur = marker.dur;

    // A marker not always contains the same set of data on the start of the connection
    const queueStart =
      data.secureConnectionStart ||
      data.tcpConnectEnd ||
      data.connectStart ||
      data.domainLookupStart ||
      0;

    // Default for width of the phases is always zero
    let req_queue: ?number | string = 0;
    let req: ?number | string = 0;
    let res: ?number | string = 0;

    // The start of a marker is related to the parentThread
    // As e.g. a content thread can start earlier or the data starts
    // before the start of the marker related to the parentThread, we need to prevent false data visualization
    if (
      data.requestStart &&
      start < data.requestStart &&
      data.responseStart &&
      start < data.responseStart
    ) {
      req = (data.responseStart - data.requestStart || 0) / dur * 100 + '%';
    }

    if (
      data.responseEnd &&
      start < data.responseEnd &&
      data.responseStart &&
      start < data.responseStart
    ) {
      res = (data.responseEnd - data.responseStart || 0) / dur * 100 + '%';
    }

    if (queueStart && start < queueStart > 0) {
      req_queue = (queueStart - start) / dur * 100 + '%';
    }

    // When we keep the default values (=zero), the
    // response gets the full width of the bar to be more visible
    if (req_queue + req + res === 0) {
      res = 100 + '%';
    }

    // Adding either the default value (=zero) as width or
    // we have calculated a new value that can be added as width
    const boxWidth = {
      req_queue: req_queue,
      req: req,
      res: res,
    };

    return (
      <React.Fragment>
        <span
          className="networkChartRowItemBarInner request-queue"
          style={{ width: boxWidth.req_queue }}
        >
          &nbsp;
        </span>
        <span
          className="networkChartRowItemBarInner request"
          style={{ width: boxWidth.req }}
        >
          &nbsp;
        </span>
        <span
          className="networkChartRowItemBarInner response"
          style={{ width: boxWidth.res }}
        >
          &nbsp;
        </span>
      </React.Fragment>
    );
  }
  return null;
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

  // copy URI
  _onDoubleClick = (_event: SyntheticEvent<>): void => {
    // strip marker name to url
    const uri = this._cropNameToUrl(this.props.marker.name);
    // copy url to clipboard
    copy(uri);
  };

  // Remove `Load 123: ` from markers.name
  _cropNameToUrl = (name: string) => {
    const url = name.slice(name.indexOf(':') + 2);
    return url;
  };

  _extractURI = (url: string) => {
    try {
      const uri = new URL(this._cropNameToUrl(url));
      return uri;
    } catch (e) {
      console.error('The network marker has no valid URL.');
      return null;
    }
  };

  // split markers.name in loadID and parts of URL to highlight domain and filename, shorten the rest if needed
  _shortenURI = (name: string) => {
    // Extract loadId from markers.name, e.g. `Load 123:`
    const loadId = name.slice(0, name.indexOf(':') + 2);
    // Extract URI from markers.name
    const uri = this._extractURI(name);
    if (uri !== null) {
      // Extract filename from pathname
      const uriFilename = uri.pathname.slice(uri.pathname.lastIndexOf('/')); // filename.xy
      // Remove filename from pathname
      const uriPath = uri.pathname.replace(uriFilename, '');

      return (
        <span>
          <span className="uriReq">{loadId}</span>
          <span className="uriOpt">{uri.protocol + '//'}</span>
          <span className="uriReq">{uri.hostname}</span>
          {uriPath !== uriFilename && uriPath.length > 0 ? (
            <span className="uriOpt">{uriPath}</span>
          ) : null}
          <span className="uriReq">{uriFilename}</span>
          {uri.search ? <span className="uriOpt">{uri.search}</span> : null}
          {uri.hash ? <span className="uriOpt">{uri.hash}</span> : null}
        </span>
      );
    }
    return name;
  };

  // identifies mime type of request
  // this is a workaround until we have mime types passed from gecko to network marker requests
  _identifyType = (name: string) => {
    const uri = this._extractURI(name);
    if (uri === null) {
      return '';
    }
    // Extract the fileName from the path
    const fileName = uri.pathname;
    const fileExt = fileName.slice(fileName.lastIndexOf('.'));

    switch (fileExt) {
      case '.js':
        return 'js';
      case '.css':
        return 'css';
      case '.gif':
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.svg':
        return 'img';
      case '.html':
        return 'html';
      default:
        return '';
    }
  };

  render() {
    const { index, marker, markerStyle, networkPayload } = this.props;

    const evenOddClassName = index % 2 === 0 ? 'even' : 'odd';

    if (networkPayload === null) {
      return null;
    }
    const itemClassName =
      evenOddClassName +
      ' networkChartRowItem ' +
      this._identifyType(marker.name);

    return (
      <section className={itemClassName}>
        <div
          className="networkChartRowItemLabel"
          onDoubleClick={this._onDoubleClick}
        >
          {this._shortenURI(marker.name)}
        </div>
        <div
          className="networkChartRowItemBar"
          style={markerStyle}
          onMouseEnter={this._hoverIn}
          onMouseLeave={this._hoverOut}
        >
          <NetworkChartRowBar marker={marker} />
        </div>
        {this.state.hovered ? (
          <Tooltip mouseX={this.state.pageX} mouseY={this.state.pageY}>
            <MarkerTooltipContents
              marker={marker}
              threadIndex={this.props.threadIndex}
            />
          </Tooltip>
        ) : null}
      </section>
    );
  }
}

export default NetworkChartRow;
