/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { MarkerSchema } from 'firefox-profiler/types';

export const markerSchemaForTests: MarkerSchema[] = [
  {
    name: 'GCMajor',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    data: [],
  },
  {
    name: 'GCMinor',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    data: [],
  },
  {
    name: 'GCSlice',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    data: [],
  },
  {
    name: 'CC',
    tooltipLabel: 'Cycle Collect',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    data: [],
  },
  {
    name: 'FileIO',
    display: ['marker-chart', 'marker-table'],
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
      { key: 'prefName', label: 'Name', format: 'string', searchable: true },
      { key: 'prefKind', label: 'Kind', format: 'string' },
      { key: 'prefType', label: 'Type', format: 'string' },
      { key: 'prefValue', label: 'Value', format: 'string' },
    ],
  },
  {
    name: 'UserTiming',
    tooltipLabel: '{marker.data.name}',
    chartLabel: '{marker.data.name}',
    tableLabel: '{marker.data.name}',
    display: ['marker-chart', 'marker-table'],
    data: [
      { key: 'name', label: 'Name', format: 'string', searchable: true },
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
    tableLabel: '{marker.name} — {marker.data.name}',
    chartLabel: '{marker.name} — {marker.data.name}',
    display: ['marker-chart', 'marker-table'],
    data: [
      { key: 'name', label: 'Details', format: 'string', searchable: true },
    ],
  },
  {
    name: 'Log',
    display: ['marker-table'],
    tableLabel: '({marker.data.module}) {marker.data.name}',
    data: [
      { key: 'module', label: 'Module', format: 'string', searchable: true },
      { key: 'name', label: 'Name', format: 'string', searchable: true },
    ],
  },
  {
    name: 'DOMEvent',
    tooltipLabel: '{marker.data.eventType} — DOMEvent',
    tableLabel: '{marker.data.eventType}',
    chartLabel: '{marker.data.eventType}',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      { key: 'latency', label: 'Latency', format: 'duration' },
      {
        key: 'eventType',
        label: 'Event Type',
        format: 'string',
        searchable: true,
      },
    ],
  },
  {
    name: 'tracing',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      { key: 'category', label: 'Type', format: 'string', searchable: true },
    ],
  },
  {
    name: 'Layout',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      { key: 'category', label: 'Type', format: 'string', searchable: true },
    ],
  },
  {
    name: 'IPC',
    tooltipLabel: 'IPC — {marker.data.niceDirection}',
    tableLabel:
      '{marker.name} — {marker.data.messageType} — {marker.data.niceDirection}',
    chartLabel: '{marker.data.messageType}',
    display: ['marker-chart', 'marker-table', 'timeline-ipc'],
    data: [
      { key: 'messageType', label: 'Type', format: 'string' },
      { key: 'sync', label: 'Sync', format: 'string' },
      { key: 'sendThreadName', label: 'From', format: 'string' },
      { key: 'recvThreadName', label: 'To', format: 'string' },
    ],
  },
  {
    name: 'VisibleInTimelineOverview',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [],
  },
  {
    name: 'StringTesting',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      {
        key: 'searchableString',
        label: 'Searchable string field',
        format: 'string',
        searchable: true,
      },
      {
        key: 'searchableUniqueString',
        label: 'Searchable unique string field',
        format: 'unique-string',
        searchable: true,
      },
      {
        key: 'nonSearchableString',
        label: 'Non-searchable string field',
        format: 'string',
        searchable: false,
      },
      {
        key: 'nonSearchableUniqueString',
        label: 'Non-searchable unique string field',
        format: 'unique-string',
        searchable: false,
      },
    ],
  },
  {
    name: 'MarkerWithHiddenField',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [
      {
        key: 'hiddenString',
        label: 'Hidden string',
        format: 'string',
        searchable: true,
        hidden: true,
      },
    ],
  },
];
