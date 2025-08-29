/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at <http://mozilla.org/MPL/2.0/>. */

import { coerce, coerceMatchingShape } from 'firefox-profiler/utils/types';

type CoerceA = { startTime: number };
type CoerceB = { startTime: number; endTime: number };
type CoerceC = number;

const coerceA: CoerceA = { startTime: 0 };
const coerceB: CoerceB = coerce<CoerceA, CoerceB>(coerceA);
// @ts-expect-error - The coercion produces the correct value.
const _coerceC: CoerceC = coerce<CoerceA, CoerceB>(coerceA) as any;
// @ts-expect-error - The coercion must take the correct value.
const _coerceB2: CoerceB = coerce<CoerceA, CoerceB>(coerceB) as any;

// These variables test type coercion behavior
coerceMatchingShape<CoerceA>({ startTime: 0 });
coerceMatchingShape<CoerceB>({ startTime: 0 });
// @ts-expect-error - The coercion must take the correct value.
const _coerceMatchingShape3 = coerceMatchingShape<CoerceB>({ time: 0 } as any);
