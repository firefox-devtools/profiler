/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';

import { TooltipDetail, type TooltipDetailComponent } from './TooltipDetails';
import {
  getColorClassNameForMimeType,
  guessMimeTypeFromNetworkMarker,
} from 'firefox-profiler/profile-logic/marker-data';
import {
  formatBytes,
  formatNumber,
  formatMilliseconds,
} from 'firefox-profiler/utils/format-numbers';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  NetworkHttpVersion,
  NetworkPayload,
  NetworkStatus,
  Milliseconds,
} from 'firefox-profiler/types';

import './NetworkMarker.css';

function _getHumanReadablePriority(priority: number): string | null {
  if (typeof priority !== 'number') {
    return null;
  }

  let prioLabel = null;

  // https://searchfox.org/mozilla-central/source/xpcom/threads/nsISupportsPriority.idl#24-28
  if (priority < -10) {
    prioLabel = 'Highest';
  } else if (priority >= -10 && priority < 0) {
    prioLabel = 'High';
  } else if (priority === 0) {
    prioLabel = 'Normal';
  } else if (priority <= 10 && priority > 0) {
    prioLabel = 'Low';
  } else if (priority > 10) {
    prioLabel = 'Lowest';
  }

  if (!prioLabel) {
    return null;
  }

  return prioLabel + '(' + priority + ')';
}

function _getHumanReadableDataStatus(status: NetworkStatus): string {
  switch (status) {
    case 'STATUS_START':
      return 'Waiting for response';
    case 'STATUS_STOP':
      return 'Response received';
    case 'STATUS_REDIRECT':
      return 'Redirecting request';
    case 'STATUS_CANCEL':
      return 'Request was canceled';
    default:
      throw assertExhaustiveCheck(status);
  }
}

function _getHumanReadableHttpVersion(httpVersion: NetworkHttpVersion): string {
  switch (httpVersion) {
    case 'h3':
      return '3';
    case 'h2':
      return '2';
    case 'http/1.0':
      return '1.0';
    case 'http/1.1':
      return '1.1';
    default:
      throw assertExhaustiveCheck(
        httpVersion,
        `Unknown received HTTP version ${httpVersion}`
      );
  }
}

/* The preconnect phase may only contain these properties. */
const PRECONNECT_PROPERTIES_IN_ORDER = [
  'domainLookupStart',
  'domainLookupEnd',
  'connectStart',
  'tcpConnectEnd',
  'secureConnectionStart',
  'connectEnd',
];

/* A marker without a preconnect phase may contain all these properties. */
const ALL_NETWORK_PROPERTIES_IN_ORDER = [
  'startTime',
  ...PRECONNECT_PROPERTIES_IN_ORDER,
  'requestStart',
  'responseStart',
  'responseEnd',
  'endTime',
];

/* For a marker with a preconnect phase, the second displayed diagram may only
 * contain these properties.
 * We use `splice` to generate this list out of the previous arrays, taking
 * ALL_NETWORK_PROPERTIES_IN_ORDER as source, then removing all the properties
 * of PRECONNECT_PROPERTIES_IN_ORDER.
 */
const REQUEST_PROPERTIES_IN_ORDER = ALL_NETWORK_PROPERTIES_IN_ORDER.slice();
REQUEST_PROPERTIES_IN_ORDER.splice(1, PRECONNECT_PROPERTIES_IN_ORDER.length);

/* The labels are for the duration between _this_ label and the next label. */
const PROPERTIES_HUMAN_LABELS = {
  startTime: 'Waiting for socket thread',
  domainLookupStart: 'DNS request',
  domainLookupEnd: 'After DNS request',
  connectStart: 'TCP connection',
  tcpConnectEnd: 'After TCP connection',
  secureConnectionStart: 'Establishing TLS session',
  connectEnd: 'Waiting for HTTP request',
  requestStart: 'HTTP request and waiting for response',
  responseStart: 'HTTP response',
  responseEnd: 'Waiting to transmit the response',
  endTime: 'End',
};

const NETWORK_PROPERTY_OPACITIES = {
  startTime: 0,
  domainLookupStart: 0.5,
  domainLookupEnd: 0.5,
  connectStart: 0.5,
  tcpConnectEnd: 0.5,
  secureConnectionStart: 0.5,
  connectEnd: 0.5,
  requestStart: 0.75,
  responseStart: 1,
  responseEnd: 0,
  endTime: 0,
};

type NetworkPhaseProps = {
  readonly propertyName: string,
  readonly dur: Milliseconds,
  readonly startPosition: Milliseconds,
  readonly phaseDuration: Milliseconds,
};

