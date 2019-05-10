/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import classNames from 'classnames';

import { TooltipMarker } from '../tooltip/Marker';
import Tooltip from '../tooltip/Tooltip';

import {
  guessMimeTypeFromNetworkMarker,
  getColorClassNameForMimeType,
} from '../../profile-logic/marker-data';
import { formatNumber } from '../../utils/format-numbers';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';

import type { CssPixels, Milliseconds, StartEndRange } from '../../types/units';
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
//   Note that we never have connection-related properties without
//   domainLookup-related properties, but we do have domainLookup-related
//   properties without connection-related properties. So we only consider
//   `domainLookupStart` to represent this whole connection phase.
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

// When the DNS request and the connection happen in a preconnect phase, the
// timestamps for these properties will happen before `startTime`.
// These properties represent respectively two possible ends of a preconnect
// session. They're specified in their reverse order because we'll want to find
// the latest one first.
// It could theorically happen that a preconnect session starts before
// `startTime` but ends after `startTime`; in that case we'll still draw only
// one bar.
const PRECONNECT_END_PROPERTIES = ['connectEnd', 'domainLookupEnd'];

const PHASE_OPACITIES = PROPERTIES_IN_ORDER.reduce(
  (result, property, i, { length }) => {
    result[property] = length > 1 ? i / (length - 1) : 0;
    return result;
  },
  {}
);

function NetworkPhase({ name, previousName, value, duration, ...style }) {
  // Specifying data attributes makes it easier to debug.
  return (
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
  );
}

export type NetworkChartRowBarProps = {
  +marker: Marker,
  +width: CssPixels,
  +timeRange: StartEndRange,
  // Pass the payload in as well, since our types can't express a Marker with
  // a specific payload.
  +networkPayload: NetworkPayload,
};

// This component splits a network marker duration in different phases,
// and renders each phase as a differently colored bar.
class NetworkChartRowBar extends React.PureComponent<NetworkChartRowBarProps> {
  /**
   * Convert the time for a network marker into the CssPixels to be used on the screen.
   * This function takes into account the range used, as well as the container sizing
   * as passed in by the WithSize component.
   */
  _timeToCssPixels(time: Milliseconds): CssPixels {
    const { timeRange, width } = this.props;
    const timeRangeTotal = timeRange.end - timeRange.start;
    const innerContainerWidth =
      width - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT;

    const markerPosition =
      ((time - timeRange.start) / timeRangeTotal) * innerContainerWidth +
      TIMELINE_MARGIN_LEFT;

    return markerPosition;
  }

  _preconnectComponent(): React.Node {
    const { networkPayload, marker } = this.props;

    const preconnectStart = networkPayload.domainLookupStart;
    if (typeof preconnectStart !== 'number') {
      // All preconnect operations include a domain lookup part.
      return null;
    }

    // The preconnect bar goes from the start to the end of the whole preconnect
    // operation, that includes both the domain lookup and the connection
    // process. Therefore we want the property that represents the latest phase.
    const latestPreconnectEndProperty = PRECONNECT_END_PROPERTIES.find(
      property => typeof networkPayload[property] === 'number'
    );

    if (!latestPreconnectEndProperty) {
      return null;
    }

    // We force-coerce the value into a number just to appease Flow. Indeed
    // the previous find operation ensures that all values are numbers but
    // Flow can't know that.
    const preconnectEnd = +networkPayload[latestPreconnectEndProperty];

    // If the latest phase ends before the start of the marker, we'll display a
    // separate preconnect bar.
    const hasPreconnect = preconnectEnd < marker.start;
    if (!hasPreconnect) {
      return null;
    }

    const preconnectDuration = preconnectEnd - preconnectStart;
    const preconnectStartPosition = this._timeToCssPixels(preconnectStart);
    const preconnectEndPosition = this._timeToCssPixels(preconnectEnd);
    const preconnectWidth = preconnectEndPosition - preconnectStartPosition;

    const preconnectPhase = {
      left: 0,
      width: '100%',
      opacity: PHASE_OPACITIES.requestStart,
      name: latestPreconnectEndProperty,
      previousName: 'domainLookupStart',
      value: preconnectEnd,
      duration: preconnectDuration,
    };

    return (
      <div
        className="networkChartRowItemBar"
        style={{ width: preconnectWidth, left: preconnectStartPosition }}
      >
        {NetworkPhase(preconnectPhase)}
      </div>
    );
  }

