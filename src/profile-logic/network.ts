/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import type {
  NetworkPhaseName,
  NetworkPhaseAndValue,
  NetworkPayload,
  NetworkStatus,
  NetworkHttpVersion,
} from 'firefox-profiler/types';

/* The preconnect phase may only contain these properties. */
export const PRECONNECT_PHASES_IN_ORDER: NetworkPhaseName[] = [
  'domainLookupStart',
  'domainLookupEnd',
  'connectStart',
  'tcpConnectEnd',
  'secureConnectionStart',
  'connectEnd',
];

/* A marker without a preconnect phase may contain all these properties. */
export const ALL_NETWORK_PHASES_IN_ORDER: NetworkPhaseName[] = [
  'startTime',
  ...PRECONNECT_PHASES_IN_ORDER,
  'requestStart',
  'responseStart',
  'responseEnd',
  'endTime',
];

/* For a marker with a preconnect phase, the second displayed diagram may only
 * contain these properties.
 * We use `splice` to generate this list out of the previous arrays, taking
 * ALL_NETWORK_PHASES_IN_ORDER as source, then removing all the properties
 * of PRECONNECT_PHASES_IN_ORDER starting at index 1 (after 'startTime').
 */
export const REQUEST_PHASES_IN_ORDER: NetworkPhaseName[] =
  ALL_NETWORK_PHASES_IN_ORDER.slice();
REQUEST_PHASES_IN_ORDER.splice(1, PRECONNECT_PHASES_IN_ORDER.length);

export function getHumanReadablePriority(priority: number): string | null {
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

export function getHumanReadableDataStatus(status: NetworkStatus): string {
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

export function getHumanReadableHttpVersion(
  httpVersion: NetworkHttpVersion
): string {
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

/**
 * Properties `connectEnd` and `domainLookupEnd` aren't always present. This
 * function returns the latest one so that we can determine if these phases
 * happen in a preconnect session.
 */
export function getLatestPreconnectPhaseAndValue(
  networkPayload: NetworkPayload
): NetworkPhaseAndValue | null {
  if (typeof networkPayload.connectEnd === 'number') {
    return { phase: 'connectEnd', value: networkPayload.connectEnd };
  }

  if (typeof networkPayload.domainLookupEnd === 'number') {
    return { phase: 'domainLookupEnd', value: networkPayload.domainLookupEnd };
  }

  return null;
}

export function getMatchingPhaseValues(
  networkPayload: NetworkPayload,
  phasesInOrder: NetworkPhaseName[]
): NetworkPhaseAndValue[] {
  const values: NetworkPhaseAndValue[] = [];
  for (const phase of phasesInOrder) {
    if (typeof networkPayload[phase] === 'number') {
      values.push({ phase, value: networkPayload[phase] });
    }
  }
  return values;
}
