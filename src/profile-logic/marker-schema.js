/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import * as React from 'react';
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
  MarkerPayload,
} from 'firefox-profiler/types';
import type { UniqueStringArray } from '../utils/unique-string-array';

/**
 * The marker schema comes from Gecko, and is embedded in the profile. However,
 * we may want to define schemas that are front-end only. This is the location
 * to do that. The schema will get merged in with the Gecko schema.
 */
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
  // Note, these can also come from Gecko, but since we have lots of special handling
  // for IPC, the Gecko ones get overwritten by this definition.
  {
    name: 'IPC',
    tooltipLabel: 'IPC — {marker.data.niceDirection}',
    tableLabel: '{marker.data.messageType} — {marker.data.niceDirection}',
    chartLabel: '{marker.data.messageType}',
    display: ['marker-chart', 'marker-table', 'timeline-ipc'],
    data: [
      { key: 'messageType', label: 'Type', format: 'string', searchable: true },
      { key: 'sync', label: 'Sync', format: 'string' },
      { key: 'sendThreadName', label: 'From', format: 'string' },
      { key: 'recvThreadName', label: 'To', format: 'string' },
      {
        key: 'otherPid',
        label: 'Other Pid',
        format: 'string',
        searchable: true,
      },
    ],
  },
  {
    // The network markers are mostly handled with custom logic. But the
    // `display` property is used to decide where to display these markers, and
    // we need it to hide them from the marker chart.
    name: 'Network',
    display: ['marker-table', 'marker-chart'],
    chartLabel: '{marker.data.URI}',
    data: [],
  },
];

/**
 * For the most part, schema is matched up by the Payload's "type" field,
 * but for practical purposes, there are a few other options, see the
 * implementation of this function for details.
 */
export function getMarkerSchemaName(
  markerSchemaByName: MarkerSchemaByName,
  markerName: string,
  markerData: MarkerPayload | null
): string {
  if (markerData) {
    const { type } = markerData;
    if (type === 'tracing' && markerData.category) {
      // TODO - Tracing markers have a duplicate "category" field.
      // See issue #2749

      // Does a marker schema for the "category" exist?
      return markerSchemaByName[markerData.category] === undefined
        ? // If not, default back to tracing
          'tracing'
        : // If so, use the category as the schema name.
          markerData.category;
    }
    if (type === 'Text') {
      // Text markers are a cheap and easy way to create markers with
      // a category. Check for schema if it exists, if not, fallback to
      // a Text type marker.
      return markerSchemaByName[markerName] === undefined ? 'Text' : markerName;
    }
    return markerData.type;
  }

  // Fall back to using the name if no payload exists.
  return markerName;
}

/**
 * This function takes the intended marker schema for a marker field, and applies
 * the appropriate formatting function.
 */
