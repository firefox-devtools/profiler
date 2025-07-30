/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file implements functions that we can use in fluent translation files.

import { FluentDateTime } from '@fluent/bundle';

// These types come from Fluent's typescript types. We'll be able to remove them
// and directly import Fluent's types when we switch to Typescript.

interface Scope {
  reportError(error: unknown): void;
}

export type FluentValue = FluentType<unknown> | string;

export type FluentFunction = (
  positional: Array<FluentValue>,
  named: { [key: string]: FluentValue }
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
} as const;

/**
 * This function takes a timestamp as a parameter. It's similar to the builtin
 * DATE but it changes the date format depending on the proximity of the date
 * from the current date.
 */
export const SHORTDATE: FluentFunction = (args, _named) => {
  const date = args[0];
  const nowTimestamp = Date.now();

  // Convert FluentValue to number for calculations
  const dateValue = +date;
  const timeDifference = nowTimestamp - dateValue;
  if (timeDifference < 0 || timeDifference > ONE_YEAR_IN_MS) {
    return new FluentDateTime(dateValue, DATE_FORMATS.ancient);
  }
  if (timeDifference > ONE_DAY_IN_MS) {
    return new FluentDateTime(dateValue, DATE_FORMATS.thisYear);
  }
  return new FluentDateTime(dateValue, DATE_FORMATS.thisDay);
};