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
  formatMarkerScreenshotResult,
  formatScreenshotsResult,
  formatProfileInfoResult,
  formatProfileMetaResult,
  formatThreadSamplesResult,
  formatThreadSamplesTopDownResult,
  formatThreadSamplesBottomUpResult,
  formatThreadMarkersResult,
  formatThreadFunctionsResult,
  formatThreadNetworkResult,
  formatProfileLogsResult,
  formatThreadPageLoadResult,
  formatThreadSelectResult,
  formatCounterListResult,
  formatCounterInfoResult,
  formatSourceMapSourcesResult,
  formatApplySourceMapResult,
} from './formatters';

/**
 * Serialize a JSON payload that is not a `CommandResult`.
 *
 * The screenshot commands reshape their result before printing `--json`: the
 * image bytes are elided and the written file paths added. That shape is
 * deliberately not a `CommandResult`, so it cannot go through `formatOutput`,
 * whose switch must stay exhaustive over the text formatters.
 */
export function formatJson(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

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
    case 'marker-screenshot':
      return formatMarkerScreenshotResult(result);
    case 'screenshots':
      return formatScreenshotsResult(result);
    case 'profile-info':
      return formatProfileInfoResult(result);
    case 'profile-meta':
      return formatProfileMetaResult(result);
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
    case 'counter-list':
      return formatCounterListResult(result);
    case 'counter-info':
      return formatCounterInfoResult(result);
    case 'sourcemap-sources':
      return formatSourceMapSourcesResult(result);
    case 'sourcemap-applied':
    case 'sourcemap-unchanged':
    case 'sourcemap-ambiguous':
    case 'sourcemap-error':
      return formatApplySourceMapResult(result);
    default:
      throw assertExhaustiveCheck(result);
  }
}
