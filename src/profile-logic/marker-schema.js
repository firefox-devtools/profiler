/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { oneLine } from 'common-tags';
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
import { ensureExists } from '../utils/flow';
import type {
  CategoryList,
  MarkerFormatType,
  MarkerSchema,
  MarkerSchemaByName,
  Marker,
  MarkerIndex,
} from 'firefox-profiler/types';

/**
 * TODO - These will eventually be stored in the profile, but for now
 * define them here.
 */
export const markerSchemaGecko: MarkerSchema[] = [
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
    tableLabel: '{marker.name} — {marker.data.name}',
    chartLabel: '{marker.name} — {marker.data.name}',
    display: ['marker-chart', 'marker-table'],
    data: [{ key: 'name', label: 'Details', format: 'string' }],
  },
  {
    name: 'Log',
    display: ['marker-table'],
    tableLabel: '({marker.data.module}) {marker.data.name}',
    data: [
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
    data: [
      { key: 'latency', label: 'Latency', format: 'duration' },
      // eventType is in the payload as well.
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
    name: 'RefreshDriverTick',
    display: ['marker-chart', 'marker-table', 'timeline-overview'],
    data: [{ key: 'name', label: 'Tick Reasons', format: 'string' }],
  },
  {
    // The schema is mostly handled with custom logic.
    name: 'Network',
    display: ['marker-table'],
    data: [],
  },
];

export const markerSchemaFrontEndOnly: MarkerSchema[] = [
  {
    name: 'Jank',
    display: ['marker-table', 'marker-chart'],
    tooltipLabel: 'Jank – event processing delay',
    tableLabel: 'Event processing delay',
    data: [
      {
        label: 'Description',
        value: oneLine`
          Jank markers show when the main event loop of a thread has been busy. It is
          a good indicator that there may be some kind of performance problem that
          is worth investigating.
        `,
      },
    ],
  },
];

/**
 * For the most part, schema is matched up by the Payload's "type" field,
 * but for practical purposes, there are a few other options, see the
 * implementation of this function for details.
 */
export function getMarkerSchemaName(
  markerSchemaByName: MarkerSchemaByName,
  marker: Marker
): string {
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
      // a category. Check for schema if it exists, if not, fallback to
      // a Text type marker.
      return markerSchemaByName[name] === undefined ? 'Text' : name;
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
  return (
    markerSchemaByName[getMarkerSchemaName(markerSchemaByName, marker)] || null
  );
}

/**
 * Marker schema can create a dynamic tooltip label. For instance a schema with
 * a `tooltipLabel` field of "Event at {marker.data.url}" would create a label based
 * off of the "url" property in the payload.
 *
 * Note that this is only exported for unit tests.
 */
export function parseLabel(
  markerSchema: MarkerSchema,
  categories: CategoryList,
  label: string
): Marker => string {
  // Split the label on the "{key}" capture groups.
  // Each (zero-indexed) even entry will be a raw string label.
  // Each (zero-indexed) odd entry will be a key to the payload.
  //
  // e.g.
  // "asdf {marker.name} jkl {marker.data.bytes}"
  //   -> ["asdf ", "marker.name", " jkl ", "marker.data.bytes"]
  //
  // "{marker.name} jkl {marker.data.bytes}"
  //   -> ["", "marker.name", " jkl ", "marker.data.bytes"];
  //
  // "{marker.name}"
  //   -> ["", "marker.name", ""];
  const splits = label.split(/{([^}]+)}/);
  //                          {       } Split anytime text is in brackets.
  //                           (     )  Capture the text inside the brackets.
  //                            [^}]+   Match any character that is not a }.

  if (splits.length === 1) {
    // Return the label.
    return () => label;
  }

  /**
   * Notify the user via the console if there is a parse error, but don't crash
   * anything for the end user. Return a blank string.
   */
  function parseError(label: string, part: string) {
    console.error(oneLine`
      Error processing the label "${label}" because of the ${part}.
      Currently the labels in the marker schema take the form of
      "marker.data.keyName" or "marker.startTime". No other type
      of access is currently supported.
    `);
    return () => '';
  }

  // This is a list of functions that will compute each part of the label.
  const computeLabelParts: Array<(Marker) => string> = splits.map((part, i) => {
    if (i % 2 === 0) {
      // This is a normal string part. Return it.
      // Given: "Marker information: {marker.name} – {marker.data.info}"
      // Handle: ^^^^^^^^^^^^^^^^^^^^             ^^^
      return () => part;
    }
    // Now consider each keyed property:
    // Given: "Marker information: {marker.name} – {marker.data.info}"
    // Handle:                      ^^^^^^^^^^^     ^^^^^^^^^^^^^^^^

    const keys = part.trim().split('.');

    if (keys.length !== 2 && keys.length !== 3) {
      // The following examples would trigger this error:
      // Given: "Marker information: {name} – {marker.data.info.subinfo}"
      // Handle:                      ^^^^     ^^^^^^^^^^^^^^^^^^^^^^^^
      return parseError(label, part);
    }

    const [marker, markerKey, payloadKey] = keys;
    if (marker !== 'marker') {
      // The following examples would trigger this error:
      // Given: "Value: {property.name}"
      // Handle:         ^^^^^^^^
      return parseError(label, part);
    }

    if (keys.length === 2) {
      // Access parts of the payload
      // Given: "Marker information: {marker.name} – {marker.data.info}"
      // Handle:                      ^^^^^^^^^^^
      switch (markerKey) {
        case 'start':
          return marker => formatTimestamp(marker.start);
        case 'end':
          return marker =>
            marker.end === null ? 'unknown' : formatTimestamp(marker.end);
        case 'duration':
          return marker =>
            marker.end === null
              ? 'unknown'
              : formatTimestamp(marker.end - marker.start);
        case 'name':
          return marker => marker.name;
        case 'category':
          return marker => categories[marker.category].name;
        case 'data':
        default:
          return parseError(label, part);
      }
    }

    if (markerKey === 'data') {
      // This is accessing the payload.
      // Given: "Marker information: {marker.name} – {marker.data.info}"
      // Handle:                                      ^^^^^^^^^^^^^^^^

      let format = null;
      for (const rule of markerSchema.data) {
        // The rule.value === undefined line is odd mainly because Flow was having trouble
        // refining the type.
        if (rule.value === undefined && rule.key === payloadKey) {
          format = rule.format;
          break;
        }
      }

      return marker => {
        if (!marker.data) {
          // There was no data.
          return '';
        }

        const value = marker.data[payloadKey];
        if (value === undefined || value === null) {
          // This would return "undefined" or "null" otherwise.
          return '';
        }
        return format
          ? formatFromMarkerSchema(markerSchema.name, format, value)
          : value;
      };
    }

    return parseError(label, part);
  });

  return (marker: Marker) => {
    let result: string = '';
    for (const computeLabelPart of computeLabelParts) {
      result += computeLabelPart(marker);
    }
    return result;
  };
}