class NetworkPhase extends React.PureComponent<NetworkPhaseProps> {
  render() {
    const { startPosition, dur, propertyName, phaseDuration } = this.props;
    const startPositionPercent = (startPosition / dur) * 100;
    const durationPercent = Math.max(0.3, (phaseDuration / dur) * 100);
    const opacity = NETWORK_PROPERTY_OPACITIES[propertyName];

    return (
      <React.Fragment>
        <div className="tooltipLabel">
          {PROPERTIES_HUMAN_LABELS[propertyName]}:
        </div>
        <div
          aria-label={`Starting at ${formatNumber(
            startPosition
          )} milliseconds, duration is ${formatNumber(
            phaseDuration
          )} milliseconds`}
        >
          {formatMilliseconds(phaseDuration)}
        </div>
        <div
          className={classNames('tooltipNetworkPhase', {
            tooltipNetworkPhaseEmpty: opacity === 0,
          })}
          aria-hidden="true"
          style={{
            marginLeft: startPositionPercent + '%',
            marginRight: 100 - startPositionPercent - durationPercent + '%',
            opacity: opacity === 0 ? null : opacity,
          }}
        />
      </React.Fragment>
    );
  }
}

type Props = {
  readonly payload: NetworkPayload,
  readonly zeroAt: Milliseconds,
};

export class TooltipNetworkMarkerPhases extends React.PureComponent<Props> {
  _getPhasesForProperties(
    properties: string[],
    sectionDuration: Milliseconds,
    startTime: Milliseconds
  ): Array<React.Element<typeof NetworkPhase>> | null {
    if (properties.length < 2) {
      console.error(
        'Only 1 preconnect property has been found, this should not happen.'
      );
      return null;
    }

    const { payload } = this.props;
    const phases = [];

    for (let i = 1; i < properties.length; i++) {
      const thisProperty = properties[i];
      const previousProperty = properties[i - 1];
      // We force-coerce the values into numbers just to appease Flow. Indeed the
      // previous filter ensures that all values are numbers but Flow can't know
      // that.
      const startValue = +payload[previousProperty];
      const endValue = +payload[thisProperty];
      const phaseDuration = endValue - startValue;
      const startPosition = startValue - startTime;

      phases.push(
        <NetworkPhase
          key={previousProperty}
          propertyName={previousProperty}
          startPosition={startPosition}
          phaseDuration={phaseDuration}
          dur={sectionDuration}
        />
      );
    }

    return phases;
  }

  /**
   * Properties `connectEnd` and `domainLookupEnd` aren't always present. This
   * function returns the value for the latest one so that we can determine if
   * these phases happen in a preconnect session.
   */
  _getLatestPreconnectValue(): number | null {
    const { payload } = this.props;

    if (typeof payload.connectEnd === 'number') {
      return payload.connectEnd;
    }

    if (typeof payload.domainLookupEnd === 'number') {
      return payload.domainLookupEnd;
    }

    return null;
  }

  _renderPreconnectPhases(): React.Node {
    const { payload, zeroAt } = this.props;
    const preconnectStart = payload.domainLookupStart;
    if (typeof preconnectStart !== 'number') {
      // All preconnect operations include a domain lookup part.
      return null;
    }

    // The preconnect bar goes from the start to the end of the whole preconnect
    // operation, that includes both the domain lookup and the connection
    // process. Therefore we want the value that represents the latest phase.
    const preconnectEnd = this._getLatestPreconnectValue();
    if (preconnectEnd === null) {
      return null;
    }

    // If the latest phase ends before the start of the marker, we'll display a
    // separate preconnect section.
    // It could theorically happen that a preconnect session starts before
    // `startTime` but ends after `startTime`; in that case we'll still draw
    // only one diagram.
    const hasPreconnect = preconnectEnd < payload.startTime;
    if (!hasPreconnect) {
      return null;
    }

    const availableProperties = PRECONNECT_PROPERTIES_IN_ORDER.filter(
      (property) => typeof payload[property] === 'number'
    );
    const dur = preconnectEnd - preconnectStart;

    const phases = this._getPhasesForProperties(
      availableProperties,
      dur,
      preconnectStart
    );

    return (
      <>
        <h3 className="tooltipNetworkTitle3">
          Preconnect (starting at {formatMilliseconds(preconnectStart - zeroAt)}
          )
        </h3>
        {phases}
      </>
    );
  }

