/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Output formatting for profiler-cli commands.
 */

import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import type { CommandResult } from './protocol';
import {
  formatStatusResult,
  formatFunctionExpandResult,
  formatFunctionInfoResult,
  formatFunctionAnnotateResult,
  formatViewRangeResult,
  formatFilterStackResult,
  formatThreadInfoResult,
  formatMarkerStackResult,
  formatMarkerInfoResult,
  formatProfileInfoResult,
  formatThreadSamplesResult,
  formatThreadSamplesTopDownResult,
  formatThreadSamplesBottomUpResult,
  formatThreadMarkersResult,
  formatThreadFunctionsResult,
  formatThreadNetworkResult,
  formatProfileLogsResult,
  formatThreadPageLoadResult,
  formatThreadSelectResult,
} from './formatters';

/**
 * Format a command result for output.
 * If jsonFlag is true, outputs JSON. Otherwise outputs as plain text.
 */
export function formatOutput(
  result: string | CommandResult,
  jsonFlag: boolean
): string {
  if (jsonFlag) {
    if (typeof result === 'string') {
      return JSON.stringify({ type: 'text', result }, null, 2);
    }
    return JSON.stringify(result, null, 2);
  }

  if (typeof result === 'string') {
    return result;
  }

  switch (result.type) {
    case 'status':
      return formatStatusResult(result);
    case 'filter-stack':
      return formatFilterStackResult(result);
    case 'function-expand':
      return formatFunctionExpandResult(result);
    case 'function-info':
      return formatFunctionInfoResult(result);
    case 'function-annotate':
      return formatFunctionAnnotateResult(result);
    case 'view-range':
      return formatViewRangeResult(result);
    case 'thread-info':
      return formatThreadInfoResult(result);
    case 'marker-stack':
      return formatMarkerStackResult(result);
    case 'marker-info':
      return formatMarkerInfoResult(result);
    case 'profile-info':
      return formatProfileInfoResult(result);
    case 'thread-samples':
      return formatThreadSamplesResult(result);
    case 'thread-samples-top-down':
      return formatThreadSamplesTopDownResult(result);
    case 'thread-samples-bottom-up':
      return formatThreadSamplesBottomUpResult(result);
    case 'thread-markers':
      return formatThreadMarkersResult(result);
    case 'thread-functions':
      return formatThreadFunctionsResult(result);
    case 'thread-network':
      return formatThreadNetworkResult(result);
    case 'profile-logs':
      return formatProfileLogsResult(result);
    case 'thread-page-load':
      return formatThreadPageLoadResult(result);
    case 'thread-select':
      return formatThreadSelectResult(result);
    default:
      throw assertExhaustiveCheck(result);
  }
}
