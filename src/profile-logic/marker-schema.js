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
import type {
  MarkerFormatType,
  MarkerSchema,
  MarkerSchemaByName,
  Marker,
  MarkerLabelMaker,
} from 'firefox-profiler/types';

/**
 * TODO - These will eventually be stored in the profile, but for now
 * define them here.
 */
export const markerSchema: MarkerSchema[] = [
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
    tooltipLabel: 'Cycle Collect',
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
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
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
    tooltipLabel: '{name}',
    display: ['marker-chart', 'marker-table'],
    data: [
      // name
      { label: 'Marker', value: 'UserTiming' },
      { key: 'entryType', label: 'Entry Type', format: 'string' },
      {
        label: 'Description',
        value:
          'UserTiming is created using the DOM APIs performance.mark() and performance.measure().',
      },
    ],
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
    name: 'DOMEvent',
    tooltipLabel: '{eventType}',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      { key: 'category', label: 'Marker', format: 'string' },
      // eventType is only in the tooltipLabel
    ],
  },
  {
    // TODO - Note that this marker is a "tracing" marker currently.
    // See issue #2749
    name: 'Paint',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [{ key: 'category', label: 'Type', format: 'string' }],
  },
  {
    // TODO - Note that this marker is a "tracing" marker currently.
    // See issue #2749
    name: 'Navigation',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [{ key: 'category', label: 'Type', format: 'string' }],
  },
  {
    // TODO - Note that this marker is a "tracing" marker currently.
    // See issue #2749
    name: 'Layout',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [{ key: 'category', label: 'Type', format: 'string' }],
  },
  {
    name: 'IPC',
    display: ['marker-chart', 'marker-table', 'timeline-ipc'],
    data: [
      { key: 'messageType', label: 'Type', format: 'string' },
      { key: 'sync', label: 'Sync', format: 'string' },
    ],
  },
  {
    name: 'RefreshDriverTick',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [{ key: 'name', label: 'Tick Reasons', format: 'string' }],
  },
];

/**
 * For the most part, schema is matched up by the Payload's "type" field,
 * but for practical purposes, there are a few other options, see the
 * implementation of this function for details.
 */
export function getMarkerSchemaName(marker: Marker): string {
  const { data, name } = marker;
  // Fall back to using the name if no payload exists.

  if (data) {
    const { type } = data;
    if (type === 'tracing' && data.category) {
      // TODO - Tracing markers have a duplicate "category" field.
      // See issue #2749
      return data.category;
    }
    if (type === 'Text') {
      // Text markers are a cheap and easy way to create markers with
      // a category,
      return name;
    }
    return data.type;
  }

  return name;
}

/**
 * This function takes the intended marker schema for a marker field, and applies
 * the appropriate formatting function.
 */
export function getMarkerSchema(
  markerSchemaByName: MarkerSchemaByName,
  marker: Marker
): MarkerSchema | null {
  return markerSchemaByName[getMarkerSchemaName(marker)] || null;
}

export function formatFromMarkerSchema(
  markerType: string,
  format: MarkerFormatType,
  value: any
): string {
  switch (format) {
    case 'url':
    case 'file-path':
    case 'string':
      // Make sure a truthy string is returned here. Otherwise it can break
      // grid layouts.
      return String(value) || '(empty)';
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

/**
 * Marker schema can create a dynamic tooltip label. For instance a schema with
 * a `tooltipLabel` field of "Event at {url}" would create a label based off of the
 * "url" property in the payload.
 */
export function getMarkerLabelMaker(label: string): MarkerLabelMaker {
  // Split the label on the "{key}" capture groups.
  // Each (zero-indexed) even entry will be a raw string label.
  // Each (zero-indexed) odd entry will be a key to the payload.
  //
  // e.g.
  // "asdf {foo} jkl {bar}" -> ["asdf ", "foo", " jkl ", "bar"]
  // "{foo} jkl {bar}"      -> ["", "foo", " jkl ", "bar"];
  // "{foo}"                -> ["", "foo", ""];
  const splits = label.split(/{([^}]+)}/);
  //                          {       } Split anytime text is in brackets.
  //                           (     )  Capture the text inside the brackets.
  //                            [^}]+   Match any character that is not a }.

  if (splits.length === 1) {
    // Just return the label.
    return () => label;
  }

  return data => {
    let result: string = '';
    for (let i = 0; i < splits.length; i++) {
      const part = splits[i];
      // Flip-flop between inserting a label, and looking up a value.
      if (i % 2 === 0) {
        result += part;
      } else {
        result += String(data[part]);
      }
    }
    return result;
  };
}