  render() {
    const { payload } = this.props;
    const mimeType =
      payload.contentType || guessMimeTypeFromNetworkMarker(payload);
    const markerColorClass = getColorClassNameForMimeType(mimeType);

    if (payload.status === 'STATUS_START') {
      return null;
    }

    const preconnectPhases = this._renderPreconnectPhases();
    const networkProperties = preconnectPhases
      ? REQUEST_PROPERTIES_IN_ORDER
      : ALL_NETWORK_PROPERTIES_IN_ORDER;

    const availableProperties = networkProperties.filter(
      (property) => typeof payload[property] === 'number'
    );

    if (availableProperties.length === 0 || availableProperties.length === 1) {
      // This shouldn't happen as we should always have both startTime and endTime.
      return null;
    }

    const dur = payload.endTime - payload.startTime;
    if (availableProperties.length === 2) {
      // We only have startTime and endTime.
      return (
        <div className={`tooltipNetworkPhases ${markerColorClass}`}>
          <NetworkPhase
            propertyName="responseStart"
            startPosition={0}
            phaseDuration={dur}
            dur={dur}
          />
        </div>
      );
    }

    // Looks like availableProperties.length >= 3.
    const phases = this._getPhasesForProperties(
      availableProperties,
      dur,
      payload.startTime
    );
    return (
      // We render both phase sections in the same grid so that they're aligned
      // and the bar widths have the same reference.
      <div className={`tooltipNetworkPhases ${markerColorClass}`}>
        {preconnectPhases ? (
          <>
            {/* Note: preconnectPhases contains its own title */}
            {preconnectPhases}
            <h3 className="tooltipNetworkTitle3">Actual request</h3>
          </>
        ) : null}
        {phases}
      </div>
    );
  }
}

/**
 * This function bypasses the Marker schema, and uses its own formatting to display
 * the Network details.
 */
export function getNetworkMarkerDetails(
  payload: NetworkPayload
): TooltipDetailComponent[] {
  let mimeType = payload.contentType;
  let mimeTypeLabel = 'MIME type';
  if (mimeType === undefined || mimeType === null) {
    mimeType = guessMimeTypeFromNetworkMarker(payload);
    mimeTypeLabel = 'Guessed MIME type';
  }
  const markerColorClass = getColorClassNameForMimeType(mimeType);
  const details = [];

  details.push(
    <TooltipDetail label="Status" key="Network-Status">
      {_getHumanReadableDataStatus(payload.status)}
    </TooltipDetail>
  );
  if (payload.redirectType !== undefined) {
    details.push(
      <TooltipDetail label="Redirection type" key="Redirection-Type">
        {payload.redirectType +
          (payload.isHttpToHttpsRedirect ? ' (HTTP to HTTPS)' : '')}
      </TooltipDetail>
    );
  }

  details.push(
    <TooltipDetail label="Cache" key="Network-Cache">
      {payload.cache}
    </TooltipDetail>,
    <TooltipDetail label="URL" key="Network-URL">
      <span className="tooltipDetailsUrl">{payload.URI}</span>
    </TooltipDetail>
  );

  if (payload.RedirectURI) {
    details.push(
      <TooltipDetail label="Redirect URL" key="Network-Redirect URL">
        <span className="tooltipDetailsUrl">{payload.RedirectURI}</span>
      </TooltipDetail>
    );
  }

  details.push(
    <TooltipDetail label="Priority" key="Network-Priority">
      {_getHumanReadablePriority(payload.pri)}
    </TooltipDetail>
  );

  if (mimeType) {
    details.push(
      <TooltipDetail label={mimeTypeLabel} key={'Network-' + mimeTypeLabel}>
        <div className="tooltipNetworkMimeType">
          <span
            className={`tooltipNetworkMimeTypeSwatch colored-square ${markerColorClass}`}
            title={mimeType}
          />
          {mimeType}
        </div>
      </TooltipDetail>
    );
  }

  if (payload.isPrivateBrowsing) {
    details.push(
      <TooltipDetail label="Private Browsing" key="Network-Private Browsing">
        Yes
      </TooltipDetail>
    );
  }

  if (typeof payload.count === 'number') {
    details.push(
      <TooltipDetail label="Requested bytes" key="Network-Requested Bytes">
        {formatBytes(payload.count)}
      </TooltipDetail>
    );
  }

  if (payload.httpVersion) {
    details.push(
      <TooltipDetail label="HTTP Version" key="Network-HTTP Version">
        {_getHumanReadableHttpVersion(payload.httpVersion)}
      </TooltipDetail>
    );
  }

  if (payload.classOfService) {
    details.push(
      <TooltipDetail label="Class of Service" key="Network-Class of Service">
        {payload.classOfService}
      </TooltipDetail>
    );
  }

  if (payload.requestStatus) {
    details.push(
      <TooltipDetail label="Request Status" key="Network-Request Status">
        {payload.requestStatus}
      </TooltipDetail>
    );
  }

  if (payload.responseStatus) {
    details.push(
      <TooltipDetail label="Response Status Code" key="Network-Response Status">
        {payload.responseStatus}
      </TooltipDetail>
    );
  }

  return details;
}