type LabelKey = 'tooltipLabel' | 'tableLabel' | 'chartLabel';

// If no label making rule, these functions provide the fallbacks for how
// to label things. It also allows for a place to do some custom handling
// in the cases where the marker schema is not enough.
const fallbacks: { [LabelKey]: (Marker) => string } = {
  tooltipLabel: marker => marker.name,

  chartLabel: _marker => '',

  tableLabel: (marker: Marker) => {
    let description = marker.name;

    if (marker.data) {
      const data = marker.data;
      switch (data.type) {
        case 'FileIO':
          if (data.source) {
            description = `(${data.source}) `;
          }
          description += data.operation;
          if (data.filename) {
            description = data.operation
              ? `${description} — ${data.filename}`
              : data.filename;
          }
          break;
        default:
      }
    }
    return description;
  },
};

/**
 * Marker labels are computed dynamically. In an effort to keep this process efficient
 * in a reactive environment, this function creates a memoized function that takes a
 * MarkerIndex and returns the label for a given area. This label is cached between
 * calls. The label maker function parses the marker schema to determine how to process
 * and display the label.
 *
 * This function should only be used behind a selector.
 */
export function getLabelGetter(
  getMarker: MarkerIndex => Marker,
  markerSchemaList: MarkerSchema[],
  markerSchemaByName: MarkerSchemaByName,
  categoryList: CategoryList,
  labelKey: LabelKey
): MarkerIndex => string {
  // Build up a list of label functions, that are tied to the schema name.
  const labelFns: Map<string, (Marker) => string> = new Map();
  for (const schema of markerSchemaList) {
    const labelString = schema[labelKey];
    if (labelString) {
      labelFns.set(schema.name, parseLabel(schema, categoryList, labelString));
    }
  }

  const getFallbackLabel = ensureExists(
    fallbacks[labelKey],
    'Unable to find a fallback label function.'
  );

  // Cache the labels as they are creaetd.
  const markerIndexToLabel: Map<MarkerIndex, string> = new Map();

  return (markerIndex: MarkerIndex) => {
    let label = markerIndexToLabel.get(markerIndex);

    // No label exists, it will have to be generated for the first time.
    if (label === undefined) {
      const marker = getMarker(markerIndex);
      const schemaName = getMarkerSchemaName(markerSchemaByName, marker);
      const applyLabel = labelFns.get(schemaName);

      label = applyLabel
        ? // A label function is available, apply it.
          applyLabel(marker)
        : // There is no label function, fall back to a different strategy.
          getFallbackLabel(marker);

      // Make sure and cache this, so that the result can be re-used.
      markerIndexToLabel.set(markerIndex, label);
    }

    return label;
  };
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
      // Make sure a non-empty string is returned here.
      if (value === undefined || value === null) {
        return '(empty)';
      }
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
