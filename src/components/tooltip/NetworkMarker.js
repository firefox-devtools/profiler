/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import { TooltipDetails, TooltipDetail } from './TooltipDetails';
import { formatBytes, formatMilliseconds } from '../../utils/format-numbers';

import type { NetworkPayload } from '../../types/markers';

function _makePriorityHumanReadable(label: string, priority: number): * {
  if (typeof priority !== 'number') {
    return null;
  }

  let prioLabel: string = '';

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

  prioLabel = prioLabel + '(' + priority + ')';
  return (
    <TooltipDetail key={label} label={label}>
      {prioLabel}
    </TooltipDetail>
  );
}

function _dataStatusReplace(str: string): string {
  switch (str) {
    case 'STATUS_START': {
      return 'Waiting for response';
    }
    case 'STATUS_READ': {
      return 'Reading request';
    }
    case 'STATUS_STOP': {
      return 'Response received';
    }
    case 'STATUS_REDIRECT': {
      return 'Redirecting request';
    }
    default: {
      return 'other';
    }
  }
}

function _markerDetailBytesNullable(label: string, value: ?number): * {
  if (typeof value !== 'number') {
    return null;
  }
  return (
    <TooltipDetail key={label} label={label}>
      {formatBytes(value)}
    </TooltipDetail>
  );
}

function _markerDetailDeltaTimeNullable(
  label: string,
  value1?: number,
  value2?: number
): * {
  if (
    value1 === undefined ||
    value2 === undefined ||
    value1 === null ||
    value2 === null
  ) {
    return null;
  }
  const valueResult = value1 - value2;
  return (
    <TooltipDetail key={label} label={label}>
      {formatMilliseconds(valueResult)}
    </TooltipDetail>
  );
}

type Props = {|
  +payload: NetworkPayload,
|};

export class TooltipNetworkMarker extends React.PureComponent<Props> {
  render() {
    const { payload } = this.props;
    if (
      payload.status !== 'STATUS_STOP' &&
      payload.status !== 'STATUS_REDIRECT'
    ) {
      return (
        <TooltipDetails>
          <TooltipDetail label="Status">
            {_dataStatusReplace(payload.status)}
          </TooltipDetail>
          <TooltipDetail label="URL">{payload.URI}</TooltipDetail>
          {_makePriorityHumanReadable('Priority', payload.pri)}
          {_markerDetailBytesNullable('Requested bytes', payload.count)}
        </TooltipDetails>
      );
    }
    return (
      <TooltipDetails>
        <TooltipDetail label="Status">
          {_dataStatusReplace(payload.status)}
        </TooltipDetail>
        <TooltipDetail label="Cache">{payload.cache}</TooltipDetail>
        <TooltipDetail label="URL">{payload.URI}</TooltipDetail>
        <TooltipDetail label="Redirect URL">
          {payload.RedirectURI}
        </TooltipDetail>
        {_makePriorityHumanReadable('Priority', payload.pri)}
        {_markerDetailBytesNullable('Requested bytes', payload.count)}
        {_markerDetailDeltaTimeNullable(
          'Domain lookup in total',
          payload.domainLookupEnd,
          payload.domainLookupStart
        )}
        {_markerDetailDeltaTimeNullable(
          'Connection in total',
          payload.connectEnd,
          payload.connectStart
        )}
        {_markerDetailDeltaTimeNullable(
          'TCP connection in total',
          payload.tcpConnectEnd,
          payload.connectStart
        )}
        {_markerDetailDeltaTimeNullable(
          'Start of secure connection at',
          payload.secureConnectionStart,
          payload.tcpConnectEnd
        )}
        {_markerDetailDeltaTimeNullable(
          'Start of request at',
          payload.requestStart,
          payload.connectStart
        )}
        {_markerDetailDeltaTimeNullable(
          'Response time',
          payload.responseEnd,
          payload.responseStart
        )}
      </TooltipDetails>
    );
  }
}
