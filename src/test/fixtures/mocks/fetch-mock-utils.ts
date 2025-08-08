/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { CallLog } from 'fetch-mock';

export type RouteRequest = CallLog & {
  options: RequestInit & {
    method: string;
    body?: string;
    headers: {
      ['content-type']?: string;
      accept?: string;
      authorization?: string;
    };
  };
};
