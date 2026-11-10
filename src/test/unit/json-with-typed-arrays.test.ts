/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { jsonEncodeObjectWithTypedArraysAsRegularArrays as encode } from '../../utils/json-with-typed-arrays';

describe('jsonEncodeObjectWithTypedArraysAsRegularArrays', function () {
  it('encodes primitives the same as JSON.stringify', function () {
    expect(encode(42)).toBe('42');
    expect(encode('hello')).toBe('"hello"');
    expect(encode(null)).toBe('null');
    expect(encode(true)).toBe('true');
  });

  it('encodes a plain object the same as JSON.stringify', function () {
    const obj = { a: 1, b: 'two', c: [1, 2, 3], d: { nested: true } };
    expect(encode(obj)).toBe(JSON.stringify(obj));
  });

  it('encodes a top-level typed array as a regular array of numbers', function () {
    const arr = new Int32Array([1, 2, 3, 4]);
    expect(encode(arr)).toBe('[1,2,3,4]');
  });

  it('encodes an empty typed array as an empty array', function () {
    expect(encode(new Uint8Array())).toBe('[]');
  });

  it('handles all typed array variants', function () {
    expect(encode(new Int8Array([1, -2]))).toBe('[1,-2]');
    expect(encode(new Uint8Array([1, 2]))).toBe('[1,2]');
    expect(encode(new Uint8ClampedArray([1, 2]))).toBe('[1,2]');
    expect(encode(new Int16Array([1, -2]))).toBe('[1,-2]');
    expect(encode(new Uint16Array([1, 2]))).toBe('[1,2]');
    expect(encode(new Int32Array([1, -2]))).toBe('[1,-2]');
    expect(encode(new Uint32Array([1, 2]))).toBe('[1,2]');
    expect(encode(new Float32Array([1.5]))).toBe('[1.5]');
    expect(encode(new Float64Array([1.5]))).toBe('[1.5]');
  });

  it('encodes typed arrays nested inside an object', function () {
    const obj = {
      name: 'data',
      values: new Int32Array([10, 20, 30]),
    };
    expect(encode(obj)).toBe('{"name":"data","values":[10,20,30]}');
  });

  it('encodes typed arrays nested inside an array', function () {
    const arr = [1, new Uint8Array([2, 3]), 4];
    expect(encode(arr)).toBe('[1,[2,3],4]');
  });

  it('encodes deeply nested typed arrays', function () {
    const obj = {
      a: {
        b: {
          c: [
            { d: new Float32Array([1.5, 2.5]) },
            { e: new Int16Array([7, 8]) },
          ],
        },
      },
    };
    expect(encode(obj)).toBe('{"a":{"b":{"c":[{"d":[1.5,2.5]},{"e":[7,8]}]}}}');
  });

  it('does not mutate the original object', function () {
    const typedArr = new Int32Array([1, 2, 3]);
    const inner = { values: typedArr, label: 'x' };
    const obj = { inner, count: 2 };
    const originalKeys = Object.keys(obj);
    const innerKeys = Object.keys(inner);

    encode(obj);

    expect(obj.inner).toBe(inner);
    expect(inner.values).toBe(typedArr);
    expect(inner.label).toBe('x');
    expect(obj.count).toBe(2);
    expect(Object.keys(obj)).toEqual(originalKeys);
    expect(Object.keys(inner)).toEqual(innerKeys);
  });

  it('does not mutate the original array', function () {
    const typedArr = new Int32Array([1, 2, 3]);
    const arr = [1, typedArr, 3];

    encode(arr);

    expect(arr[1]).toBe(typedArr);
    expect(arr).toEqual([1, typedArr, 3]);
  });

  it('leaves DataView alone (encoded as a regular object)', function () {
    // DataView is excluded from typed-array handling and falls through
    // to the regular object path. JSON.stringify on a DataView produces "{}".
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    expect(encode(view)).toBe(JSON.stringify(view));
  });

  it('handles null values inside objects and arrays', function () {
    const obj = { a: null, b: [null, 1, null], c: new Int32Array([5]) };
    expect(encode(obj)).toBe('{"a":null,"b":[null,1,null],"c":[5]}');
  });

  it('handles an empty object and an empty array', function () {
    expect(encode({})).toBe('{}');
    expect(encode([])).toBe('[]');
  });

  it('preserves array element order with typed arrays interleaved', function () {
    const arr = [
      new Uint8Array([1]),
      'middle',
      new Uint8Array([2]),
      42,
      new Uint8Array([3]),
    ];
    expect(encode(arr)).toBe('[[1],"middle",[2],42,[3]]');
  });

  it('encodes the same shared typed array twice when it appears in two places', function () {
    const shared = new Int32Array([7, 8, 9]);
    const obj = { first: shared, second: shared };
    expect(encode(obj)).toBe('{"first":[7,8,9],"second":[7,8,9]}');
  });
});
