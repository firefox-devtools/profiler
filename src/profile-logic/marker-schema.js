/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  formatNumber,
  formatPercent,
  formatBytes,
  formatSeconds,
  formatMilliseconds,
  formatTimestamp,
  formatMicroseconds,
  formatNanoseconds,
} from '../utils/format-numbers';
import type { MarkerFormatType } from 'firefox-profiler/types';

/**
 * TODO - These will eventually be stored in the profile, but for now
 * define them here.
 */
export const markerSchema = [
  {
    name: 'Bailout',
    display: ['marker-chart', 'marker-table'],
    data: [
      { key: 'bailoutType', label: 'Type', format: 'string' },
      { key: 'where', label: 'Where', format: 'string' },
      { key: 'script', label: 'Script', format: 'string' },
      { key: 'functionLine', label: 'Function Line', format: 'integer' },
      { key: 'bailoutLine', label: 'Bailout Line', format: 'integer' },
    ],
  },
  {
    name: 'GCMajor',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    data: [
      // Use custom handling
    ],
  },
  {
    name: 'GCMinor',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    data: [
      // Use custom handling
    ],
  },
  {
    name: 'GCSlice',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    data: [
      // Use custom handling
    ],
  },
  {
    name: 'CC',
    label: 'Cycle Collect',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    data: [],
  },
  {
    name: 'FileIO',
    display: [],
    data: [
      {
        key: 'operation',
        label: 'Operation',
        format: 'string',
        searchable: true,
      },
      {
        key: 'source',
        label: 'Source',
        format: 'string',
        searchable: true,
      },
      {
        key: 'filename',
        label: 'Filename',
        format: 'file-path',
        searchable: true,
      },
    ],
  },
  {
    name: 'MediaSample',
    display: ['marker-chart', 'marker-table'],
    data: [
      {
        key: 'sampleStartTimeUs',
        label: 'Sample start time',
        format: 'microseconds',
      },
      {
        key: 'sampleEndTimeUs',
        label: 'Sample end time',
        format: 'microseconds',
      },
    ],
  },
  {
    name: 'Styles',
    display: ['marker-chart', 'marker-table'],
    data: [
      {
        key: 'elementsTraversed',
        label: 'Elements traversed',
        format: 'integer',
      },
      { key: 'elementsStyled', label: 'Elements styled', format: 'integer' },
      { key: 'elementsMatched', label: 'Elements matched', format: 'integer' },
      { key: 'stylesShared', label: 'Styles shared', format: 'integer' },
      { key: 'stylesReused', label: 'Styles reused', format: 'integer' },
    ],
  },
  {
    name: 'PreferenceRead',
    display: ['marker-chart', 'marker-table'],
    data: [
      { key: 'prefName', label: 'Name', format: 'string' },
      { key: 'prefKind', label: 'Kind', format: 'string' },
      { key: 'prefType', label: 'Type', format: 'string' },
      { key: 'prefValue', label: 'Value', format: 'string' },
    ],
  },
  {
    name: 'Invalidation',
    display: ['marker-chart', 'marker-table'],
    data: [
      { key: 'url', label: 'URL', format: 'url' },
      { key: 'line', label: 'Line', format: 'integer' },
    ],
  },
  {
    name: 'UserTiming',
    display: ['marker-chart', 'marker-table'],
    data: [{ key: 'name', label: 'Name', format: 'string' }],
  },
  {
    name: 'Text',
    display: ['marker-chart', 'marker-table'],
    data: [{ key: 'name', label: 'Details', format: 'string' }],
  },
  {
    name: 'Log',
    display: ['marker-table'],
    data: [
      { key: 'module', label: 'Module', format: 'string' },
      { key: 'name', label: 'Name', format: 'string' },
    ],
  },
  {
    name: 'tracing',
    display: ['marker-chart', 'marker-table'],
    data: [
      // This is really the "type" of the marker.
      { key: 'category', label: 'Category', format: 'string' },
    ],
  },
  {
    name: 'IPC',
    display: ['marker-chart', 'marker-table'],
    data: [
      { key: 'messageType', label: 'Type', format: 'string' },
      { key: 'sync', label: 'Sync', format: 'string' },
    ],
  },
];

/**
 * This function takes the intended marker schema for a marker field, and applies
 * the appropriate formatting function.
 */
export function formatFromMarkerSchema(
  markerType: string,
  format: MarkerFormatType,
  value: any
): string | null {
  switch (format) {
    case 'url':
    case 'file-path':
    case 'string':
      return value;
    case 'duration':
    case 'time':
      return formatTimestamp(value);
    case 'seconds':
      return formatSeconds(value);
    case 'milliseconds':
      return formatMilliseconds(value);
    case 'microseconds':
      return formatMicroseconds(value);
    case 'nanoseconds':
      return formatNanoseconds(value);
    case 'bytes':
      return formatBytes(value);
    case 'integer':
      return formatNumber(value, 0, 0);
    case 'decimal':
      return formatNumber(value);
    case 'percentage':
      return formatPercent(value);
    default:
      console.error(
        `A marker schema of type "${markerType}" had an unknown format "${(format: empty)}"`
      );
      return value;
  }
}