  render() {
    const {
      marker: { start, dur },
      networkPayload,
    } = this.props;

    // Compute the positioning of this network marker.
    const startPosition = this._timeToCssPixels(start);
    const endPosition = this._timeToCssPixels(start + dur);

    // Set min-width for marker bar.
    let markerWidth = endPosition - startPosition;
    if (markerWidth < 1) {
      markerWidth = 2.5;
    }

    const preconnectComponent = this._preconnectComponent();

    // Compute the phases for this marker.

    // If there's a preconnect phase, we remove `domainLookupStart` from the
    // main bar, but we'll draw a separate bar to represent it.
    const mainBarProperties = preconnectComponent
      ? PROPERTIES_IN_ORDER.slice(1)
      : PROPERTIES_IN_ORDER;

    // Not all properties are always present.
    const availableProperties = mainBarProperties.filter(
      property => typeof networkPayload[property] === 'number'
    );

    const mainBarPhases = [];
    let previousValue = start;
    let previousName = 'startTime';

    // In this loop we add the various phases to the array.
    availableProperties.forEach((property, i) => {
      // We force-coerce the value into a number just to appease Flow. Indeed the
      // previous filter ensures that all values are numbers but Flow can't know
      // that.
      const value = +networkPayload[property];
      mainBarPhases.push({
        left: ((previousValue - start) / dur) * markerWidth,
        width: Math.max(((value - previousValue) / dur) * markerWidth, 1),
        // The first phase is always transparent because this represents the wait time.
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
    mainBarPhases.push({
      left: ((previousValue - start) / dur) * markerWidth,
      width: ((start + dur - previousValue) / dur) * markerWidth,
      opacity: mainBarPhases.length ? 0 : 1,
      name: 'endTime',
      previousName,
      value: start + dur,
      duration: start + dur - previousValue,
    });

    return (
      <>
        {preconnectComponent}
        <div
          className="networkChartRowItemBar"
          style={{ width: markerWidth, left: startPosition }}
        >
          {mainBarPhases.map(NetworkPhase)}
        </div>
      </>
    );
  }
}

type NetworkChartRowProps = {
  +index: number,
  +marker: Marker,
  // Pass the payload in as well, since our types can't express a Marker with
  // a specific payload.
  +networkPayload: NetworkPayload,
  +timeRange: StartEndRange,
  +width: CssPixels,
  +threadIndex: ThreadIndex,
};

type State = {|
  pageX: CssPixels,
  pageY: CssPixels,
  hovered: ?boolean,
|};

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

  _getClassNameTypeForMarker() {
    const { networkPayload } = this.props;
    const mimeType = guessMimeTypeFromNetworkMarker(networkPayload);
    return getColorClassNameForMimeType(mimeType);
  }

  render() {
    const { index, marker, networkPayload, width, timeRange } = this.props;

    if (networkPayload === null) {
      return null;
    }

    const itemClassName = classNames(
      'networkChartRowItem',
      this._getClassNameTypeForMarker(),
      { odd: index % 2 === 1 }
    );

    return (
      <div
        className={itemClassName}
        onMouseEnter={this._hoverIn}
        onMouseLeave={this._hoverOut}
      >
        <div className="networkChartRowItemLabel">
          {this._splitsURI(marker.name)}
        </div>
        <NetworkChartRowBar
          marker={marker}
          networkPayload={networkPayload}
          width={width}
          timeRange={timeRange}
        />
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
      </div>
    );
  }
}

export default NetworkChartRow;
