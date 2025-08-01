/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file contains actions related to error handling.

import { Action } from 'firefox-profiler/types';

export function fatalError(error: Error): Action {
  return {
    type: 'FATAL_ERROR',
    error,
  };
}
