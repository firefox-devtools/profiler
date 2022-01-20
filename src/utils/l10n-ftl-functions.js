/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import {
  FluentDateTime,
  FluentNumber,
  FluentNone,
  type FluentBundle,
} from '@fluent/bundle';

// These types come from Fluent's typescript types. We'll be able to remove them
// and directly import Fluent's types when we switch to Typescript.

interface Scope {
  bundle: FluentBundle;
  reportError(error: mixed): void;
}

export type FluentValue = FluentType<mixed> | string;

export type FluentFunction = (
  positional: Array<FluentValue>,
  named: { [string]: FluentValue }
) => FluentValue;

/**
 * The `FluentType` class is the base of Fluent's type system.
 *
 * Fluent types wrap JavaScript values and store additional configuration for
 * them, which can then be used in the `toString` method together with a proper
 * `Intl` formatter.
 */
export class FluentType<T> {
  /** The wrapped native value. */
  value: T;

  /**
   * Create a `FluentType` instance.
   *
   * @param value The JavaScript value to wrap.
   */
  constructor(value: T) {
    this.value = value;
  }

  /**
   * Unwrap the raw value stored by this `FluentType`.
   */
  valueOf(): T {
    return this.value;
  }

  /**
   * Format this instance of `FluentType` to a string.
   *
   * Formatted values are suitable for use outside of the `FluentBundle`.
   * This method can use `Intl` formatters available through the `scope`
   * argument.
   */
  toString(_scope: Scope): string {
    throw new Error('Please implement toString in inherited classes.');
  }
}

/* --- Date formatting --- */

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const ONE_YEAR_IN_MS = 365 * ONE_DAY_IN_MS;

const DATE_FORMATS = {
  thisDay: { hour: 'numeric', minute: 'numeric' },
  thisYear: {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  },
  ancient: {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  },
};

export const SHORTDATE: FluentFunction = (args, _named) => {
  const date = args[0];
  const nowTimestamp = Date.now();

  const timeDifference = nowTimestamp - +date;
  if (timeDifference < 0 || timeDifference > ONE_YEAR_IN_MS) {
    return new FluentDateTime(date, DATE_FORMATS.ancient);
  }
  if (timeDifference > ONE_DAY_IN_MS) {
    return new FluentDateTime(date, DATE_FORMATS.thisYear);
  }
  return new FluentDateTime(date, DATE_FORMATS.thisDay);
};

/* --- Number formatting --- */
/**
 * Format a positive float into a string.
 *
 * Try to format the value to with `significantDigits` significant digits as
 * much as possible but without using scientific notation.  The number of
 * decimal places depends on the value: the closer to zero the value is, the
 * more decimal places are used in the resulting string.  No more than
 * `maxFractionalDigits` decimal places will be used.
 *
 * For example, using significantDigits = 2 (the default), these are the
 * intended results with the en-US locale:
 *
 * 123     => "123"
 * 12.3    =>  "12"
 * 1.23    =>   "1.2"
 * 0.01234 =>   "0.012"
 */
export function getNumberForFluent(
  value: number,
  significantDigits: number = 2,
  maxFractionalDigits: number = 3,
  style: 'decimal' | 'percent' = 'decimal'
) {
  /*
   * Note that numDigitsOnLeft can be negative when the first non-zero digit
   * is on the right of the decimal point.  0.01 = -1
   */
  let numDigitsOnLeft = Math.floor(Math.log10(Math.abs(value))) + 1;
  if (style === 'percent') {
    // We receive percent values as `0.4` but display them as `40`, so we
    // should add `2` here to account for this difference.
    numDigitsOnLeft += 2;
  }
  let places = significantDigits - numDigitsOnLeft;
  if (places < 0) {
    places = 0;
  } else if (places > maxFractionalDigits) {
    places = maxFractionalDigits;
  }

  const numberFormatOptions = {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
    style,
  };
  return new FluentNumber(value, numberFormatOptions);
}

class FluentIdWithValue extends FluentType<FluentNumber> {
  _l10nId: string;
  constructor(value: FluentNumber, l10nId: string) {
    super(value);
    this._l10nId = l10nId;
  }
  toString(scope: Scope) {
    const { bundle } = scope;
    const pattern = bundle.getMessage(this._l10nId);
    if (!pattern) {
      scope.reportError(
        new Error(`Couldn't find a pattern with id ${this._l10nId}`)
      );
      return new FluentNone(this.value.valueOf());
    }

    return bundle.formatPattern(pattern.value, { value: this.value });
  }
}

export const HBYTES: FluentFunction = (args, named) => {
  const arg = args[0];
  if (!(arg instanceof FluentNumber)) {
    return new FluentNone(`NUMBER(${String(arg)})`);
  }

  const bytes = arg.valueOf();
  const significantDigits =
    named.significantDigits && named.significantDigits instanceof FluentNumber
      ? named.significantDigits.valueOf()
      : 3;
  const maxFractionalDigits =
    named.maxFractionalDigits &&
    named.maxFractionalDigits instanceof FluentNumber
      ? named.maxFractionalDigits.valueOf()
      : 2;

  let l10nId, value;

  if (bytes < 10000) {
    // Use singles up to 10,000.  I think 9,360B looks nicer than 9.36KB.
    // We use "0" for significantDigits because bytes will always be integers.
    l10nId = 'NumberFormat--bytes';
    value = getNumberForFluent(bytes, 0);
  } else if (bytes < 1024 ** 2) {
    l10nId = 'NumberFormat--kibibytes';
    value = getNumberForFluent(
      bytes / 1024,
      significantDigits,
      maxFractionalDigits
    );
  } else if (bytes < 1024 ** 3) {
    l10nId = 'NumberFormat--mebibytes';
    value = getNumberForFluent(
      bytes / 1024 ** 2,
      significantDigits,
      maxFractionalDigits
    );
  } else {
    l10nId = 'NumberFormat--gibibytes';
    value = getNumberForFluent(
      bytes / 1024 ** 3,
      significantDigits,
      maxFractionalDigits
    );
  }

  return new FluentIdWithValue(value, l10nId);
};
