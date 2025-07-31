/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */
// @flow
/* eslint-disable no-unused-vars */

import { coerce, coerceMatchingShape } from 'firefox-profiler/utils/flow';

type CoerceA = { startTime: number };
type CoerceB = { startTime: number, endTime: number };
type CoerceC = number;

const coerceA: CoerceA = { startTime: 0 };
const coerceB: CoerceB = coerce<CoerceA, CoerceB>(coerceA);
// $FlowExpectError - The coercion produces the correct value.
const coerceC: CoerceC = coerce<CoerceA, CoerceB>(coerceA);
// $FlowExpectError - The coercion must take the correct value.
const coerceB2: CoerceB = coerce<CoerceA, CoerceB>(coerceB);

const coerceMatchingShape1 = coerceMatchingShape<CoerceA>({ startTime: 0 });
const coerceMatchingShape2 = coerceMatchingShape<CoerceB>({ startTime: 0 });
// $FlowExpectError - The coercion must take the correct value.
const coerceMatchingShape3 = coerceMatchingShape<CoerceB>({ time: 0 });
