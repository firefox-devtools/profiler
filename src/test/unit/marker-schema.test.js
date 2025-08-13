/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  formatFromMarkerSchema,
  formatMarkupFromMarkerSchema,
  parseLabel,
  markerSchemaFrontEndOnly,
} from '../../profile-logic/marker-schema';
import type { MarkerSchema, Marker } from 'firefox-profiler/types';
import { getDefaultCategories } from '../../profile-logic/data-structures';
import { storeWithProfile } from '../fixtures/stores';
import { getMarkerSchema } from '../../selectors/profile';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { markerSchemaForTests } from '../fixtures/profiles/marker-schema';
import { StringTable } from '../../utils/string-table';

/**
 * Generally, higher level type of testing is preferred to detailed unit tests of
 * implementation behavior, but the marker schema labels use a custom mini-parser, and
 * it would be easy for them to have errors. These tests cover a variety of different
 * code branches, especially parse errors.
 */
describe('marker schema labels', function () {
  type LabelOptions = {|
    schemaFields: $PropertyType<MarkerSchema, 'fields'>,
    label: string,
    payload: any,
  |};

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  function applyLabel(options: LabelOptions): string {
    const { schemaFields, label, payload } = options;
    const categories = getDefaultCategories();
    const stringTable = StringTable.withBackingArray([
      'IPC Message',
      'MouseDown Event',
    ]);

    const schema = {
      name: 'TestDefinedMarker',
      display: [],
      fields: schemaFields,
    };

    const marker: Marker = {
      start: 2,
      end: 5,
      name: 'TestDefinedMarker',
      category: 0,
      threadId: 1,
      data: payload,
    };
    const getter = parseLabel(schema, categories, stringTable, label);

    // There is only one marker, marker 0
    return getter(marker);
  }

  it('can parse very simple labels', function () {
    expect(
      applyLabel({
        label: 'Just text',
        schemaFields: [],
        payload: {},
      })
    ).toEqual('Just text');
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('can parse a label with just a lookup value', function () {
    expect(
      applyLabel({
        label: '{marker.data.duration}',
        schemaFields: [
          { key: 'duration', label: 'Duration', format: 'seconds' },
        ],
        payload: { duration: 12345 },
      })
    ).toEqual('12.345s');
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('can parse a label with surrounding text', function () {
    expect(
      applyLabel({
        label: 'It took {marker.data.duration} for this test.',
        schemaFields: [
          { key: 'duration', label: 'Duration', format: 'seconds' },
        ],
        payload: { duration: 12345 },
      })
    ).toEqual('It took 12.345s for this test.');
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('can mix and match lookups', function () {
    expect(
      applyLabel({
        label: 'It took {marker.data.duration}, which is {marker.data.ratio}',
        schemaFields: [
          { key: 'duration', label: 'Duration', format: 'seconds' },
          { key: 'ratio', label: 'Ratio', format: 'percentage' },
        ],
        payload: {
          duration: 12345,
          ratio: 0.12345,
        },
      })
    ).toEqual('It took 12.345s, which is 12%');
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('is empty if there is no information in a payload', function () {
    expect(
      applyLabel({
        label: 'This will be nothing: "{marker.data.nokey}"',
        schemaFields: [
          { key: 'duration', label: 'Duration', format: 'seconds' },
        ],
        payload: { duration: 12345 },
      })
    ).toEqual('This will be nothing: ""');
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('can look up various parts of the marker', function () {
    const text = applyLabel({
      label: [
        'Start: {marker.start}',
        'End: {marker.end}',
        'Duration: {marker.duration}',
        'Name: {marker.name}',
        'Category: {marker.category}',
      ].join('\n'),
      schemaFields: [],
      payload: {},
    });

    expect(text.split('\n')).toEqual([
      'Start: 2ms',
      'End: 5ms',
      'Duration: 3ms',
      'Name: TestDefinedMarker',
      'Category: Other',
    ]);
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  it('can parse labels with unique strings', function () {
    expect(
      applyLabel({
        label: '{marker.data.message} happened because of {marker.data.event}',
        schemaFields: [
          { key: 'message', label: 'Message', format: 'unique-string' },
          { key: 'event', label: 'Event', format: 'unique-string' },
        ],
        payload: {
          message: 0,
          event: 1,
        },
      })
    ).toEqual('IPC Message happened because of MouseDown Event');
    expect(console.error).toHaveBeenCalledTimes(0);
  });

  describe('parseErrors', function () {
    function testParseError(label: string) {
      expect(
        applyLabel({
          label,
          schemaFields: [
            { key: 'duration', label: 'Duration', format: 'seconds' },
          ],
          payload: { duration: 12345 },
        })
      ).toEqual('Parse error: ""');
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error.mock.calls).toMatchSnapshot();
    }

    // eslint-disable-next-line jest/expect-expect
    it('errors if not looking up into a marker', function () {
      testParseError('Parse error: "{duration}"');
    });

    // eslint-disable-next-line jest/expect-expect
    it('errors if looking up into a part of the marker that does not exist', function () {
      testParseError('Parse error: "{marker.nothing}"');
    });

    // eslint-disable-next-line jest/expect-expect
    it('errors when accessing random properties', function () {
      testParseError('Parse error: "{property.value}"');
    });

    // eslint-disable-next-line jest/expect-expect
    it('errors when accessing twice into a payload', function () {
      testParseError('Parse error: "{marker.data.duration.extra}"');
    });
  });
});

describe('marker schema formatting', function () {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('can apply a variety of formats', function () {
    const entries = [
      ['url', 'http://example.com'],
      ['file-path', '/Users/me/gecko'],
      ['file-path', null],
      ['file-path', undefined],
      ['sanitized-string', 'domain.name'],
      ['duration', 0],
      ['duration', 10],
      ['duration', 12.3456789],
      ['duration', 123456.789],
      ['duration', 23456789],
      ['duration', 50000],
      ['duration', 2000000],
      ['duration', 50000000],
      ['duration', 123456789],
      ['duration', 0.000123456],
      ['duration', 1000 * 60 - 501], // slightly less than 1min, should not be shown as '60s'
      ['duration', 1000 * 60 - 500], // slightly less than 1min, should not be shown as '60s'
      ['duration', 1000 * 60 + 1], // slightly more than 1min, should not be shown as '1min0s'
      ['duration', 779873.639], // '13min60s' should be rounded to '14min'
      ['duration', 1000 * 3600 - 501], // 1h - 501ms slightly less than 1h, should be shown as '59min59s'
      ['duration', 1000 * 3600 - 500], // 1h - 500s slightly less than 1h, should be shown as '1h', not '0h60min'
      ['duration', 1000 * 3600 + 1], // slightly more than 1h, should not be shown as '1h0min'
      ['duration', 1000 * 3600 * 24 - 31 * 1000], // 1d - 31s, should be shown as '23h59min'
      ['duration', 1000 * 3600 * 24 - 30 * 1000], // 1d - 30s, should be shown as '1d', not '0d24h'
      ['duration', 1000 * 3600 * 24 + 1], // slightly more than 1 day, should not be shown as '1d0h'
      ['time', 12.3456789],
      ['seconds', 0],
      ['seconds', 10],
      ['seconds', 12.3456789],
      ['seconds', 123456.789],
      ['seconds', 0.000123456],
      ['milliseconds', 0],
      ['milliseconds', 10],
      ['milliseconds', 12.3456789],
      ['milliseconds', 123456.789],
      ['milliseconds', 0.000123456],
      ['microseconds', 0],
      ['microseconds', 10],
      ['microseconds', 12.3456789],
      ['microseconds', 123456.789],
      ['microseconds', 0.000123456],
      ['nanoseconds', 0],
      ['nanoseconds', 10],
      ['nanoseconds', 12.3456789],
      ['nanoseconds', 123456.789],
      ['nanoseconds', 0.000123456],
      ['bytes', 0],
      ['bytes', 10],
      ['bytes', 12.3456789],
      ['bytes', 123456.789],
      ['bytes', 123456789],
      ['bytes', 123456789123],
      ['bytes', 0.000123456],
      ['integer', 0],
      ['integer', 10],
      ['integer', 12.3456789],
      ['integer', 123456.789],
      ['integer', 0.000123456],
      ['decimal', 0],
      ['decimal', 10],
      ['decimal', 12.3456789],
      ['decimal', 123456.789],
      ['decimal', 0.000123456],
      ['percentage', 0],
      ['percentage', 0.1],
      ['percentage', 0.123456789],
      ['percentage', 1234.56789],
      ['percentage', 0.000123456],
      ['pid', '2322'],
      ['tid', '2427'],
      ['unique-string', 0], // Should be "IPC Message", see "stringTable" in "applyLabel" fn
      ['unique-string', 1], // Should be "MouseDown Event", see "stringTable" in "applyLabel" fn
      ['unique-string', null], // Should be "(empty)"
      ['unique-string', undefined], // Should be "(empty)"
      ['unique-string', 42], // Should be "(empty)"
    ];

    expect(
      entries.map(
        ([format, value]) =>
          format +
          ' - ' +
          formatFromMarkerSchema(
            'none',
            format,
            value,
            StringTable.withBackingArray(['IPC Message', 'MouseDown Event'])
          )
      )
    ).toMatchInlineSnapshot(`
      Array [
        "url - http://example.com",
        "file-path - /Users/me/gecko",
        "file-path - (empty)",
        "file-path - (empty)",
        "sanitized-string - domain.name",
        "duration - 0s",
        "duration - 10ms",
        "duration - 12.346ms",
        "duration - 2m3s",
        "duration - 6h31m",
        "duration - 50s",
        "duration - 33m20s",
        "duration - 13h53m",
        "duration - 1d10h",
        "duration - 123.46ns",
        "duration - 59.499s",
        "duration - 1m",
        "duration - 1m",
        "duration - 13m",
        "duration - 59m59s",
        "duration - 1h",
        "duration - 1h",
        "duration - 23h59m",
        "duration - 1d",
        "duration - 1d",
        "time - 12.346ms",
        "seconds - 0s",
        "seconds - 0.010s",
        "seconds - 0.012s",
        "seconds - 123.46s",
        "seconds - 0.000s",
        "milliseconds - 0ms",
        "milliseconds - 10ms",
        "milliseconds - 12ms",
        "milliseconds - 123,457ms",
        "milliseconds - 0.000ms",
        "microseconds - 0μs",
        "microseconds - 10μs",
        "microseconds - 12μs",
        "microseconds - 123,457μs",
        "microseconds - 0.000μs",
        "nanoseconds - 0ns",
        "nanoseconds - 10.0ns",
        "nanoseconds - 12.3ns",
        "nanoseconds - 123,457ns",
        "nanoseconds - 0.0001ns",
        "bytes - 0B",
        "bytes - 10B",
        "bytes - 12B",
        "bytes - 121 KiB",
        "bytes - 118 MiB",
        "bytes - 115 GiB",
        "bytes - 0.000B",
        "integer - 0",
        "integer - 10",
        "integer - 12",
        "integer - 123,457",
        "integer - 0",
        "decimal - 0",
        "decimal - 10",
        "decimal - 12",
        "decimal - 123,457",
        "decimal - 0.000",
        "percentage - 0%",
        "percentage - 10%",
        "percentage - 12%",
        "percentage - 123,457%",
        "percentage - 0.0%",
        "pid - PID: 2322",
        "tid - TID: 2427",
        "unique-string - IPC Message",
        "unique-string - MouseDown Event",
        "unique-string - (empty)",
        "unique-string - (empty)",
        "unique-string - (empty)",
      ]
    `);
  });

  it('supports complex formats', function () {
    const entries = [
      ['url', 'http://example.com'],
      ['file-path', '/Users/me/gecko'],
      ['file-path', null],
      ['file-path', undefined],
      ['duration', 0],
      ['duration', 10],
      ['duration', 12.3456789],
      [
        { type: 'table', columns: [{ type: 'string' }, { type: 'integer' }] },
        [
          ['a', 1],
          ['b', 2],
        ],
      ],
      [
        {
          type: 'table',
          columns: [
            { type: 'string', label: 'a' },
            { type: 'integer', label: 'b' },
          ],
        },
        [['b', 2]],
      ],
      [
        {
          type: 'table',
          columns: [{ type: 'string', label: 'a' }, { type: 'integer' }],
        },
        [['b', 2]],
      ],
      [
        { type: 'table', columns: [{ type: 'string', label: 'a' }, {}] },
        [['b', 2]],
      ],
      ['list', []],
      ['list', ['a', 'b']],
    ];
    const stringTable = StringTable.withBackingArray([]);
    expect(
      entries.map(([format, value]) => [
        format,
        value,
        formatMarkupFromMarkerSchema('none', format, value, stringTable),
        formatFromMarkerSchema('none', format, value, stringTable),
      ])
    ).toMatchSnapshot();
  });
});

describe('getMarkerSchema', function () {
  it('combines front-end and Gecko marker schema', function () {
    const { profile } = getProfileFromTextSamples('A');
    profile.meta.markerSchema = markerSchemaForTests;
    const { getState } = storeWithProfile(profile);
    const combinedSchema = getMarkerSchema(getState());

    // Find front-end only marker schema.
    expect(
      profile.meta.markerSchema.find((schema) => schema.name === 'Jank')
    ).toBeUndefined();
    expect(
      markerSchemaFrontEndOnly.find((schema) => schema.name === 'Jank')
    ).toBeTruthy();
    expect(
      combinedSchema.find((schema) => schema.name === 'Jank')
    ).toBeTruthy();

    // Find the Gecko only marker schema.
    expect(
      profile.meta.markerSchema.find((schema) => schema.name === 'GCMajor')
    ).toBeTruthy();
    expect(
      markerSchemaFrontEndOnly.find((schema) => schema.name === 'GCMajor')
    ).toBeUndefined();
    expect(
      combinedSchema.find((schema) => schema.name === 'GCMajor')
    ).toBeTruthy();
  });
});
