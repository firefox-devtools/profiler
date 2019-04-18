/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { TooltipMarker } from '../tooltip/Marker';
import Tooltip from '../tooltip/Tooltip';
import { formatNumber } from '../../utils/format-numbers';

import type { CssPixels } from '../../types/units';
import type { ThreadIndex } from '../../types/profile';
import type { Marker } from '../../types/profile-derived';
import type { NetworkPayload } from '../../types/markers';

// This regexp is used to split a pathname into a directory path and a filename.
// On purpose, when there's no "real" filename, the filename will contain the
// last part of the directory path.
//
// Here are some examples:
// /assets/img/image.jpg -> (/assets/img) (/image.jpg)
// /img/image.jpg        -> (/img)        (/image.jpg)
// /assets/analytics/    -> (/assets)     (/analytics/)
// /analytics/           -> ()            (/analytics/)
// /index.html           -> ()            (/index.html)
//
// Note that this case isn't matched by the regexp:
// /                     -> ()            (/)
//
// It's defined here so that its compilation can be reused.
const PATH_SPLIT_RE = /(.*)(\/[^/]+\/?)$/;

// This array holds the properties we're most interested in in this component:
// - The first timestamp happening in the socket thread is either
//   `domainLookupStart` or `requestStart`, as this depends whether the
//   connection is reused.
// - Between `domainLookupStart` and `requestStart`, both the DNS request and
//   the connection happens.
// - `responseStart` represents the first received information from the server.
// - At last `responseEnd` represents the last received information from the
//   server.
// `responseEnd` isn't the last timestamp as the marker ends with `endTime`:
// `endTime` is the timestamp when the response is delivered to the caller. It's
// not present in this array as it's implicit in the component logic.
// They may be all missing in a specific marker, that's fine.
const PROPERTIES_IN_ORDER = [
  'domainLookupStart',
  'requestStart',
  'responseStart',
  'responseEnd',
];

const PHASE_OPACITIES = PROPERTIES_IN_ORDER.reduce(
  (result, property, i, { length }) => {
    result[property] = length > 1 ? i / (length - 1) : 0;
    return result;
  },
  {}
);

export type NetworkChartRowProps = {
  +index: number,
  +marker: Marker,
  // Pass the payload in as well, since our types can't express a Marker with
  // a specific payload.
  +networkPayload: NetworkPayload | null,
  +markerWidth: CssPixels,
  +startPosition: CssPixels,
  +threadIndex: ThreadIndex,
};

type State = {|
  pageX: CssPixels,
  pageY: CssPixels,
  hovered: ?boolean,
|};

export type NetworkChartRowBarProps = {
  +marker: Marker,
  +markerWidth: CssPixels,
  // Pass the payload in as well, since our types can't express a Marker with
  // a specific payload.
  +networkPayload: NetworkPayload,
};

// This component splits a network marker duration in different phases,
// and renders each phase as a differently colored bar.
const NetworkChartRowBar = (props: NetworkChartRowBarProps) => {
  const { marker, networkPayload, markerWidth } = props;
  const { start, dur } = marker;

  const barPhases = [];
  let previousValue = start;
  let previousName = 'startTime';

  // In this loop we add the various phases to the array.
  PROPERTIES_IN_ORDER.filter(
    property => typeof networkPayload[property] === 'number'
  ).forEach((property, i) => {
    // We force-coerce the value into a number just to appease Flow. Indeed the
    // previous filter ensures that all values are numbers but Flow can't know
    // that.
    const value = +networkPayload[property];
    barPhases.push({
      left: ((previousValue - start) / dur) * markerWidth,
      width: Math.max(((value - previousValue) / dur) * markerWidth, 1),
      opacity: i === 0 ? 0 : PHASE_OPACITIES[property],
      name: property,
      previousName,
      value,
      duration: value - previousValue,
    });
    previousValue = value;
    previousName = property;
  });

  // The last part isn't generally colored (opacity is 0) unless it's the only
  // one, and in that case it covers the whole duration.
  barPhases.push({
    left: ((previousValue - start) / dur) * markerWidth,
    width: ((start + dur - previousValue) / dur) * markerWidth,
    opacity: barPhases.length ? 0 : 1,
    name: 'endTime',
    previousName,
    value: start + dur,
    duration: start + dur - previousValue,
  });

  return (
    <>
      {barPhases.map(({ name, previousName, value, duration, ...style }) => (
        // Specifying data attributes makes it easier to debug.
        <div
          className="networkChartRowItemBarPhase"
          key={name}
          data-name={name}
          data-value={value}
          style={style}
          aria-label={`${previousName} to ${name}: ${formatNumber(
            duration
          )} milliseconds`}
        />
      ))}
    </>
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
      // Extract directory path and filename from pathname.
      let uriFilename = uri.pathname;
      let uriPath = '';

      // See above for more information about this regexp.
      const extractResult = PATH_SPLIT_RE.exec(uri.pathname);
      if (extractResult) {
        [, uriPath, uriFilename] = extractResult;
      }

      return (
        <>
          <span className="networkChartRowItemUriOptional">
            {uri.protocol + '//'}
          </span>
          <span className="networkChartRowItemUriRequired">{uri.hostname}</span>
          {uriPath ? (
            <span className="networkChartRowItemUriOptional">{uriPath}</span>
          ) : null}
          {uriFilename ? (
            <span className="networkChartRowItemUriRequired">
              {uriFilename}
            </span>
          ) : null}
          {uri.search ? (
            <span className="networkChartRowItemUriOptional">{uri.search}</span>
          ) : null}
          {uri.hash ? (
            <span className="networkChartRowItemUriOptional">{uri.hash}</span>
          ) : null}
        </>
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
        return 'networkChartRowItemJs';
      case '.css':
        return 'networkChartRowItemCss';
      case '.gif':
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.svg':
        return 'networkChartRowItemImg';
      case '.html':
        return 'networkChartRowItemHtml';
      default:
        return '';
    }
  }

  render() {
    const {
      index,
      marker,
      markerWidth,
      startPosition,
      networkPayload,
    } = this.props;

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
        <div className="networkChartRowItemLabel">
          {this._splitsURI(marker.name)}
        </div>
        <div
          className="networkChartRowItemBar"
          style={{ width: markerWidth, left: startPosition }}
          onMouseEnter={this._hoverIn}
          onMouseLeave={this._hoverOut}
        >
          <NetworkChartRowBar
            marker={marker}
            networkPayload={networkPayload}
            markerWidth={markerWidth}
          />
        </div>
        {this.state.hovered ? (
          // This magic value "5" avoids the tooltip of being too close of the
          // row, especially when we mouseEnter the row from the top edge.
          <Tooltip mouseX={this.state.pageX} mouseY={this.state.pageY + 5}>
            <TooltipMarker
              className="tooltipNetwork"
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
