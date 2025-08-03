/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import classNames from 'classnames';

import { TooltipMarker } from '../tooltip/Marker';
import { Tooltip } from '../tooltip/Tooltip';

import {
  guessMimeTypeFromNetworkMarker,
  getColorClassNameForMimeType,
} from '../../profile-logic/marker-data';
import { formatNumber } from '../../utils/format-numbers';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import { ensureExists } from '../../utils/flow';

import {
  CssPixels,
  Milliseconds,
  StartEndRange,
  ThreadsKey,
  Marker,
  MarkerIndex,
  NetworkPayload,
  MixedObject,
} from 'firefox-profiler/types';

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

const PHASE_OPACITIES = PROPERTIES_IN_ORDER.reduce(
  (result, property, i, { length }) => {
    (result as any)[property] = length > 1 ? i / (length - 1) : 0;
    return result;
  },
  {} as { [key: string]: number }
);

type NetworkPhaseProps = {
  readonly name: string;
  readonly previousName: string;
  readonly value: number | string;
  readonly duration: Milliseconds;
  readonly style: React.CSSProperties;
};

function NetworkPhase({
  name,
  previousName,
  value,
  duration,
  style,
}: NetworkPhaseProps) {
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
  readonly marker: Marker;
  readonly width: CssPixels;
  readonly timeRange: StartEndRange;
  // Pass the payload in as well, since our types can't express a Marker with
  // a specific payload.
  readonly networkPayload: NetworkPayload;
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

  /**
   * Properties `connectEnd` and `domainLookupEnd` aren't always present. This
   * function returns the latest one so that we can determine if these phases
   * happen in a preconnect session.
   */
  _getLatestPreconnectEndProperty(): 'connectEnd' | 'domainLookupEnd' | null {
    const { networkPayload } = this.props;

    if (typeof networkPayload.connectEnd === 'number') {
      return 'connectEnd';
    }

    if (typeof networkPayload.domainLookupEnd === 'number') {
      return 'domainLookupEnd';
    }

    return null;
  }

  /**
   * This returns the preconnect component, or null if there's no preconnect
   * operation for this marker.
   */
  _preconnectComponent(): React.ReactNode {
    const { networkPayload, marker } = this.props;

    const preconnectStart = networkPayload.domainLookupStart;
    if (typeof preconnectStart !== 'number') {
      // All preconnect operations include a domain lookup part.
      return null;
    }

    // The preconnect bar goes from the start to the end of the whole preconnect
    // operation, that includes both the domain lookup and the connection
    // process. Therefore we want the property that represents the latest phase.
    const latestPreconnectEndProperty = this._getLatestPreconnectEndProperty();
    if (!latestPreconnectEndProperty) {
      return null;
    }

    // We force-coerce the value into a number just to appease Flow. Indeed
    // the previous find operation ensures that all values are numbers but
    // Flow can't know that.
    const preconnectEnd = +(networkPayload as any)[latestPreconnectEndProperty];

    // If the latest phase ends before the start of the marker, we'll display a
    // separate preconnect bar.
    // It could theorically happen that a preconnect session starts before
    // `startTime` but ends after `startTime`; in that case we'll still draw
    // only one bar.
    const hasPreconnect = preconnectEnd < marker.start;
    if (!hasPreconnect) {
      return null;
    }

    const preconnectDuration = preconnectEnd - preconnectStart;
    const preconnectStartPosition = this._timeToCssPixels(preconnectStart);
    const preconnectEndPosition = this._timeToCssPixels(preconnectEnd);
    const preconnectWidth = preconnectEndPosition - preconnectStartPosition;

    const preconnectPhase = {
      name: latestPreconnectEndProperty,
      previousName: 'domainLookupStart',
      value: preconnectEnd,
      duration: preconnectDuration,
      style: {
        left: 0,
        width: '100%',
        opacity: (PHASE_OPACITIES as any).requestStart,
      },
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

  override render() {
    const { marker, networkPayload } = this.props;
    const start = marker.start;
    const end = ensureExists(
      marker.end,
      'Network markers are assumed to have an end time.'
    );
    const dur = end - marker.start;
    // Compute the positioning of this network marker.
    const startPosition = this._timeToCssPixels(start);
    const endPosition = this._timeToCssPixels(end);

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
      (property) => typeof (networkPayload as any)[property] === 'number'
    );

    const mainBarPhases = [];
    let previousValue = start;
    let previousName = 'startTime';

    // In this loop we add the various phases to the array.
    availableProperties.forEach((property, i) => {
      // We force-coerce the value into a number just to appease Flow. Indeed the
      // previous filter ensures that all values are numbers but Flow can't know
      // that.
      const value = +(networkPayload as any)[property];
      mainBarPhases.push({
        name: property,
        previousName,
        value,
        duration: value - previousValue,
        style: {
          left: ((previousValue - start) / dur) * markerWidth,
          width: Math.max(((value - previousValue) / dur) * markerWidth, 1),
          // The first phase is always transparent because this represents the wait time.
          opacity: i === 0 ? 0 : (PHASE_OPACITIES as any)[property],
        },
      });
      previousValue = value;
      previousName = property;
    });

    // The last part isn't generally colored (opacity is 0) unless it's the only
    // one, and in that case it covers the whole duration.
    mainBarPhases.push({
      name: 'endTime',
      previousName,
      value: start + dur,
      duration: start + dur - previousValue,
      style: {
        left: ((previousValue - start) / dur) * markerWidth,
        width: ((start + dur - previousValue) / dur) * markerWidth,
        opacity: mainBarPhases.length ? 0 : 1,
      },
    });

    return (
      <>
        {preconnectComponent}
        <div
          className="networkChartRowItemBar"
          style={{ width: markerWidth, left: startPosition }}
        >
          {mainBarPhases.map((phaseProps) => (
            <NetworkPhase key={phaseProps.name} {...phaseProps} />
          ))}
        </div>
      </>
    );
  }
}

type NetworkChartRowProps = {
  readonly index: number;
  readonly marker: Marker;
  readonly markerIndex: MarkerIndex;
  // Pass the payload in as well, since our types can't express a Marker with
  // a specific payload.
  readonly networkPayload: NetworkPayload;
  readonly timeRange: StartEndRange;
  readonly width: CssPixels;
  readonly threadsKey: ThreadsKey;
  readonly isRightClicked: boolean;
  readonly isSelected: boolean;
  readonly isHoveredFromState: boolean;
  readonly onLeftClick?: (param: MarkerIndex) => mixed;
  readonly onRightClick?: (param: MarkerIndex) => mixed;
  readonly onHover?: (param: MarkerIndex | null) => mixed;
  readonly shouldDisplayTooltips: () => boolean;
};

type State = {
  pageX: CssPixels;
  pageY: CssPixels;
  hovered: boolean | null;
};

export class NetworkChartRow extends React.PureComponent<
  NetworkChartRowProps,
  State
> {
  override state = {
    pageX: 0,
    pageY: 0,
    hovered: false,
  };

  _hoverIn = (event: React.MouseEvent<HTMLDivElement>) => {
    const pageX = event.pageX;
    const pageY = event.pageY;

    this.setState({
      pageX,
      pageY,
      hovered: true,
    });

    if (this.props.onHover) {
      this.props.onHover(this.props.markerIndex);
    }
  };

  _hoverOut = () => {
    // This persistTooltips property is part of the web console API. It helps
    // in being able to inspect and debug tooltips.
    if (!window.persistTooltips) {
      this.setState({
        hovered: false,
      });
    }
  };

  _onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const { markerIndex, onLeftClick, onRightClick } = this.props;
    if (e.button === 0) {
      if (onLeftClick) {
        onLeftClick(markerIndex);
      }
    } else if (e.button === 2) {
      if (onRightClick) {
        onRightClick(markerIndex);
      }
    }
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
    const index = this._findIndexOfLoadid(name);
    const url = name.slice((index ?? -1) + 2);
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
  _splitsURI(name: string): React.ReactNode {
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
          <span className="networkChartRowItemUriRequired">{uri.host}</span>
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
    const mimeType =
      networkPayload.contentType === undefined ||
      networkPayload.contentType === null
        ? guessMimeTypeFromNetworkMarker(networkPayload)
        : networkPayload.contentType;
    return getColorClassNameForMimeType(mimeType);
  }

  override render() {
    const {
      index,
      markerIndex,
      marker,
      networkPayload,
      width,
      timeRange,
      isRightClicked,
      shouldDisplayTooltips,
      isSelected,
      isHoveredFromState,
    } = this.props;

    if (networkPayload === null) {
      return null;
    }

    // Generates className for a row
    const itemClassName = classNames(
      'networkChartRowItem',
      this._getClassNameTypeForMarker(),
      {
        odd: index % 2 === 1,
        isRightClicked,
        isSelected,
        isHovered: isHoveredFromState,
      }
    );

    return (
      <div
        // The className below is responsible for the blue hover effect
        className={itemClassName}
        onMouseEnter={this._hoverIn}
        onMouseLeave={this._hoverOut}
        onMouseDown={this._onMouseDown}
        aria-selected={isSelected}
        aria-label={marker.name}
        role="option"
        id={`networkChartRowItem-${markerIndex}`}
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
        {shouldDisplayTooltips() && this.state.hovered ? (
          // This magic value "5" avoids the tooltip of being too close of the
          // row, especially when we mouseEnter the row from the top edge.
          <Tooltip mouseX={this.state.pageX} mouseY={this.state.pageY + 5}>
            <TooltipMarker
              className="tooltipNetwork"
              markerIndex={markerIndex}
              marker={marker}
              threadsKey={this.props.threadsKey}
              restrictHeightWidth={true}
            />
          </Tooltip>
        ) : null}
      </div>
    );
  }
}
