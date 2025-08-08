/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

export type NetworkHttpVersion = 'h3' | 'h2' | 'http/1.1' | 'http/1.0';

export type NetworkStatus =
  | 'STATUS_START'
  | 'STATUS_STOP'
  | 'STATUS_REDIRECT'
  | 'STATUS_CANCEL';

export type NetworkRedirectType = 'Permanent' | 'Temporary' | 'Internal';

export type NetworkPhaseName =
  | 'startTime'
  | 'domainLookupStart'
  | 'domainLookupEnd'
  | 'connectStart'
  | 'tcpConnectEnd'
  | 'secureConnectionStart'
  | 'connectEnd'
  | 'requestStart'
  | 'responseStart'
  | 'responseEnd'
  | 'endTime';

export type NetworkPhaseAndValue = {|
  phase: NetworkPhaseName,
  value: number,
|};
