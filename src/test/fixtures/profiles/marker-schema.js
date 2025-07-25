/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { MarkerSchema } from 'firefox-profiler/types';

export const markerSchemaForTests: MarkerSchema[] = [
  {
    name: 'GCMajor',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    fields: [],
  },
  {
    name: 'GCMinor',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    fields: [],
  },
  {
    name: 'GCSlice',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    fields: [],
  },
  {
    name: 'CC',
    tooltipLabel: 'Cycle Collect',
    display: ['marker-chart', 'marker-table', 'timeline-memory'],
    fields: [],
  },
  {
    name: 'FileIO',
    display: ['marker-chart', 'marker-table'],
    fields: [
      {
        key: 'operation',
        label: 'Operation',
        format: 'string',
      },
      {
        key: 'source',
        label: 'Source',
        format: 'string',
      },
      {
        key: 'filename',
        label: 'Filename',
        format: 'file-path',
      },
    ],
  },
  {
    name: 'MediaSample',
    display: ['marker-chart', 'marker-table'],
    fields: [
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
    fields: [
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
    fields: [
      { key: 'prefName', label: 'Name', format: 'string' },
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
    fields: [
      { key: 'name', label: 'Name', format: 'string' },
      { key: 'entryType', label: 'Entry Type', format: 'string' },
    ],
    description:
      'UserTiming is created using the DOM APIs performance.mark() and performance.measure().',
  },
  {
    name: 'Text',
    tableLabel: '{marker.name} — {marker.data.name}',
    chartLabel: '{marker.name} — {marker.data.name}',
    display: ['marker-chart', 'marker-table'],
    fields: [{ key: 'name', label: 'Details', format: 'string' }],
  },
  {
    name: 'Log',
    display: ['marker-table'],
    tableLabel: '({marker.data.module}) {marker.data.name}',
    fields: [
      { key: 'module', label: 'Module', format: 'string' },
      { key: 'name', label: 'Name', format: 'string' },
    ],
  },
  {
    name: 'DOMEvent',
    tooltipLabel: '{marker.data.eventType} — DOMEvent',
    tableLabel: '{marker.data.eventType}',
    chartLabel: '{marker.data.eventType}',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    fields: [
      { key: 'latency', label: 'Latency', format: 'duration' },
      {
        key: 'eventType',
        label: 'Event Type',
        format: 'string',
      },
    ],
  },
  {
    name: 'tracing',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    fields: [{ key: 'category', label: 'Type', format: 'string' }],
  },
  {
    name: 'Layout',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    fields: [{ key: 'category', label: 'Type', format: 'string' }],
  },
  {
    name: 'IPC',
    tooltipLabel: 'IPC — {marker.data.niceDirection}',
    tableLabel:
      '{marker.name} — {marker.data.messageType} — {marker.data.niceDirection}',
    chartLabel: '{marker.data.messageType}',
    display: ['marker-chart', 'marker-table', 'timeline-ipc'],
    fields: [
      { key: 'messageType', label: 'Type', format: 'string' },
      { key: 'sync', label: 'Sync', format: 'string' },
      { key: 'sendThreadName', label: 'From', format: 'string' },
      { key: 'recvThreadName', label: 'To', format: 'string' },
    ],
  },
  {
    name: 'VisibleInTimelineOverview',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    fields: [],
  },
  {
    name: 'StringTesting',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    fields: [
      {
        key: 'string',
        label: 'string field',
        format: 'string',
      },
      {
        key: 'uniqueString',
        label: 'unique string field',
        format: 'unique-string',
      },
    ],
  },
  {
    name: 'MarkerWithHiddenField',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    fields: [
      {
        key: 'hiddenString',
        label: 'Hidden string',
        format: 'string',
        hidden: true,
      },
    ],
  },
];