export function getSchemaFromMarker(
  markerSchemaByName: MarkerSchemaByName,
  markerName: string,
  markerData: MarkerPayload | null
): MarkerSchema | null {
  return (
    markerSchemaByName[
      getMarkerSchemaName(markerSchemaByName, markerName, markerData)
    ] || null
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
  stringTable: UniqueStringArray,
  label: string
): (Marker) => string {
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
          return (marker) => formatTimestamp(marker.start);
        case 'end':
          return (marker) =>
            marker.end === null ? 'unknown' : formatTimestamp(marker.end);
        case 'duration':
          return (marker) =>
            marker.end === null
              ? 'unknown'
              : formatTimestamp(marker.end - marker.start);
        case 'name':
          return (marker) => marker.name;
        case 'category':
          return (marker) => categories[marker.category].name;
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

      return (marker) => {
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
          ? formatFromMarkerSchema(
              markerSchema.name,
              format,
              value,
              stringTable
            )
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

type LabelKey = 'tooltipLabel' | 'tableLabel' | 'chartLabel' | 'copyLabel';

// If no label making rule, these functions provide the fallbacks for how
// to label things. It also allows for a place to do some custom handling
// in the cases where the marker schema is not enough.
const fallbacks: { [LabelKey]: (Marker) => string } = {
  tooltipLabel: (marker) => marker.name,

  chartLabel: (_marker) => '',

  tableLabel: (marker: Marker) => {
    let description = '';

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

  copyLabel: (marker) => marker.name,
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
  getMarker: (MarkerIndex) => Marker,
  markerSchemaList: MarkerSchema[],
  markerSchemaByName: MarkerSchemaByName,
  categoryList: CategoryList,
  stringTable: UniqueStringArray,
  labelKey: LabelKey
): (MarkerIndex) => string {
  // Build up a list of label functions, that are tied to the schema name.
  const labelFns: Map<string, (Marker) => string> = new Map();
  const markerNamePrefixRe = /^{marker.name}\s[-—]\s/;
  for (const schema of markerSchemaList) {
    let labelString;
    if (labelKey === 'copyLabel') {
      // When copying a marker description, use the marker table label.
      labelString = schema.tableLabel;
      if (labelString && !markerNamePrefixRe.test(labelString)) {
        // Ensure the label starts with the marker name.
        labelString = '{marker.name} — ' + labelString;
      }
    } else {
      labelString = schema[labelKey];
      // The marker table used to not show the marker name, so all marker
      // schemas included the marker name as the first part of their table
      // label. Now that the marker table has a name column, we can remove
      // this prefix to avoid duplication.
      if (labelString && labelKey === 'tableLabel') {
        labelString = labelString.replace(markerNamePrefixRe, '');
      }
    }

    if (labelString) {
      labelFns.set(
        schema.name,
        parseLabel(schema, categoryList, stringTable, labelString)
      );
    }
  }

  const getFallbackLabel = ensureExists(
    fallbacks[labelKey],
    'Unable to find a fallback label function.'
  );

  // Cache the labels as they are created.
  const markerIndexToLabel: Map<MarkerIndex, string> = new Map();

  return (markerIndex: MarkerIndex) => {
    let label = markerIndexToLabel.get(markerIndex);

    // No label exists, it will have to be generated for the first time.
    if (label === undefined) {
      const marker = getMarker(markerIndex);
      const schemaName = getMarkerSchemaName(
        markerSchemaByName,
        marker.name,
        marker.data
      );
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

/**
 * This function formats a string from a marker type and a value.
 * If you wish to get markup instead, have a look at
 * formatMarkupFromMarkerSchema below.
 */
export function formatFromMarkerSchema(
  markerType: string,
  format: MarkerFormatType,
  value: any,
  stringTable: UniqueStringArray
): string {
  if (value === undefined || value === null) {
    console.warn(
      `Formatting ${value} for ${markerType} with format ${JSON.stringify(
        format
      )}`
    );
    return '(empty)';
  }
  if (typeof format === 'object') {
    switch (format.type) {
      case 'table': {
        const { columns } = format;
        if (!(value instanceof Array)) {
          throw new Error('Expected an array for table type');
        }
        const hasHeader = columns.some((column) => column.label);
        const rows = hasHeader
          ? [columns.map((x) => x.label || '(empty)')]
          : [];
        const cellRows = value.map((row, i) => {
          if (!(row instanceof Array)) {
            throw new Error('Expected an array for table row');
          }

          if (row.length !== columns.length) {
            throw new Error(
              `Row ${i} length doesn't match column count (row: ${row.length}, cols: ${columns.length})`
            );
          }
          return row.map((cell, j) => {
            const { format } = columns[j];
            return formatFromMarkerSchema(
              markerType,
              format || 'string',
              cell,
              stringTable
            );
          });
        });
        rows.push(...cellRows);
        return rows.map((row) => `(${row.join(', ')})`).join(',');
      }
      default:
        throw new Error(
          `Unknown format type ${JSON.stringify((format.type: empty))}`
        );
    }
  }
  switch (format) {
    case 'url':
    case 'file-path':
    case 'string':
      // Make sure a non-empty string is returned here.
      return String(value) || '(empty)';
    case 'unique-string':
      return stringTable.getString(value, '(empty)');
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
    case 'list':
      if (!(value instanceof Array)) {
        throw new Error('Expected an array for list format');
      }
      return value
        .map((v) =>
          formatFromMarkerSchema(markerType, 'string', v, stringTable)
        )
        .join(', ');
    default:
      console.warn(
        `A marker schema of type "${markerType}" had an unknown format ${JSON.stringify(
          (format: empty)
        )}`
      );
      return value;
  }
}

// This regexp is used to test for URLs and remove their scheme for display.
const URL_SCHEME_REGEXP = /^http(s?):\/\//;

/**
 * This function may return structured markup for some types suchs as table,
 * list, or urls. For other types this falls back to formatFromMarkerSchema
 * above.
 */
export function formatMarkupFromMarkerSchema(
  markerType: string,
  format: MarkerFormatType,
  value: any,
  stringTable: UniqueStringArray
): React.Element<any> | string {
  if (value === undefined || value === null) {
    console.warn(`Formatting ${value} for ${JSON.stringify(markerType)}`);
    return '(empty)';
  }
  if (format !== 'url' && typeof format !== 'object' && format !== 'list') {
    return formatFromMarkerSchema(markerType, format, value, stringTable);
  }
  if (typeof format === 'object') {
    switch (format.type) {
      case 'table': {
        const { columns } = format;
        if (!(value instanceof Array)) {
          throw new Error('Expected an array for table type');
        }
        const hasHeader = columns.some((column) => column.label);
        return (
          <table className="marker-table-value">
            {hasHeader ? (
              <thead>
                <tr>
                  {columns.map((col, i) => (
                    <th key={i}>{col.label || ''}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {value.map((row, i) => {
                if (!(row instanceof Array)) {
                  throw new Error('Expected an array for table row');
                }

                if (row.length !== columns.length) {
                  throw new Error(
                    `Row ${i} length doesn't match column count (row: ${row.length}, cols: ${columns.length})`
                  );
                }
                return (
                  <tr key={i}>
                    {row.map((cell, i) => {
                      return (
                        <td key={i}>
                          {formatMarkupFromMarkerSchema(
                            markerType,
                            columns[i].type || 'string',
                            cell,
                            stringTable
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      }
      default:
        throw new Error(
          `Unknown format type ${JSON.stringify((format: empty))}`
        );
    }
  }
  switch (format) {
    case 'list':
      if (!(value instanceof Array)) {
        throw new Error('Expected an array for list format');
      }
      return (
        <ul className="marker-list-value">
          {value.map((entry, i) => (
            <li key={i}>
              {formatFromMarkerSchema(
                markerType,
                'string',
                value[i],
                stringTable
              )}
            </li>
          ))}
        </ul>
      );
    case 'url': {
      if (!URL_SCHEME_REGEXP.test(value)) {
        return value;
      }
      return (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="marker-link-value"
        >
          {value.replace(URL_SCHEME_REGEXP, '')}
        </a>
      );
    }
    default:
      throw new Error(`Unknown format type ${JSON.stringify((format: empty))}`);
  }
}

/**
 * Takes a marker and a RegExp and checks if any of its `searchable` marker
 * payload fields match the search regular expression.
 */
export function markerPayloadMatchesSearch(
  markerSchema: MarkerSchema,
  marker: Marker,
  searchRegExp: RegExp
): boolean {
  const { data } = marker;
  if (!data) {
    return false;
  }

  // Reset regexp for each marker. Otherwise state from previous
  // usages can cause matches to fail if the search is global or
  // sticky.
  searchRegExp.lastIndex = 0;

  // Check if searchable fields match the search regular expression.
  for (const payloadField of markerSchema.data) {
    if (payloadField.searchable) {
      const value = data[payloadField.key];
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (searchRegExp.test(value)) {
        return true;
      }
    }
  }

  return false;
}
