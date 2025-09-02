// Comes from https://github.com/sindresorhus/pretty-bytes/blob/master/index.js
// MIT license: https://github.com/sindresorhus/pretty-bytes/blob/master/license
// Copied here because we needed it in ES2015 module form. Also flow-typed.
// Otherwise not modified.

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

export default (num: number): string => {
  if (!Number.isFinite(num)) {
    throw new TypeError(`Expected a finite number, got ${typeof num}: ${num}`);
  }

  const neg = num < 0;

  if (neg) {
    num = -num;
  }

  if (num < 1) {
    return (neg ? '-' : '') + num + ' B';
  }

  const exponent = Math.min(Math.floor(Math.log10(num) / 3), UNITS.length - 1);
  const numStr = Number((num / Math.pow(1000, exponent)).toPrecision(3));
  const unit = UNITS[exponent];

  return (neg ? '-' : '') + numStr + ' ' + unit;
};
